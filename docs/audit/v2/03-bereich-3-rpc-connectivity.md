# Bereich 3 — RPC & Blockchain-Konnektivität

**Auditor:** Senior Auditor (extern, second pass)
**Stand:** 2026-04-18
**Scope:** `packages/backend/src/services/blockchain.ts` (Provider-Konstruktion, `FallbackProvider`-Setup, `queryFilterChunked`, `validateChainId`), `packages/backend/src/lib/rpcRetry.ts` (Retry-Logik), `packages/backend/src/services/json-file-event-store.ts` (Sync-Watchdog, Block-Tracking), `packages/backend/src/routes/health.ts` (RPC-Diagnostik), `packages/backend/src/config.ts` (RPC-URL-Parsing), `packages/backend/src/server.ts` (Boot-Sequenz, CSP), `.env.production.example` (Operator-Defaults).
**Methodik:** Manuelle Code-Review, Hypothesen-getrieben (siehe `00-audit-plan-v2.md` Bereich 3 + erweitert um H3.1–H3.7 aus dem Briefing), Reproduktions-Szenarien für jedes Finding mit konkreten Block-Zahlen und Latenz-Schätzungen.
**Hinweis:** Bereich 3 ist **NEU im V2-Audit**. V1 hatte keinen RPC-Audit. Es gibt keine V1-Findings, die hier obsolet werden.

## Zusammenfassung

Der RPC-Stack ist ein gut gewachsenes Konstrukt aus reaktiven Production-Fixes (siehe Git-History: `0a381a3` Batching aus, `3c05708` FallbackProvider, `4b39a97` Alchemy-Filter, `2c12f31` Sync-Watchdog). Die offensichtlichen V1-Klassen-Probleme (Single-Provider-SPOF, Free-Tier-Batches, Alchemy-`eth_getLogs`-Cap) sind alle adressiert. **Was fehlt, sind die strukturellen Resilience-Layer:** Circuit-Breaker, Inkrementelle Sync-Persistierung, Cross-Provider-Konsistenz, fail-fast-Boot-Validation. Plus: einige Operator-UX-Footguns im `.env.production.example`.

Severity-Tally Bereich 3: 🔴 0 / 🟠 4 / 🟡 5 / ⚪ 2.

Die kritischste Klasse ist die Cross-Provider-Inkonsistenz (F3.1) kombiniert mit der nicht-inkrementellen Sync-Persistierung (F3.2): zusammen führen sie zu einem System, das unter Production-Stress sowohl Daten verliert (Event-Lücken im Cache) als auch nie aufholen kann (Watchdog killed jeden Sync vor der Persistierung).

---

## 🟠 F3.1 — Cross-Provider Block-Number-Mismatch → permanente Event-Lücke im Cache

### Belege

`packages/backend/src/services/json-file-event-store.ts:135-219` (`runSync`):

- Zeile 137: `const latestBlock = await provider.getBlockNumber()` — liest über die Schreib-/Read-Provider-Chain `provider`.
- Zeilen 146-163: `await Promise.all([queryFilterChunked(...), ...])` — vier parallele Aufrufe.
- Zeile 218: `this.store.lastSyncedBlock = latestBlock` — speichert den `provider`-Wert.

`packages/backend/src/services/blockchain.ts:476-505` (`queryFilterChunked`):

- Zeile 485: `const evContract = eventReadOnlyContract` — verwendet IMMER `eventProvider`-Pfad.
- Zeile 487: `const latestBlock = await withRpcRetry(() => eventProvider.getBlockNumber(), …)` — liest über die separate `eventProvider`-Chain.

### Problem

Zwei getrennte Provider-Chains liefern bei jedem Sync-Zyklus zwei unabhängige `getBlockNumber()`-Antworten. Wird `lastSyncedBlock` auf den höheren Wert (`provider`) gesetzt, während die Queries nur bis zum niedrigeren Wert (`eventProvider`) liefen, **werden die dazwischen liegenden Blöcke permanent übersprungen.**

Die zwei Chains sind in Production typischerweise unterschiedlich besetzt:

- `provider` = `[Alchemy (priority 1), mainnet.base.org, publicnode, drpc]` (oder ähnlich, je nach `RPC_URL`).
- `eventProvider` = `[mainnet.base.org, publicnode, drpc]` — Alchemy auto-gefiltert (`blockchain.ts:170`).

Alchemy paid antwortet typischerweise schneller und hat kürzeren Block-Lag als mainnet.base.org (Coinbase's Edge cached aggressiv) und publicnode (community-operated, gelegentlich 1–3 Blöcke hinten). Bei `quorum: 1` gewinnt der schnellste Sub-Provider — also typisch Alchemy für `provider.getBlockNumber()` und mainnet.base.org/publicnode für `eventProvider.getBlockNumber()`.

### Reproduktion (konkret)

Annahme: aktueller On-chain-Tip = Block 18 100, `lastSyncedBlock = 18 000`.

**Sync-Lauf 1:**

1. `provider.getBlockNumber()` → Alchemy antwortet 18 100.
2. `fromBlock = 18 001`, läuft kein Early-Return.
3. Vier parallele `queryFilterChunked(...)`-Calls. Jeder ruft intern `eventProvider.getBlockNumber()` → mainnet.base.org cached, antwortet 18 050.
4. Jeder Call queryt `[18 001, 18 050]`.
5. `this.store.lastSyncedBlock = 18 100` (Provider-Wert).
6. `save()`.

Wenn in Block 18 075 ein `PointsAwarded`-Event emittiert wurde (Student claim't seine Punkte), wird er in diesem Sync nicht erfasst (eventProvider sah ihn nicht).

**Sync-Lauf 2 (60s später):**

1. `lastSyncedBlock = 18 100`, `fromBlock = 18 101`. eventProvider sieht jetzt 18 200.
2. Queries `[18 101, 18 200]`.
3. **Block 18 075 wird NIE wieder gequeryt.** Event verloren.

### Konsequenzen

| Off-chain-Konsument                                                    | Drift-Effekt                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Admin-Dashboard `/api/v1/surveys` (`survey-cache.ts:32`)               | OK — Live-Reads von `getSurveyInfo`.                                                                         |
| `/api/v1/wallets/:addr/points` (Event-Store-Reads für Aufschlüsselung) | **Drift: Punkte fehlen** in der historischen Anzeige. Gesamt-Saldo via `getTotalPoints` (Live-Read) korrekt. |
| `/api/v1/admin/list` via `getCurrentAdmins` (`event-store.ts:272`)     | **Drift: ein in der Lücke granted/revoked Admin wird übersehen.** Critical bei Audit-Trail-Anforderung.      |
| `getAdminAddresses`-Fallback (`blockchain.ts:511`)                     | Cold-path mit `fromBlock=0` — konsistent in dem Pfad, weil Single-Caller.                                    |

**Kritischste Implikation:** Wenn Admin Joris einen Admin granted in Block 18 075 (in der Lücke) und einen anderen Admin revoked in Block 18 130 (außerhalb), zeigt der Cache den granted-Admin nicht. Über Zeit treibt der Cache vom On-chain-State weg — und genau das ist das Anti-Versprechen eines Blockchain-basierten Systems.

### Fix

**Variante A (minimal-invasiv, empfohlen):** `queryFilterChunked` muss `latestBlock` als Parameter empfangen, nicht selbst ermitteln.

```typescript
async function queryFilterChunked(
  _ignoredContract: ethers.Contract,
  filter: ethers.ContractEventName,
  fromBlock: number,
  toBlock: number, // <-- NEU
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const evContract = eventReadOnlyContract
  const chunkSize = config.chunkSize
  if (toBlock - fromBlock <= chunkSize) {
    return withRpcRetry(() => evContract.queryFilter(filter, fromBlock, toBlock), {
      label: 'queryFilter',
    })
  }
  const results: (ethers.EventLog | ethers.Log)[] = []
  for (let start = fromBlock; start <= toBlock; start += chunkSize + 1) {
    const end = Math.min(start + chunkSize, toBlock)
    const chunk = await withRpcRetry(() => evContract.queryFilter(filter, start, end), {
      label: 'queryFilter',
    })
    results.push(...chunk)
  }
  return results
}
```

```typescript
// json-file-event-store.ts:runSync
const latestBlock = await eventProvider.getBlockNumber() // <-- jetzt eventProvider!
const fromBlock = this.store.lastSyncedBlock
  ? this.store.lastSyncedBlock + 1
  : config.contractDeployBlock || 0
if (fromBlock > latestBlock) return

await Promise.all([
  queryFilterChunked(readOnlyContract, ...filter, fromBlock, latestBlock),
  // ... alle Aufrufe explizit mit `latestBlock`
])

this.store.lastSyncedBlock = latestBlock // <-- jetzt eventProvider's value
```

Plus für die anderen Aufrufer in `blockchain.ts` (`getPointsAwardedEvents`, `getSurveyRegisteredEvents`, `getAdminAddresses`):

```typescript
const latestBlock = await withRpcRetry(() => eventProvider.getBlockNumber(), {
  label: 'getBlockNumber',
})
const events = await queryFilterChunked(readOnlyContract, filter, fromBlock, latestBlock)
```

**Plus Test:**

```typescript
it('runSync uses eventProvider block number consistently', async () => {
  // mock provider.getBlockNumber → 18100
  // mock eventProvider.getBlockNumber → 18050
  // run sync, assert lastSyncedBlock === 18050 (NOT 18100)
})
```

### 2-Jahre-Begründung

Über 2 Jahre laufen tausende Sync-Zyklen. Die Provider-Lag-Differenz tritt statistisch in jeder N-ten Sync auf — typisch 1–3 Blöcke (= 2–6 Sekunden auf Base). Die Ereignisse, die in diesem Window passieren (Studentenclaims am Ende einer Klassen-Aktion, Admin-Operationen während Stress) haben die HÖCHSTE Wahrscheinlichkeit, im Drift verloren zu gehen, weil sie genau in den heißen Phasen passieren. Über 24 Monate akkumuliert das zu einer Cache-Realität, die sich von der On-chain-Wahrheit unterscheidet.

---

## 🟠 F3.2 — Cold-Sync-Crash-Loop bei `CONTRACT_DEPLOY_BLOCK=0` + 45s-Watchdog ohne Persistierung

### Belege

`.env.production.example:18-19`:

```
# Block number at which the contract was deployed (speeds up event queries)
CONTRACT_DEPLOY_BLOCK=0
```

`packages/backend/src/services/json-file-event-store.ts:50`:

```typescript
private static readonly SYNC_TIMEOUT_MS = 45_000
```

`packages/backend/src/services/json-file-event-store.ts:135-228` (`runSync`):

- Zeile 218: `this.store.lastSyncedBlock = latestBlock` wird **erst nach erfolgreichem Abschluss aller vier `queryFilterChunked`-Calls UND aller `getBlockTimestamps`-Calls UND der vier For-Loops** gesetzt.
- Zeile 219: `this.save()` ebenso erst danach.

`packages/backend/src/services/json-file-event-store.ts:113-132` (`sync`-Watchdog): `Promise.race([runSync, timeout(45_000)])` killt den Sync nach 45s.

### Problem

Wenn ein Operator (Tippfehler, Copy-Paste vom Example, neuer Plesk-Worker mit nicht-migriertem `.env`) `CONTRACT_DEPLOY_BLOCK=0` hat, läuft `runSync` von Block 0. Base Mainnet hat per April 2026 ~30 Mio Blöcke. Mit `chunkSize=9000` sind das **3 333 Chunks pro Event-Filter, × 4 Filter = 13 333 RPC-Calls**, plus pro gefundenem Event 1 zusätzlicher `provider.getBlock()` für den Timestamp.

Realistische Latenz pro Chunk gegen mainnet.base.org/publicnode: 200–800 ms. Untere Schätzung: 13 333 × 200 ms ≈ **44 Minuten**. Obere mit Retries auf 429 in Klassen-Last: 1–2 Stunden.

`SYNC_TIMEOUT_MS = 45 000` (45 Sekunden). Nach 45s wirft die Watchdog-`Promise.race` einen Reject. **Der Code persistiert in dieser Zeit GAR NICHTS** — `lastSyncedBlock` und `save()` sind erst am Ende von `runSync`. Bei Watchdog-Abbruch ist alle Arbeit verloren.

Das passiert nicht einmal, sondern bei jedem Sync-Zyklus erneut. Default-Sync-Interval (`config.syncIntervalMs=60000`) feuert alle 60s einen neuen `runSync`, der wieder bei Block 0 startet, wieder nach 45s gekillt wird. **Crash-Loop bis zum Ende der Zeit oder bis ein Operator den `CONTRACT_DEPLOY_BLOCK` korrekt setzt.**

Zusätzliche Konsequenzen:

- `eventStore.isReady()` (`json-file-event-store.ts:291-293`) prüft `lastSyncedBlock > 0` → bleibt FALSE.
- `/health/ready` (`routes/health.ts:42`) gibt `degraded` 503 zurück. Plesk Passenger könnte das als Health-Fail interpretieren → automatischer Worker-Respawn → noch mehr Cold-Sync-Loops.
- Die 13 333 RPC-Calls landen auf den public RPCs → throttling (siehe F3.3) → DRpc/publicnode könnten den Server-Fingerprint blocken nach Quota-Verletzung.

### Reproduktion

```bash
# Plesk-Server mit frischem .env aus .env.production.example
RPC_URL=https://mainnet.base.org
CONTRACT_ADDRESS=0x8b8Ed86...   # echter V2-Proxy
MINTER_PRIVATE_KEY=0x...
CONTRACT_DEPLOY_BLOCK=0          # <-- Default
EXPECTED_CHAIN_ID=8453

pnpm --filter backend start
```

Beobachtung: Server bootet, validateChainId passes, `eventStore.start()` ruft `sync()`, Watchdog kickt nach 45s mit `Sync watchdog (>45000ms)` im Log, `lastSyncedBlock` bleibt 0, `isReady` false, `/health/ready` 503. Wiederholt sich alle 60s. Nach 1h: ~60 Watchdog-Failures, ~30 Mio Chunks angefangen aber nie persistiert.

### Fix

**1) Inkrementelle Persistierung in `runSync`** (das wichtigste):

```typescript
private async runSync(): Promise<void> {
  const latestBlock = await eventProvider.getBlockNumber()  // <-- aus F3.1
  let cursor = this.store.lastSyncedBlock
    ? this.store.lastSyncedBlock + 1
    : config.contractDeployBlock || 0

  if (cursor > latestBlock) return

  const chunkSize = config.chunkSize
  while (cursor <= latestBlock) {
    const end = Math.min(cursor + chunkSize, latestBlock)
    const adminRole = await this.getAdminRoleHash()
    const [surveyEvents, pointsEvents, grantEvents, revokeEvents] = await Promise.all([
      withRpcRetry(() => eventReadOnlyContract.queryFilter(
        eventReadOnlyContract.filters.SurveyRegistered(), cursor, end,
      ), { label: 'queryFilter.SurveyRegistered' }),
      withRpcRetry(() => eventReadOnlyContract.queryFilter(
        eventReadOnlyContract.filters.PointsAwarded(), cursor, end,
      ), { label: 'queryFilter.PointsAwarded' }),
      withRpcRetry(() => eventReadOnlyContract.queryFilter(
        eventReadOnlyContract.filters.RoleGranted(adminRole), cursor, end,
      ), { label: 'queryFilter.RoleGranted' }),
      withRpcRetry(() => eventReadOnlyContract.queryFilter(
        eventReadOnlyContract.filters.RoleRevoked(adminRole), cursor, end,
      ), { label: 'queryFilter.RoleRevoked' }),
    ])

    // process this chunk's events into this.store...
    this.store.lastSyncedBlock = end                        // <-- persist EVERY chunk
    this.save()
    cursor = end + 1
  }
}
```

Dann ist die 45s-Watchdog kein Drama mehr: ein Sync wird nach 45s abgebrochen, aber `lastSyncedBlock` ist beim letzten erfolgreich verarbeiteten Chunk persistiert. Der nächste Sync (60s später) macht weiter wo aufgehört wurde. 30M Blöcke / 9000 = 3300 Chunks ÷ ~150 Chunks pro 45s = ~22 Sync-Zyklen × 60s ≈ 22 Minuten bis komplett, statt nie.

**2) Bessere Doku in `.env.production.example`:**

```
# Block number at which the contract was deployed.
# CRITICAL: must match the actual deploy block of CONTRACT_ADDRESS.
# A wrong value causes either:
#   - cold-sync over millions of blocks (if too low) — minutes to hours of degraded /health/ready
#   - missing historical events (if too high) — admin/award history will be incomplete
# Look up via BaseScan: https://basescan.org/address/<CONTRACT_ADDRESS> → first tx block.
# Base Mainnet V2 proxy was deployed at block: <REPLACE_ME>
CONTRACT_DEPLOY_BLOCK=33000000
```

**3) Boot-Time-Sanity-Check:**

```typescript
async function validateContractDeployBlock(): Promise<void> {
  const latest = await provider.getBlockNumber()
  const deployBlock = config.contractDeployBlock
  if (deployBlock === 0 || latest - deployBlock > 1_000_000) {
    logger.warn(
      { deployBlock, latest, gap: latest - deployBlock },
      'CONTRACT_DEPLOY_BLOCK is more than 1M blocks behind chain tip — cold sync will take a long time. ' +
        'Set CONTRACT_DEPLOY_BLOCK to the actual proxy deploy block to speed this up.',
    )
  }
}
```

### 2-Jahre-Begründung

In 2 Jahren wird das Backend wahrscheinlich mehrfach neu deployt (Plesk-Migration, Hosting-Wechsel, Disaster-Recovery, neuer Forschender übernimmt das Projekt). Jede Recovery-Operation, bei der `data/events.json` verloren geht, triggert genau diesen Cold-Sync. Wenn der dann nicht durchläuft, ist das Backend nicht produktionsreif in dem Moment, wo es Recovery-fähig sein muss — der schlimmste Zeitpunkt für einen Bug.

---

## 🟠 F3.3 — Kein Circuit-Breaker bei alle-RPCs-throttled, DoS-Self-Amplifikation

### Belege

`packages/backend/src/lib/rpcRetry.ts:21-23`:

```typescript
const DEFAULT_RETRIES = 4
const DEFAULT_INITIAL_DELAY_MS = 250
const DEFAULT_MAX_DELAY_MS = 4000
```

`packages/backend/src/lib/rpcRetry.ts:80-95`: pro-Call Retry-Loop ohne globalen State.

`packages/backend/src/services/blockchain.ts:120-134`: FallbackProvider mit `quorum: 1` rennt alle Sub-Provider parallel.

### Problem

Kein Circuit-Breaker, kein Backoff über Aufrufe hinweg, kein Provider-Cooldown. `withRpcRetry` ist pro-Call. Wenn `getBalance` und `hasClaimed` parallel laufen und der primäre Provider throttled ist, machen BEIDE Aufrufe parallel die volle Retry-Loop durch. Es gibt keinen geteilten Zustand „dieser Provider ist gerade out, schick eine Weile nichts mehr hin".

Konsequenz bei Klassen-Run (30 Studierende claimen parallel innerhalb 2 Minuten):

- Pro Claim: ~3 reads (`getBalance`, `hasClaimed`, ggf. `getSurveyInfo` via Cache) plus 1 Write.
- Plus alle 60s `eventStore.sync()` mit 4 parallelen `queryFilterChunked`-Bursts.
- Plus jeder `/health/ready`-Probe von einem Monitoring triggert opportunistic Sync (`routes/health.ts:35-37`).

Jeder dieser Reads geht durch den FallbackProvider mit `quorum: 1`. ethers v6 startet alle Sub-Provider parallel. Bei 4 Sub-Providern: **4 outbound HTTP-Verbindungen pro Read**. Bei Failure jedes Sub-Providers und 4 Retries: bis zu **16 outbound Requests pro 1 inbound User-Request**.

Wenn der eigene Klassen-Run die public RPCs in Throttle-Mode treibt, kicken wir uns selbst — Self-DoS-Amplifikation 1:16.

Plus: `withRpcRetry.isTransient()` (`lib/rpcRetry.ts:25-62`) ist großzügig — `429`, `5xx`, Timeout, ECONNRESET, viele Patterns. Was als „ich versuch's nochmal" gedacht war, wird in einem echten Outage zu einer Schleife, die jedem Provider noch mehr Last gibt.

### Reproduktion

```text
30 Studierende klicken zeitgleich auf "Claim" in der SoSci-Survey.
Alchemy Free Tier hat 25 req/s, andere RPCs ähnlich.

Was passiert:
- Backend macht ~90 reads in den ersten 5 Sekunden
- FallbackProvider macht daraus ~360 outbound (90 × 4 Sub-Provider)
- public RPCs throttlen mit 429
- withRpcRetry retried 4× je read mit 250→500→1000→2000ms Backoff
- Sleep-Sum pro read: 3.85s, plus FallbackProvider stallTimeout 4×2s = 8s pro Race-Failure
- Worst case pro read: ~32s
- 30 parallele Claims × 32s = Express-Workers blockiert > Plesk-Idle-Timeout
- Studierende bekommen 502/Timeout vom Plesk-Reverse-Proxy
```

### Fix

**Variante A — pro-Provider Circuit-Breaker (mittel-aufwändig, sauber):**

Eigener Wrapper um `JsonRpcProvider`, der nach N consecutive failures pausiert:

```typescript
// lib/circuit-breaker-provider.ts
import { ethers } from 'ethers'

export class CircuitBreakerProvider extends ethers.JsonRpcProvider {
  private failures = 0
  private openUntil = 0
  private readonly threshold = 3
  private readonly cooldownMs = 30_000

  async send(method: string, params: any[]): Promise<any> {
    if (Date.now() < this.openUntil) {
      throw new Error(`circuit-breaker open for ${this._getConnection().url}`)
    }
    try {
      const result = await super.send(method, params)
      this.failures = 0
      return result
    } catch (err) {
      this.failures += 1
      if (this.failures >= this.threshold) {
        this.openUntil = Date.now() + this.cooldownMs
        this.failures = 0
      }
      throw err
    }
  }
}
```

FallbackProvider sieht den Throw und routet zur nächsten Sub-Provider. Globaler Effekt: ein throttled Provider wird für 30s aus dem Race rausgenommen.

**Variante B — pro-Read globales Token-Bucket-Limit (einfach, sofort wirksam):**

```typescript
// lib/rpc-token-bucket.ts
class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()
  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {
    this.tokens = capacity
  }
  async acquire(): Promise<void> {
    while (true) {
      const elapsed = (Date.now() - this.lastRefill) / 1000
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec)
      this.lastRefill = Date.now()
      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

const rpcBucket = new TokenBucket(20, 10) // 20 burst, 10/s sustained — TUNE for tier

export async function withRpcRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  await rpcBucket.acquire() // <-- NEW: throttle local before remote
  // ... rest unchanged
}
```

Backend drückt die public RPCs nicht mehr über deren Limits. Studierende sehen ggf. ein paar 100ms zusätzliche Latenz, aber kein 502/Timeout.

**Empfehlung:** **B + A**. B ist 50 Zeilen Code, sofort wirksam. A ist die strukturell richtige Lösung.

**Operativ:** Alchemy Growth Tier ($49/Monat = $588/Jahr) mit 660 CU/s und kein 10-Block-Cap würde die Symptome strukturell entschärfen. Bei HSBI-Forschungsbudget Null muss intern bewertet werden. Alternative: Coinbase Cloud, Base eigener Service, oder lokaler Erigon-Node auf einem HSBI-Server (CPU + 2 TB SSD). Diese Optionen sind außerhalb des Code-Scopes und müssen mit IT-Operations entschieden werden — die hier vorgeschlagenen Code-Fixes (B + A) lösen das Problem ohne Geld auszugeben.

### 2-Jahre-Begründung

Klassen-Runs sind genau die Stress-Events, für die das System gebaut wird. Wenn der Schmerz-Zyklus „Klassen-Run startet → public RPCs throttlen → Backend timeoutet → 502er → Joris muss live debuggen" über 2 Jahre auch nur viermal passiert, ist die Reputation des Systems im Fakultätsdiskurs hin. Plus: ein RPC-Provider-Wechsel oder eine Limit-Änderung macht das aktuelle Setup schlagartig kaputt. Resilience muss im Code sein, nicht im operativen Glück.

---

## 🟠 F3.4 — `validateChainId` ist Default-No-Op + Race mit Server-Listen

### Belege

`packages/backend/src/services/blockchain.ts:551-564`:

```typescript
export async function validateChainId(): Promise<void> {
  if (!config.expectedChainId) return // <-- silent no-op
  // ...
}
```

`packages/backend/src/config.ts:75-80`:

```typescript
expectedChainId: process.env.EXPECTED_CHAIN_ID || undefined,
```

`.env.production.example:1-26` — **erwähnt `EXPECTED_CHAIN_ID` nicht.**

`packages/backend/src/server.ts:117-129`:

```typescript
const app = createApp()
const server = app.listen(config.port, () => {
  // <-- accept traffic IMMEDIATELY
  logger.info({ port: config.port }, 'VPP Backend listening')
})

validateChainId() // <-- runs in parallel
  .then(() => {
    logger.info('Chain ID validation passed')
  })
  .catch((err) => {
    logger.fatal({ err }, 'Chain ID validation failed — shutting down')
    process.exit(1) // <-- exit AFTER serving requests
  })
```

### Problem

Drei separate Defekte:

1. **Default-Verhalten ist no-op.** `EXPECTED_CHAIN_ID` ist nicht im `.env.production.example`, also setzt es niemand. `validateChainId` macht in 99% der Setups gar nichts.

2. **Race zwischen `app.listen` und `validateChainId`.** Server akzeptiert HTTP-Requests in dem Moment wo `app.listen` aufgerufen ist. `validateChainId().catch(... process.exit(1))` läuft parallel. RTT zur RPC bei Cold-Start ~50–500 ms. In diesem Window kann ein eingehender `/api/v1/claim` gegen eine möglicherweise falsche Chain durchlaufen.

3. **`process.exit(1)` während Requests laufen.** Wenn `validateChainId` failed während ein Claim mitten im `awardPoints` ist, killt der `process.exit(1)` den Prozess hart — TX könnte gesendet sein, Receipt nicht gewartet, Nonce-Store hat marked-used aber kein on-chain `_claimed` ist gesetzt. Student permanent blocked.

### Konkretes Failure-Szenario

```bash
# Joris kopiert sein Test-Backend von Sepolia auf eine neue Plesk-Instanz für Mainnet-Production.
# Setzt:
RPC_URL=https://sepolia.base.org           # <-- VERGESSEN auf mainnet zu ändern
CONTRACT_ADDRESS=0x8b8Ed86...              # <-- Mainnet-V2-Proxy
MINTER_PRIVATE_KEY=0x...                   # <-- Mainnet-Minter
# Kein EXPECTED_CHAIN_ID gesetzt.
```

Backend ruft `awardPoints` am Mainnet-Adressraum gegen Sepolia-RPC auf → CALL_EXCEPTION „no contract at address". Frontend zeigt „Server-Error". Studierende blocked. `validateChainId()` hätte das gefangen, wenn `EXPECTED_CHAIN_ID=8453` gesetzt wäre.

Umgekehrt-Variante (gefährlicher):

```bash
# Joris testet auf Sepolia, vergisst nach Test wieder auf Mainnet zurückzustellen.
# Mainnet-Studierende claimen.
# Backend ruft awardPoints am Sepolia-Adressraum gegen Sepolia-RPC.
# Adresse zufällig auch Sepolia-Contract → TX geht durch
# → On Sepolia werden Punkte gemined
# → On Mainnet ist nichts passiert
# → Mainnet-Wallet zeigt 0 Punkte, Sepolia-Wallet zeigt korrekte Punkte
# → Forensisch nur sichtbar wenn jemand die TX-Hashes auf BaseScan checkt
# → Stiller Datenverlust + falsche Pseudonymitäts-Annahmen (Sepolia-On-Chain ist öffentlich)
```

### Fix

**1) Boot-Validation BEFORE listen, nicht parallel:**

```typescript
async function bootstrap() {
  if (!config.expectedChainId) {
    logger.warn(
      'EXPECTED_CHAIN_ID is not set — chain ID validation skipped. ' +
        'Strongly recommended in production: 8453 (Base Mainnet) or 84532 (Base Sepolia).',
    )
  }
  await validateChainId()
  await validateContractDeployed() // <-- Bonus, siehe unten
  logger.info('Boot validations passed')

  const app = createApp()
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'VPP Backend listening')
  })

  const eventStore = getEventStore()
  eventStore.start().catch((err) => {
    logger.error({ err }, 'Event store initial sync failed')
  })

  // ... shutdown handlers
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Boot failed — exiting')
  process.exit(1)
})
```

**2) Doku in `.env.production.example`:**

```
# Expected chain ID. The backend refuses to start if RPC_URL points to a
# different chain. STRONGLY recommended in production to prevent
# cross-chain misconfiguration accidents.
#   8453  = Base Mainnet (production)
#   84532 = Base Sepolia (staging)
EXPECTED_CHAIN_ID=8453
```

**3) Bonus — Contract-Existence-Check beim Boot:**

```typescript
async function validateContractDeployed(): Promise<void> {
  const code = await provider.getCode(config.contractAddress)
  if (code === '0x' || code.length < 4) {
    const network = await provider.getNetwork()
    throw new Error(
      `No contract code at ${config.contractAddress} on chain ${network.chainId}. ` +
        'Wrong CONTRACT_ADDRESS or wrong RPC_URL?',
    )
  }
}
```

→ Würde das gefährliche Szenario „Sepolia-Adresse, Mainnet-Backend" abfangen, das `validateChainId` allein nicht abfängt.

### 2-Jahre-Begründung

Der Wechsel zwischen Sepolia und Mainnet passiert in der Forschungsphase mehrfach. Jeder Wechsel ist ein Tippfehler-Risiko. Über 24 Monate wird mindestens einmal die falsche Chain stehen — und genau in dem Moment ist es wichtig, dass das Backend laut „nein" sagt, statt still falsche TXs abzusetzen.

---

## 🟡 F3.5 — Stale-Block-Reads → Minter-Gas-Drain + UX-Bug bei Race-Conditions

### Belege

ethers v6 FallbackProvider hat kein eingebautes Block-Number-Skew-Check zwischen Sub-Providern. `quorum: 1` first-response-wins, ohne Cross-Validation.

`packages/contracts/contracts/SurveyPointsV2.sol:211`:

```solidity
if (_claimed[student][surveyId]) revert AlreadyClaimed(student, surveyId);
```

→ On-chain ist die Single-Claim-Invariante geschützt. Die Korrektheit des Systems hängt nicht vom Backend-Read ab.

### Problem

`provider.getBlockNumber()` und `provider.call(... at "latest")` können bei einem hinterher-hinkenden Sub-Provider Stale-State zurückgeben. Konkret bei mainnet.base.org (Coinbase-Edge cached aggressiv, beobachtet 5–30 Sekunden Block-Lag in heißen Phasen).

**Race-Szenario im Claim-Flow (Variante mit zwei verschiedenen Tokens):**

1. Token 1 Claim erfolgreich, Block 18 020.
2. Sekunden später Token 2 Claim mit anderem Nonce. Nonce-Store sagt: nicht used. Backend ruft `hasClaimed(A, 42)`. Stale-Provider antwortet false (sieht noch Block 18 015).
3. Backend ruft `awardPoints(A, 42)` → on-chain revert mit `AlreadyClaimed(A, 42)` (Block 18 030).
4. Backend bekommt CALL_EXCEPTION, returned 500 to client. **Aber:** Nonce-Store hat den Nonce in `claim.ts` schon `markUsed()` BEFORE `awardPoints` gemarkt. Nonce permanent verbrannt. Student kann mit diesem Token nicht mehr.
5. Minter zahlt ~30k Gas für die Revert-TX. Bei 30 Studierenden in Klassen-Run und 5% Race-Quote: 1.5 Reverts × 30k Gas × 0.05 Mwei/Gas = 0.00225 ETH ≈ $7 pro Klassen-Run. Akkumuliert über 50 Klassen-Runs/Jahr = $350.

**Variante mit Admin-Operations:**

`middleware/auth.ts` ruft pro Admin-Request `blockchain.isAdmin(addr)`. Wenn Admin gerade revoked wurde, aber FallbackProvider noch Stale-State sieht (TTL bis zu 30s), gewährt Backend Zugriff. Window für gerade-revoked Ex-Admin, Operationen auszuführen.

### Fix (D ist der wirksamste, einfachste Schritt)

**A — `cacheTimeout: 0` im FallbackProvider** (Defense-in-depth):

```typescript
return new ethers.FallbackProvider(subProviders, undefined, {
  quorum: 1,
  cacheTimeout: 0, // <-- disable internal eth_call cache
})
```

**D — `claim.ts`-Wrapper für `AlreadyClaimed`-Idempotenz:**

```typescript
try {
  await blockchain.awardPoints(wallet, surveyId)
} catch (err) {
  if (isAlreadyClaimedRevert(err)) {
    // The on-chain state already has a successful claim — this means
    // the backend's read of hasClaimed was stale. The user has already
    // received points; their token is just being re-tried needlessly.
    await nonceStore.unmarkUsed(`${surveyId}:${nonce}`)
    return res.status(200).json({
      success: true,
      message: 'Already claimed (idempotent)',
    })
  }
  throw err
}

function isAlreadyClaimedRevert(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const rec = err as Record<string, unknown>
  const data = (rec.data as string | undefined) ?? ''
  // AlreadyClaimed(address,uint256) selector
  return data.startsWith('0x...selector...')
}
```

→ Adressiert Gas-Drain UND UX-Bug, ohne FallbackProvider-Internals zu ändern.

**Empfehlung:** **D als sofort-Fix**, **A optional zur Defense-in-depth**.

### 2-Jahre-Begründung

Stale-Reads sind ein Klassiker und passieren immer öfter, je mehr Last das System hat. In 2 Jahren mit 50+ Klassen-Runs sind das $300–500 verbranntes Gas, plus regelmäßige Support-Tickets „mein Punkt kommt nicht an". Plus: ein revoked Ex-Admin, der noch 30s lang `removeAdmin(joris)` aufrufen kann, ist ein Blocker-Pfad in einer Compromise-Untersuchung — kombiniert mit F1.1 (Minter-ADMIN_ROLE) groß.

---

## 🟡 F3.6 — Single-Provider-Fallthrough deaktiviert FallbackProvider-Schutz

### Belege

`packages/backend/src/services/blockchain.ts:128-130`:

```typescript
if (subProviders.length === 1) {
  return subProviders[0].provider // <-- nackter Provider
}
```

### Problem

Wenn nur eine URL effektiv ist, wird der nackte `JsonRpcProvider` zurückgegeben — **ohne** FallbackProvider-Wrapper. Das deaktiviert:

- `stallTimeout` (kein per-Call-Timeout)
- Health-Tracker (kein State über Calls hinweg)
- Broadcast-Resilience für Writes (Comment `:62-67` verspricht „broadcast to all healthy sub-providers" — gilt dann nicht)

**Wann tritt das auf?**

1. **`EVENT_RPC_URL=<single-url>`** explizit gesetzt. → `eventProvider` ist nackter Provider.
2. **Lokale Entwicklung/Tests** mit `RPC_URL=http://127.0.0.1:8545`. → `provider` ist nackt (hier OK, weil Hardhat-Node).

Praktisch in Production: tritt nur bei explizitem `EVENT_RPC_URL=<single>` auf. Genau der dokumentierte Use-Case `:147-154` (Alchemy Growth Tier opt-back-in) bekommt damit ungeschützten Single-Provider.

### Fix

```typescript
function buildReadProvider(urls: string[]): ethers.AbstractProvider {
  const subProviders = urls.map((url, idx) => ({
    provider: new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 1 }),
    priority: idx + 1,
    stallTimeout: 2_000,
    weight: 1,
  }))

  if (subProviders.length === 0) {
    throw new Error('buildReadProvider called with empty URL list')
  }

  // Always wrap, even with a single sub-provider, so stallTimeout and
  // FallbackProvider's per-call retry semantics still apply.
  return new ethers.FallbackProvider(subProviders, undefined, { quorum: 1 })
}
```

### 2-Jahre-Begründung

Geringes Aktivierungs-Risiko, aber wenn ein Operator Alchemy Growth bezahlt und `EVENT_RPC_URL=<alchemy-url>` setzt (genau der dokumentierte Use-Case), bekommt er einen ungeschützten Single-Provider. Wenn Alchemy mal 5 min down ist, ist der Event-Sync für 5+ min gestört, statt auf publicnode/drpc auszuweichen.

---

## 🟡 F3.7 — `getBlockTimestamps` ohne Retry, sequenziell, blockiert `runSync`

### Belege

`packages/backend/src/services/json-file-event-store.ts:89-97`:

```typescript
private async getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)]
  const map = new Map<number, number>()
  for (const bn of unique) {
    const block = await provider.getBlock(bn)             // <-- sequenziell, kein withRpcRetry
    map.set(bn, block?.timestamp ?? 0)
  }
  return map
}
```

### Problem

Drei Defekte in einer Funktion:

1. **Sequenziell:** Bei N unique Blöcken → N Round-Trips serialisiert. Bei einem Cold-Sync mit 1000 Events in 800 unique Blöcken → 800 × 200 ms ≈ 2 min nur für Timestamps.

2. **Kein `withRpcRetry`:** Ein einziger 429-Response wirft direkt nach oben, `runSync.catch` schluckt den Error, `lastSyncedBlock` bleibt unverändert. Beim nächsten Sync von vorne.

3. **Falscher Provider** (`provider`, nicht `eventProvider`): Konsistenz-Issue zur F3.1.

### Fix

```typescript
private async getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)]
  const map = new Map<number, number>()

  const CONCURRENCY = 4
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY)
    const blocks = await Promise.all(
      batch.map(bn =>
        withRpcRetry(() => eventProvider.getBlock(bn), {
          label: `getBlock(${bn})`,
        }),
      ),
    )
    blocks.forEach((block, idx) => {
      map.set(batch[idx], block?.timestamp ?? 0)
    })
  }
  return map
}
```

→ 4× Speed-up bei großen Backlogs, Retry-Schutz, Provider-Konsistenz mit F3.1.

### 2-Jahre-Begründung

Fließt direkt in F3.2 mit ein — wenn der Cold-Sync schneller läuft, ist die Crash-Loop unwahrscheinlicher. Plus: bei jeder Plesk-Pause-Resumption mit großem Backlog sind die Timestamps der Bottleneck.

---

## 🟡 F3.8 — Free-Tier-Provider-Heuristik ist nur für Alchemy, ignoriert andere

### Belege

`packages/backend/src/services/blockchain.ts:156-162`:

```typescript
function isAlchemyFreeUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.alchemy.com')
  } catch {
    return false
  }
}
```

`packages/backend/src/server.ts:53-68` CSP `connectSrc` erlaubt explizit auch Infura, QuickNode, Ankr, BlockPI — die Free-Tier-Filter-Logik kennt aber nur Alchemy.

### Problem

Drei Holes:

1. **`alchemyapi.io` (legacy Alchemy URL)** wird nicht erkannt. `host.endsWith('.alchemy.com')` matched nicht `eth-mainnet.alchemyapi.io`. Operator mit alter Alchemy-URL bekommt event-sync gegen Alchemy-Free → 10-Block-Cap kickt.

2. **Andere Free-Tier-Provider:** Infura Free capped `eth_getLogs` auf 10k Blöcke. QuickNode Free ähnlich. Wenn Operator Infura nutzt und `EVENT_RPC_URL` vergisst, läuft event-sync über die primäre Infura → kann je nach Block-Range scheitern.

3. **drpc.org Free Tier ist als `KNOWN_BASE_FALLBACKS` hardcoded** (`:72`). DRpc lehnt Batches > 3 ab und cap auf 10k Blöcke — `chunkSize=9000` ist genau darunter, knapp. Wenn drpc das Limit auf 5k senkt, bricht event-sync sofort.

### Fix

```typescript
const KNOWN_FREE_TIER_HOSTS = [
  /\.alchemy\.com$/,
  /\.g\.alchemy\.com$/,
  /\.alchemyapi\.io$/,
  /\.infura\.io$/,
  /\.quiknode\.pro$/,
]

function hasRestrictiveLogsLimits(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return KNOWN_FREE_TIER_HOSTS.some((re) => re.test(host))
  } catch {
    return false
  }
}

function getEventRpcUrls(): string[] {
  const explicit = (config.eventRpcUrl ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  if (explicit.length > 0) return explicit

  const filtered = getEffectiveRpcUrls().filter((u) => !hasRestrictiveLogsLimits(u))
  if (filtered.length === 0) return [...KNOWN_BASE_FALLBACKS]
  return filtered
}
```

Plus: `chunkSize` defensiver auf 5000 senken in `config.ts:73`:

```typescript
chunkSize: parseInt(optional('CHUNK_SIZE', '5000'), 10),
```

→ 80% der drpc/free-tier Limits abgedeckt mit Puffer.

### 2-Jahre-Begründung

Der Code wurde gegen Alchemy Free Tier gehärtet, weil das die historische Schmerzquelle war. Die Annahme „alle anderen Provider haben keine Limits" stimmt nicht. Über 2 Jahre wird mindestens ein Operator-Wechsel zu einem anderen Provider passieren.

---

## 🟡 F3.9 — RPC-URL-Format-Validation fehlt

### Belege

`packages/backend/src/config.ts:28`: `rpcUrl: required('RPC_URL')` — checkt nur `Boolean(value)`.

`packages/backend/src/services/blockchain.ts:85-91` (`isLocalRpcUrl`): bei bad URL silently `false` zurückgegeben → URL durchgereicht.

### Problem

`new ethers.JsonRpcProvider('not-a-url')` failed nicht beim Konstruktor (lazy). Erst beim ersten Call. Operator denkt „server boots ok", die erste echte Anfrage failed kryptisch.

Konkret abgefangene Tippfehler-Klassen:

- Schema-Tippfehler: `htttps://...`, `htps://`, `http:/...`
- Bare hostname: `mainnet.base.org` (ohne Schema)
- ws:// statt https:// — ethers JsonRpcProvider erwartet HTTP

### Fix

```typescript
function validateUrl(value: string, key: string): void {
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      throw new Error(`${key} must be http(s):, got ${u.protocol}`)
    }
    if (!u.hostname) throw new Error(`${key} has empty hostname`)
  } catch (err) {
    throw new Error(
      `${key} is not a valid URL: ${value}. ${err instanceof Error ? err.message : ''}`,
    )
  }
}

const rpcUrls = required('RPC_URL')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean)
if (rpcUrls.length === 0) throw new Error('RPC_URL must contain at least one URL')
rpcUrls.forEach((u) => validateUrl(u, 'RPC_URL entry'))

const eventRpcUrls = (process.env.EVENT_RPC_URL ?? '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean)
eventRpcUrls.forEach((u) => validateUrl(u, 'EVENT_RPC_URL entry'))
```

### 2-Jahre-Begründung

Tippfehler beim Setup sind unvermeidlich. Fail-fast bei Boot ist ein Bruchteil der Operator-Schmerzen wertvoller als kryptische 500er bei der ersten User-Interaktion.

---

## ⚪ F3.10 — CSP `connectSrc` listet nicht-genutzte Provider

### Belege

`packages/backend/src/server.ts:53-68`: 14 Einträge im CSP `connectSrc`.

### Problem

Die CSP gilt für das vom Backend ausgelieferte Frontend-SPA. Frontend macht aber keine direkten RPC-Calls (alles geht über `/api/v1/...`). Die einzigen externen Calls vom Frontend sind BaseScan-Links (Navigation, kein fetch) und MetaMask via injected provider (extension-internal, nicht subject zur Page-CSP).

→ Die ganze RPC-Provider-Liste in `connectSrc` ist Cargo-Cult. `connectSrc: ['self']` würde reichen.

Plus: `1rpc.io` ist im CSP, aber im Code-Comment (`blockchain.ts:48-51`) als „silently broken" markiert und NICHT mehr in `KNOWN_BASE_FALLBACKS`. Inkonsistenz suggeriert: einer der zwei Stellen ist veraltet.

### Fix

```typescript
connectSrc: ["'self'"],
// Frontend talks ONLY to the backend (/api/v1/...). The backend talks to
// blockchain RPCs. There is no direct browser-to-RPC traffic except for
// MetaMask's injected provider, which uses extension-internal channels
// and is not subject to page CSP.
```

### 2-Jahre-Begründung

Cosmetic, aber wenn jemand die CSP-Liste pflegt in der Annahme, sie sei load-bearing, ist Aufwand verschwendet.

---

## ⚪ F3.11 — `withRpcRetry`-Pattern-Match auf JSON-RPC-Error-Bodies fragil

### Belege

`packages/backend/src/lib/rpcRetry.ts:46-54`:

```typescript
const message = rec.message
if (typeof message === 'string') {
  if (
    /429|too many requests|timeout|timed out|rate limit|gateway|service unavailable|bad gateway|connection reset|fetch failed|network error/i.test(
      message,
    )
  ) {
    return true
  }
}
```

### Problem

Erfasst nur englischsprachige, exakte Fehlermeldungen. Anbieter ändern Fehler-Strings ohne Vorwarnung. Beispiele die NICHT gematched werden:

- `"You've reached the usage limit"` (1rpc.io aus Comment) — Pattern ist `rate limit`, in der Message steht `usage limit`. **Wird NICHT gematched.** → Errors propagieren ohne Retry.
- `"quota exceeded"` (typisch Alchemy)
- `"compute units exhausted"` (Alchemy spezifisch)
- `"plan limits reached"` (Anbieter-spezifisch)

Plus: `info.responseStatus` (`:58`) wird auf `/^(429|5\d\d)/` getestet — gut, aber Anbieter, die 200 mit Error-Body senden (1rpc.io im Code-Comment dokumentiert), umgehen das.

### Fix

```typescript
const TRANSIENT_PATTERNS = [
  /429|too many requests|rate limit|usage limit|quota exceeded|compute units|plan limit/i,
  /timeout|timed out/i,
  /gateway|service unavailable|bad gateway|connection reset|fetch failed|network error/i,
]

if (typeof message === 'string') {
  if (TRANSIENT_PATTERNS.some((re) => re.test(message))) return true
}

// JSON-RPC error codes: -32005 limit exceeded, -32603 internal error
const errorObj = (rec.error as Record<string, unknown> | undefined) ?? rec
const errCode = errorObj?.code
if (errCode === -32005 || errCode === -32603) return true
```

### 2-Jahre-Begründung

Provider-Error-Strings ändern sich. Über 2 Jahre wird mindestens ein Provider sein Throttling-Format ändern und Reads scheitern silent — bis jemand ins Log schaut.

---

## Aus V1 obsolet geworden

Bereich 3 ist **NEU im V2-Audit**. V1 hatte keinen RPC-Audit. Es gibt keine V1-Findings, die hier obsolet werden.

Die im V2-Plan unter Bereich 3 hinterlegten Hypothesen aus dem alten Plan-Dokument sind jetzt durch F3.1–F3.11 abgelöst:

| V2-Plan-Hypothese                                                                      | Status                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KNOWN_BASE_FALLBACKS` Public-RPCs ohne Rate-Limit-Garantie → Klassen-Run = Throttling | ✅ Bestätigt → F3.3 + F3.5 + F3.8                                                                                                                                              |
| `getBlockTimestamps` sequenziell → Cold-Sync-Last-Spike                                | ✅ Bestätigt → F3.7                                                                                                                                                            |
| `/health/diag` exposed zu viel Operator-Info (RPC-Hosts) → informational disclosure    | ❌ **Widerlegt.** `routes/health.ts:80-85` exposed nur Hostname (nicht volle URL mit API-Key) — explizit auf API-Key-Vermeidung designed (`:64-69`). Keine Finding hier nötig. |

---

## Severity-Tally Bereich 3

🔴 Blocker: **0**
🟠 Major: **4** (F3.1, F3.2, F3.3, F3.4)
🟡 Minor: **5** (F3.5, F3.6, F3.7, F3.8, F3.9)
⚪ Nit: **2** (F3.10, F3.11)

---

## Empfohlene Reihenfolge der Fixes

1. **Sofort (Code-Edits, niedriges Risiko):**
   - F3.1 Cross-Provider-Fix (`queryFilterChunked` mit `toBlock`-Parameter, `runSync` nutzt `eventProvider`)
   - F3.2 Inkrementelle Persistierung in `runSync` (zentral!)
   - F3.7 `getBlockTimestamps` parallelisieren + retry + provider-konsistent
   - F3.4 `validateChainId` await-vor-listen + `EXPECTED_CHAIN_ID` in Example

2. **Mittel-Term (Doku + Operator-UX):**
   - `.env.production.example` ergänzen (CONTRACT_DEPLOY_BLOCK realistischer Default + EXPECTED_CHAIN_ID + EVENT_RPC_URL-Erklärung)
   - F3.6 Single-Provider-Fallthrough entfernen (1-Liner)
   - F3.9 URL-Format-Validation
   - F3.8 Generic Free-Tier-Detection + chunkSize-Default auf 5000

3. **Mittel-Term (Resilience):**
   - F3.3 Token-Bucket im `withRpcRetry` (50 Zeilen, sofort wirksam)
   - F3.5 `claim.ts`-Wrapper für `AlreadyClaimed`-Idempotenz
   - F3.11 erweiterte Retry-Patterns

4. **Cleanup:**
   - F3.10 CSP-Liste auf `'self'` reduzieren

5. **Optional (Architektur):**
   - F3.3 Variante A: pro-Provider Circuit-Breaker
   - **Operativ:** Alchemy Growth Tier evaluieren ($588/Jahr) vs. eigener Erigon-Node auf HSBI-Hardware vs. Status quo + Resilience-Fixes (B + A oben)

## Cross-Cutting-Notes für andere Bereiche

- **Bereich 2 (Key Management — noch nicht durchgeführt):**
  - **🔴-Kandidat (gehört zu Bereich 2):** `packages/backend/probe.mjs` enthält in Zeilen 6–10 hard-coded den Live-Mainnet-Proxy + den Live-Minter-Private-Key in Klartext. Untracked laut `git status`, aber liegt im Workspace und ist über Backups, `git stash` oder versehentliches `git add .` leakable. Sofortiges Löschen empfohlen, plus `pre-commit`-Hook der `probe.mjs` blockt.
  - F3.4 Race-Bedingung beim Boot kann während eines `awardPoints` einen `process.exit(1)` triggern → Nonce-Store-Inkonsistenz mit On-Chain. Fließt in Auth-Replay (Bereich 6) ein.

- **Bereich 4 (Stores):**
  - F3.1 Event-Store-Drift verstärkt die Sorge in Bereich 4 um Cache-Korrektheit. F1.8 (`PointsRevoked`-Coverage) plus F3.1 = doppelte Drift-Quelle.
  - F3.2 Cold-Sync-Crash-Loop ist auch ein Backup-Recovery-Problem: nach Disk-Crash + Restore von `events.json`-Backup kann der Sync nie aufholen.

- **Bereich 6 (Auth, Replay):**
  - F3.5 Stale-Reads kombiniert mit `markUsed BEFORE awardPoints` → Nonce-Verlust + Studierende-Blockade. Bereich 6 muss prüfen, ob die „fail-closed" Strategie auch idempotenten Re-Claim erlaubt (siehe F3.5 Fix D).

- **Bereich 7 (Operations):**
  - F3.2 ist ein operativer Footgun. Runbook für „Disaster Recovery" muss explizit `CONTRACT_DEPLOY_BLOCK` setzen.
  - F3.4 No-Op-Validation = falsche Annahme über Boot-Sicherheit.
  - F3.3 + Alchemy Growth ist operative + wirtschaftliche Entscheidung — Risikobasierte Begründung sollte im Operations-Bereich dokumentiert werden.
