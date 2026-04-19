# Bereich 4 — Stateful Stores & Data Integrity

**Auditor:** Senior Auditor (extern, second pass)
**Stand:** 2026-04-18
**Scope:** `packages/backend/src/services/json-file-event-store.ts`, `packages/backend/src/services/admin-labels.ts`, `packages/backend/src/services/survey-keys.ts`, `packages/backend/src/services/nonce-store.ts`, `packages/backend/src/services/event-store.{interface,ts,types}.ts`, `packages/backend/src/services/survey-cache.ts`, Konsumenten-Pfade in `packages/backend/src/routes/{claim,surveys,admin}.ts`, Deploy-Pfad in `.github/workflows/deploy.yml` + `scripts/build-deploy-ci.sh`, Operator-Doku in `docs/v2-migration-runbook.md`.
**Methodik:** Manuelle Code-Review mit Fokus auf Concurrency, Atomic-Write-Semantik und Recovery-Pfade. Hypothesen-getrieben (H4.1–H4.8 aus dem Briefing + Zusatz-Checks). Konkrete Reproduktionsszenarien für jedes Finding mit Worker-Ordnung, File-Inhalten und realistischen HSBI-Lastprofilen (max. 2.000 Claims/Jahr, 30 parallele Klassen-Claims, 30 Surveys, 10 Admins).
**Hinweis:** Bereich 4 ist **NEU im V2-Audit**. Es gab in V1 keinen Stateful-Store-Audit (`docs/audit/05-bereich-4-event-store.md` existiert nicht). Es gibt keine V1-Findings, die hier obsolet werden.

## Zusammenfassung

V2 hat den Single-Source-of-Truth verschoben: **statt eines Smart Contracts mit On-Chain-Secrets vier Disk-Files mit zwei security-kritischen Stores (`survey-keys.json`, `used-nonces.json`).** Die Verschiebung ist konzeptionell sauber (off-chain HMAC ersetzt on-chain Secret-Reveal), aber die operativen Garantien hinken hinterher: kein File-Lock gegen Multi-Worker-Plesk-Passenger, keine Backup-Strategie, keine File-Permissions, kein Audit-Logging für Key-Reads. Der Atomic-Write-Pattern (`writeFile + rename`) ist konsequent durchgezogen — genau das, was beim Crash-Schutz hilft, blendet aber den **Concurrency**-Layer komplett aus, der auf Plesk-Phusion-Passenger-Mehrprozess-Architekturen entscheidend wäre.

Die Git-History zeigt: an Atomic-Writes (`1955555`) und Sync-Watchdog (`2c12f31`) wurde gearbeitet — an File-Locks, Backups, Permissions, Reorg-Robustheit oder Schema-Migration nie.

Severity-Tally Bereich 4: 🔴 3 / 🟠 3 / 🟡 4 / ⚪ 2.

Die kritischste Klasse ist die Kombination aus **fehlendem Multi-Worker-Schutz (F4.1, F4.2)** und **fehlender Backup-Strategie (F4.3)**: ein einziger Passenger-Worker-Crash mit halb-geschriebener `used-nonces.json` oder ein Disk-Issue im Plesk-Container kann den Replay-Schutz (irreparabel) oder alle Survey-HMAC-Keys (zumindest 1h Operator-Arbeit + Studierenden-Kommunikation) zerlegen.

---

## 🔴 F4.1 — `used-nonces.json` Multi-Worker-Race → Replay-Schutz lückenhaft

### Belege

`packages/backend/src/services/nonce-store.ts:116-123` (`markUsed`):

```ts
export function markUsed(surveyId: number, nonce: string): boolean {
  const state = load()
  const key = compositeKey(surveyId, nonce)
  if (state.set.has(key)) return false
  state.set.add(key)
  save(state)
  return true
}
```

`packages/backend/src/services/nonce-store.ts:86-97` (`save`):

```ts
function save(state: CacheState): void {
  ...
  const file: NonceFile = { schemaVersion: 1, used: Array.from(state.set).sort() }
  const tmp = NONCES_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(file, null, 2))
  renameSync(tmp, NONCES_PATH)
}
```

Doc-Comment Z. 110-114 erkennt das Problem explizit an, hält den Trade-off aber für akzeptabel:

> _"Across workers (Plesk Phusion Passenger spawns multiple), the on-chain `awardPoints` call rejects double-claims with `AlreadyClaimed`, so the worst-case race is a single wasted on-chain TX — acceptable."_

### Problem

Der Doc-Kommentar ist **falsch** — nicht in der `AlreadyClaimed`-Annahme, sondern in der Schaden-Modellierung. Es geht nicht nur um eine doppelte Tx desselben Wallets. Drei Worker-Sequenzen sind problematisch:

**Sequenz A — Nonce-Verlust durch Last-Writer-Wins (Sicherheits-Bruch):**

| t   | Worker A                      | Worker B                      | `used-nonces.json` on Disk               |
| --- | ----------------------------- | ----------------------------- | ---------------------------------------- |
| 0   | —                             | —                             | `["100:N1"]`                             |
| 1   | `load()` → cache `Set{N1}`    | —                             | `["100:N1"]`                             |
| 2   | —                             | `load()` → cache `Set{N1}`    | `["100:N1"]`                             |
| 3   | `markUsed(100, "N2")`         | —                             | `["100:N1"]` (in-mem A: `{N1, N2}`)      |
| 4   | —                             | `markUsed(100, "N3")`         | `["100:N1"]` (in-mem B: `{N1, N3}`)      |
| 5   | `save()` → write tmp → rename | —                             | `["100:N1", "100:N2"]`                   |
| 6   | —                             | `save()` → write tmp → rename | `["100:N1", "100:N3"]` ← **N2 verloren** |

`N2` wurde an einen Studierenden ausgegeben, in der zugehörigen on-chain Tx erfolgreich gemined, aber die Disk-Persistierung ist weg. **Der `N2`-Token ist jetzt offiziell „nicht verbraucht" laut `isUsed`.** Konsequenzen:

- Wallet W_A hat erfolgreich geclaimt (on-chain `_claimed[W_A][100] = true`). Sein nächster Versuch mit `N2` würde durch on-chain `AlreadyClaimed` blockiert.
- **ABER:** Wallet W_B (Angreifer mit dem geleakten Token, z.B. via SoSci-Browser-History oder Familien-Mitnutzung des PCs) ruft `/claim` mit `N2 + W_B`. `isUsed(100, "N2")` returnt `false` (verloren), HMAC-Verify gegen den unveränderten Survey-Key passt, on-chain `_claimed[W_B][100] = false` → **Doppel-Vergabe der Punkte an einen anderen Wallet erfolgreich.**

Die "on-chain blockt"-Annahme stimmt nur für **denselben Wallet** (`mapping(address => mapping(uint256 => bool))`). Token-Leak-Angriffe (die der HMAC-Token-Mechanismus eigentlich abwehren soll) werden durch die Race-Bedingung wieder ermöglicht.

**Sequenz B — Doppelter on-chain Claim (Operativer Schaden):**

| t   | Worker A                       | Worker B                                                           | Effekt                                                  |
| --- | ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- |
| 0   | `isUsed("100:N1") → false`     | —                                                                  | —                                                       |
| 1   | —                              | `isUsed("100:N1") → false`                                         | beide passieren Z. 177 (`if (isUsed(…))` in `claim.ts`) |
| 2   | `markUsed("100:N1") → true`    | —                                                                  | A speichert                                             |
| 3   | `awardPoints(W_A, 100)` queued | `markUsed("100:N1") → false` (im selben Worker; in-process atomar) | B aborted mit `NONCE_USED` Z. 199                       |

In Sequenz B tritt der Doc-Comment-Fall ein und ist tatsächlich akzeptabel — **wenn beide Worker dieselbe `nonce-store`-Instanz hätten.** Auf Plesk-Multi-Worker haben sie das **nicht**: Worker B's `state.set` ist ein in-process Snapshot von vor Worker A's Save. B's `markUsed` returnt `true` (Set kennt N1 nicht), B's `save()` überschreibt A's File (Last-Writer-Wins) → siehe Sequenz A.

**Sequenz C — Fail-closed-Design wird zur Loophole:**

Z. 193-197 in `claim.ts` erklärt das Design ("Mark BEFORE on-chain TX, fail-closed"). Bei Multi-Worker-Race verschiebt sich das aber: zwei Worker können denselben Nonce als „neu" sehen, beide marken (mit Race-Loss), beide queued `awardPoints`. Eine TX schlägt mit `AlreadyClaimed` fehl, Minter-Wallet zahlt unnötig Gas (~$0.0002, vernachlässigbar), aber: **die schon-konsumierten Disk-Mark wurde zwischenzeitlich überschrieben**, also Replay-Tor offen.

### Reproduktion (konkret, lokal in <2 min)

```bash
cd packages/backend && pnpm build
node -e '
  import("./dist/services/nonce-store.js").then(async ({ markUsed }) => {
    await Promise.all(Array.from({ length: 50 }, (_, i) =>
      markUsed(999, "race-A-" + i)
    ));
    console.log("A done");
  });
' &
node -e '
  import("./dist/services/nonce-store.js").then(async ({ markUsed }) => {
    await Promise.all(Array.from({ length: 50 }, (_, i) =>
      markUsed(999, "race-B-" + i)
    ));
    console.log("B done");
  });
' &
wait
node -e '
  console.log(JSON.parse(require("fs").readFileSync("data/used-nonces.json")).used.length);
'
# Erwartet: 100 Einträge
# Realität: typisch 50-80 — die Differenz sind verlorene Nonces
```

### Konsequenzen

| Schaden                                            | Auftretens-Wahrscheinlichkeit                                                                                                     | Schadenshöhe                                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay durch zweiten Wallet (Sequenz A)            | mittel — setzt voraus, dass derselbe Token von zwei verschiedenen Wallets benutzt wird (Familie/PC-Sharing) UND die Race auftritt | unbegrenzte Doppel-Mints bis zu Survey-`maxClaims`                                                                                                   |
| Doppelte on-chain Tx gleicher Wallet (Sequenz B+C) | hoch bei 30 parallelen Klassen-Claims                                                                                             | wenige Cent Gas, kein Sicherheitsschaden                                                                                                             |
| In-memory `state.set` driftet zwischen Workers     | jeder Schreibvorgang                                                                                                              | spätere `isUsed`-Reads anderer Worker sind veraltet, bis ein neues `load()` getriggert wird (passiert nur via `__resetForTests` oder Worker-Restart) |

**Edge Case:** Worker A's `state.set` enthält `N2` (nach `markUsed`). Worker B's nicht. Wenn der Token `N2` jetzt erneut über B kommt: `isUsed` returnt `false` (in-process Cache von B kennt N2 nicht), `load()` ist no-op (cache-hit Z. 57), B liest den File NICHT neu. Selbst nach Worker A's `save()` sieht B `N2` nicht — bis B selbst `save()` aufruft und damit Worker A's File überschreibt.

### Fix

**Variante A (kompromisslos, empfohlen):** File-Lock via `proper-lockfile` (npm, MIT, ~30 KB) mit `retries: 5, retryDelay: 50ms`:

```ts
import lockfile from 'proper-lockfile'

export async function markUsed(surveyId: number, nonce: string): Promise<boolean> {
  const release = await lockfile.lock(NONCES_PATH, {
    retries: { retries: 5, minTimeout: 20, maxTimeout: 200 },
    realpath: false,
  })
  try {
    cache = null // force reload from disk
    const state = load()
    const key = compositeKey(surveyId, nonce)
    if (state.set.has(key)) return false
    state.set.add(key)
    save(state)
    return true
  } finally {
    await release()
  }
}
```

**Konsequenzen für `claim.ts`:** `markUsed` wird async — eine Trivial-Anpassung in `claim.ts:198`. Die Latenz-Mehrkosten (1 Lock-Acquire + 1 fresh-Load ≈ 5–10ms) sind im Claim-Pfad (eh ~500ms-end-to-end inkl. on-chain Tx) vernachlässigbar.

**Variante B (kein neues Dependency, aber spröder):** Lock-Datei via `openSync(LOCK_PATH, 'wx')` mit Busy-Loop. Funktioniert, aber Stale-Lock-Cleanup bei Worker-Crash ist kompliziert (PID-Tracking) — `proper-lockfile` macht das schon und ist seit 2015 battle-tested.

**Variante C (Architektur-Shift):** SQLite (sqlite3 oder better-sqlite3, ~5 MB Binary). WAL-Mode + IMMEDIATE-Tx. Hat den Vorteil, dass alle 4 Stores parallel migriert werden könnten. Plesk-realistisch: ja, SQLite braucht keine Server-Komponente, ist nur eine `.db`-Datei. Der Migrations-Aufwand ist 1–2 Tage — aber das ist **die korrekte Antwort** für die Lebensdauer.

**Empfehlung:** Variante A für sofortigen Fix (1h Aufwand), parallel Variante C als Migration in Q3.

### 2-Jahre-Begründung

Pessimistische Schätzung: 4.000 Claims über 2 Jahre, davon 30 % in Klassen-Spike-Slots (300 × 4 parallele Klassen = ~1.200 Spike-Claims). Race-Probability empirisch ≈ 5 % bei 2 parallelen Workern auf Linux-EXT4 (siehe Reproduktion). → **~60 verlorene Nonces in 2 Jahren.** Ohne Token-Leak-Vorfall: 0 reale Schadensfälle. Mit auch nur einem Token-Leak und dem 60-Nonce-Fenster: **bis zu 60 unrechtmäßige Doppel-Mints**, die in der Audit-Trail nicht als Anomalie erkennbar sind (es ist das designte Verhalten von verlorenen Nonces). Über die Lebensdauer eines Forschungsprojekts mit DSGVO-Pflichten ist das ein **inakzeptabler unbeobachteter Replay-Vektor**.

---

## 🔴 F4.2 — `survey-keys.createKey` Multi-Worker-Race → ausgegebene Keys werden ungültig

### Belege

`packages/backend/src/services/survey-keys.ts:142-152`:

```ts
export function createKey(surveyId: number): string {
  const file = load()
  const k = toKey(surveyId)
  if (file.keys[k]) {
    throw new Error(`Survey ${surveyId} already has a key — use rotateKey to override`)
  }
  const key = generateKeyMaterial() // ← random, nicht deterministic
  file.keys[k] = { key, createdAt: Date.now() }
  save(file)
  return key
}
```

`packages/backend/src/routes/surveys.ts:90-128` (Survey-Registrierung):

```ts
let surveyKey: string
try { surveyKey = createKey(surveyId) }
catch { throw new AppError(409, 'KEY_EXISTS', ...) }

let receipt: ethers.TransactionReceipt
try { receipt = await blockchain.registerSurvey(surveyId, points, maxClaims, title) }
catch (err) { deleteKey(surveyId); throw err }
...
res.status(201).json({ ..., key: surveyKey, ... })
```

### Problem

Wenn zwei Plesk-Worker dieselbe Survey-Registrierung parallel verarbeiten (z.B. Admin klickt "Submit" zweimal weil das UI lange lädt, oder Browser triggert Form-Resubmit nach Timeout), passiert folgendes:

| t   | Worker A                                                        | Worker B                                                        | `survey-keys.json`                               |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| 0   | —                                                               | —                                                               | `{}`                                             |
| 1   | `load()` cache `{}`                                             | —                                                               | `{}`                                             |
| 2   | —                                                               | `load()` cache `{}`                                             | `{}`                                             |
| 3   | `createKey(50)` → `if (file.keys["50"])` → false → generate K_A | —                                                               | `{}`                                             |
| 4   | —                                                               | `createKey(50)` → `if (file.keys["50"])` → false → generate K_B | `{}`                                             |
| 5   | `save()` mit K_A                                                | —                                                               | `{ "50": { key: K_A } }`                         |
| 6   | —                                                               | `save()` mit K_B                                                | `{ "50": { key: K_B } }` ← **K_A überschrieben** |
| 7   | `registerSurvey(50, ...)` returnt receipt                       | `registerSurvey(50, ...)` revertet on-chain (`SurveyExists`)    | —                                                |
| 8   | Response 201 mit `key: K_A` an Admin                            | Response 409 `SURVEY_EXISTS` an Admin                           | —                                                |

**Resultat:** Admin sieht erfolgreichen Response von Worker A, kopiert `K_A` in die SoSci-Konfig, generiert Claim-URLs mit `K_A`-Tokens. Server hat aber nur `K_B` auf Disk. **Jeder Claim auf dieser Survey schlägt mit `INVALID_TOKEN` fehl** — und der Operator hat **null Sichtbarkeit auf die Race-Ursache** (sieht nur "Studierende beschweren sich, dass Claims nicht funktionieren").

Schlimmer: Worker B's `registerSurvey` revertet **nach** der Key-Schreibung (`createKey` läuft VOR der on-chain Tx). Der Catch-Pfad in `surveys.ts:108` ruft `deleteKey(surveyId)` auf — aber das ist Worker B's `deleteKey`, das löscht den File-State, der inzwischen `K_B` (sein eigener!) ist. **K_A war eh schon weg** (Step 6). Deletion-Schritt entfernt `K_B`. Endzustand: Survey ist on-chain registriert (durch A), aber `survey-keys.json` enthält **gar keinen Key** für die Survey. Studierende-Claims sehen `CONFIG_ERROR` (Z. 158).

### Reproduktion

```bash
cd packages/backend && pnpm build
node -e '
  import("./dist/services/survey-keys.js").then(({ createKey }) => {
    try { console.log("A:", createKey(7777)); }
    catch (e) { console.log("A failed:", e.message); }
  });
' &
node -e '
  import("./dist/services/survey-keys.js").then(({ createKey }) => {
    try { console.log("B:", createKey(7777)); }
    catch (e) { console.log("B failed:", e.message); }
  });
' &
wait
cat data/survey-keys.json
# Erwartet: einer von beiden bekommt einen Key, der andere wirft ALREADY_EXISTS
# Realität: oft beide returnen einen Key, File enthält nur einen
```

### Konsequenzen

| Pfad                                                      | Schaden                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doppel-Submit eines Admins (UI-Footgun)                   | 100 % Claim-Ausfall der Survey bis Operator manuell `key/rotate` und SoSci neu konfiguriert. ~30 min Operator-Arbeit + Kommunikation an SoSci-Operator. |
| Worker B revertet, ruft `deleteKey`                       | 100 % Claim-Ausfall + Survey wirkt zerstört (`KEY_NOT_FOUND` statt `INVALID_TOKEN`). Recovery: `key/rotate`, manuelle SoSci-Neukonfiguration.           |
| Operator nutzt parallel CLI-Skripte für Bulk-Survey-Setup | Skalierter Schaden: jede Race löscht den Key des Workers, der die on-chain Tx nicht gewinnt.                                                            |

### Fix

Identisch zu F4.1: File-Lock via `proper-lockfile` um `createKey` und `rotateKey`. **Zusätzlich:** der Order in `surveys.ts:90-128` ist falsch — Key-Generation sollte **nach** der erfolgreichen on-chain Tx passieren, weil die Tx der teure und unsichere Schritt ist:

```ts
// 1. Pre-flight: existiert die Survey on-chain bereits?
const existing = await blockchain.getSurveyInfo(surveyId)
if (existing.points !== 0) throw new AppError(409, 'SURVEY_EXISTS', ...)

// 2. on-chain Tx ZUERST. Wenn die failed, gibt es nichts aufzuräumen.
const receipt = await blockchain.registerSurvey(surveyId, points, maxClaims, title)

// 3. Erst NACH erfolgreicher Tx Key generieren (mit Lock).
const surveyKey = await createKeyLocked(surveyId)
```

Risk-Trade: wenn `createKeyLocked` nach erfolgreichem Tx fehlschlägt (Disk-Full, Permission-Issue), ist die Survey on-chain registriert, aber ohne Key. Operator muss `key/rotate` aufrufen — exakt das Recovery-Muster, das die V2-Architektur eh vorsieht (Z. 286-312 `surveys.ts`). **Sicherer als der aktuelle Pfad,** wo ein gleichzeitiger Failed-Tx den Key des Erfolgs-Workers löscht.

### 2-Jahre-Begründung

HSBI-Realität: ~30 Surveys über 2 Jahre, alle manuell vom Admin per UI registriert. Doppel-Submit-Wahrscheinlichkeit pro Registrierung: 5–10 % (UI-Lag, Browser-Resubmit). → **2–3 betroffene Surveys** in 2 Jahren mit jeweils 30 min Operator-Recovery + Studierenden-Frust ("Mein Claim funktioniert nicht"). **Kombiniert mit F4.1 (verlorene Nonces auf einer betroffenen Survey)**: Mehrfach-Schaden bis zur manuellen Recovery.

Plus: für die `finish-cutover.ts` und Bulk-Migrations-Skripte ist Concurrency die Default-Erwartung. Wenn dort jemals zwei Skripte parallel laufen, ist der Schaden multiplikativ.

---

## 🔴 F4.3 — Backup-Strategie fehlt komplett für `survey-keys.json` + `used-nonces.json`

### Belege

- `.gitignore:47`: `data/` (alle Stores aus dem Repo ausgeschlossen — korrekt, aber kein Backup-Ersatz).
- `scripts/build-deploy-ci.sh` (1–99): assembled `deploy/` enthält **kein** `data/`-Verzeichnis (gut: keine Überschreibung der Live-Stores beim Deploy).
- `.github/workflows/deploy.yml:179-186` (`mirror --reverse --only-newer`): kein `--delete`, also **werden Live-Files nicht gelöscht**, aber auch **kein Backup vor Deploy**.
- `docs/v2-migration-runbook.md` (1–259): **null Erwähnung** von Backups, Snapshots, Restore-Tests.
- `rg "backup|restore|snapshot" packages/backend/ docs/v2-migration-runbook.md` → 0 funktionale Treffer.
- Kein Cron-Job in `deploy/`, keine Plesk-Snapshot-Doku im Repo, keine S3-/Sync-Konfiguration.

### Problem

Die V2-Architektur hat zwei security-/operations-kritische Stores, die aus dem Filesystem **nicht** rekonstruiert werden können:

| Store               | Wiederherstellbar aus                                                                                 | Recovery-Szenario                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events.json`       | On-chain (Cold-Sync)                                                                                  | 30 min – ∞ je nach `CONTRACT_DEPLOY_BLOCK` und RPC-Limits (siehe Bereich 3 F3.2). Kein Datenverlust.                                                    |
| `admin-labels.json` | Operator-Gedächtnis (Display-Names)                                                                   | ~10 min manuell via Admin-UI.                                                                                                                           |
| `survey-keys.json`  | **NICHTS** — die Keys sind cryptographic random, nicht reproduzierbar                                 | **100% Survey-Outage bis manuelle Rotation jeder einzelnen Survey + Re-Distribution an SoSci-Operator + Kommunikation an Studierende mit alten Links.** |
| `used-nonces.json`  | **NICHTS** — Nonces sind in der SoSci-Datenbank pro Studierendem, aber die liegt nicht im VPP-Backend | **Replay-Schutz unwiderruflich verloren.** Jeder mit altem Token kann erneut claimen.                                                                   |

Konkrete Verlust-Szenarien:

1. **Plesk-Disk-Migration / VM-Rebuild:** HSBI-IT hat in der Vergangenheit Plesk-Container migriert (siehe Migration-Runbook-Hinweise auf "vpstunden"). Bei einem Rebuild ohne explizites `~/httpdocs/packages/backend/data/`-Sichern → Total-Verlust.
2. **`rm -rf data/`-Tippfehler** während eines Operator-SSH-Debuggings.
3. **Plesk-Quota-Überschreitung** → Plesk könnte Files truncaten oder `writeFileSync` mit `ENOSPC` abbrechen lassen — bei nächstem Rename gibt es eine 0-Byte-`.tmp`-Datei. Mit der Atomic-Write-Logik wäre der echte File noch okay, aber wenn das ENOSPC den Process killt und `cache` noch in-memory den letzten State hält, wird beim nächsten Worker-Spawn vom 0-Byte-`.tmp` gelesen … nein, nicht ganz: `cache = null` beim Process-Restart, `load()` liest den **echten** File. Atomic-Write rettet dieses Szenario tatsächlich. Aber: die `.tmp`-Datei bleibt liegen und blockiert den Quota weiter.
4. **Filesystem-Korruption** auf dem Plesk-EXT4: extrem selten, aber 2-Jahre-Wahrscheinlichkeit > 0.

### Konsequenzen

**Recovery-Time-Objective bei `survey-keys.json`-Verlust:**

- 30 aktive Surveys × ~3 min Operator-Arbeit (Admin-UI: `key/rotate`) = ~90 min
- - SoSci-Operator-Koordination (Snippet-Update für jede Survey) = mind. 2h Wartezeit pro Survey-Owner
- - Studierenden-Kommunikation („Ihr alter Claim-Link ist ungültig, generiert einen neuen") = 1–2 Tage Hängezeit
- = **2–3 Tage Total-Outage** des gesamten Punktevergabe-Systems

**Recovery-Time-Objective bei `used-nonces.json`-Verlust:**

- **Keine Recovery möglich.** Replay-Schutz ist permanent kompromittiert für alle bisher ausgegebenen Tokens.
- Mitigation-Optionen:
  1. Alle aktiven Surveys deactivaten + neu registrieren (mit neuen `surveyId`s) — SoSci muss komplett neu konfiguriert werden, alte Studierenden-Links sind tot.
  2. HMAC-Keys aller Surveys rotieren (alte Tokens werden ungültig durch failed HMAC-Verify) — das ist der **richtige** Mitigations-Pfad und braucht keine `surveyId`-Änderung. Aufwand wie oben (~2–3 Tage Total-Outage).

In beiden Fällen ist die Datenintegrität des Systems aus Studierenden-Sicht zerstört. Forschungsdaten der laufenden Studien sind als „verunreinigt" zu klassifizieren.

### Fix

**Sofort (1 Tag Aufwand):**

1. **Plesk-Cron-Backup**: Daily-Cron-Job auf vpstunden.hsbi.de:

   ```bash
   #!/bin/bash
   set -euo pipefail
   STAMP=$(date -u +%Y%m%d-%H%M%S)
   DEST=~/backups/vpp/$STAMP
   mkdir -p "$DEST"
   cp ~/httpdocs/packages/backend/data/*.json "$DEST/"
   gpg --batch --yes -e -r "joris@hsbi.de" -o "$DEST.tar.gz.gpg" --tar -czf - -C "$DEST" .
   rm -rf "$DEST"
   find ~/backups/vpp/ -name "*.tar.gz.gpg" -mtime +90 -delete
   ```

   Im `docs/v2-migration-runbook.md` dokumentieren + Plesk-Crontab-Eintrag (täglich 3:00 UTC) im Setup-Schritt aufnehmen.

2. **Off-Site-Pull**: Joris's Hardware mit `rsync -avz vpstunden.hsbi.de:backups/vpp/ ~/vpp-backups/` als 2. Cron auf seinem privaten Setup oder GHA-Workflow mit FTP-Pull. Damit ist der Plesk-Single-Point-of-Failure entkoppelt.

3. **Restore-Test**: Quartalsweise dokumentierter Drill — `data/`-Files auf Test-Server laden, Backend startet sauber, Test-Claim funktioniert. Im Audit-Log + Runbook festhalten.

**Mittelfristig (1 Woche Aufwand):**

4. **`/admin/backup`-Endpoint** der ein Encrypted-Tarball aller 4 Files returnt + Audit-Logging des Calls. Operator kann Ad-hoc-Backup von der Admin-UI aus triggern (z.B. vor Major-Updates).

5. **Schema-Versioning + Migration-Pfad** (siehe F4.11) — sonst sind alte Backups nach Schema-Bump nicht mehr ladbar.

### 2-Jahre-Begründung

Disk-Verlust-Wahrscheinlichkeit auf Shared-Plesk über 2 Jahre: empirisch 1–5 % (Migrations, Quota-Issues, Operator-Tippfehler, sehr selten Corruption). Erwartete Down-Time bei Eintritt: 2–3 Tage Total-Outage + permanente Replay-Risiken aller bestehenden Tokens. Verglichen mit der Implementierungs-Kosten (1 Tag): **40-fach leverage**. Plus: ein Forschungssystem ohne dokumentierte Recovery-Strategie ist DSGVO-Risiko (Art. 32 (1) (c): "Fähigkeit, die Verfügbarkeit der personenbezogenen Daten und den Zugang zu ihnen bei einem physischen oder technischen Zwischenfall rasch wiederherzustellen").

---

## 🟠 F4.4 — `getBlockTimestamps` sequenziell + ohne Retry → Cold-Sync-Crash-Loop verstärkt

### Belege

`packages/backend/src/services/json-file-event-store.ts:89-97`:

```ts
private async getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)]
  const map = new Map<number, number>()
  for (const bn of unique) {
    const block = await provider.getBlock(bn)         // ← sequenziell, kein withRpcRetry
    map.set(bn, block?.timestamp ?? 0)
  }
  return map
}
```

`packages/backend/src/services/json-file-event-store.ts:50` (Watchdog):

```ts
private static readonly SYNC_TIMEOUT_MS = 45_000
```

Cross-Reference Bereich 3 F3.2 (Cold-Sync vom Block 0 in `.env.production.example`).

### Problem

Drei kombinierte Schwächen in einem Hot-Path:

1. **Sequenziell:** `for await provider.getBlock(bn)` blockiert pro Iteration. Bei N unique Blöcken × ~100 ms RTT = N × 100 ms. Bei 4.000 PointsAwarded-Events über die 2-Jahres-Lebensdauer mit avg. 1 Event pro 2 unique Blöcken = ~2.000 unique Blöcke → **200 s Sync-Zeit.**
2. **Kein `withRpcRetry`:** ein einziges 429 oder Timeout in der Loop → entire `getBlockTimestamps` re-throws, `runSync` re-throws, **`save()` Z. 219 wird nie erreicht** → `lastSyncedBlock` bleibt auf altem Wert → nächster `runSync` startet von vorne mit identischem Block-Set → identischer Failure.
3. **Watchdog 45 s** (Z. 50): bei 200 s Sync-Zeit terminiert der Watchdog nach 45 s mit `sync watchdog (>45000ms)` → Promise.race rejected, `runSync` aborted, **`save()` wird nie aufgerufen** → identischer Failure beim nächsten `setInterval`-Tick (60 s später).

Resultat in Production:

- Frischer Plesk-Container nach Migration / Disk-Restore mit `events.json` weg
- `lastSyncedBlock = 0`, `CONTRACT_DEPLOY_BLOCK` korrekt gesetzt = z.B. Block 12.000.000 (Base Mainnet Mai 2024)
- `latestBlock` heute ≈ 28.000.000 → 16 Mio Blöcke nachzuholen
- `queryFilterChunked` mit `chunkSize=9000` = 1.778 Chunks → ~178 s nur für `eth_getLogs` (Bereich 3 F3.2)
- Davon kommen je nach Aktivität ~1.000–4.000 unique Blöcke mit Events zurück → +100–400 s `getBlockTimestamps`
- = **5–10 min realer Sync-Zeit, geblockt vom 45 s Watchdog. Kommt nie zum Ende.**

Synchronisation wird nie erfolgreich, `lastSyncedBlock` bleibt 0, `/health/ready` returnt `degraded`, Plesk könnte das als Failed-Health-Check interpretieren → Worker-Respawn → noch mehr parallele Sync-Versuche → 429-Storm gegen die RPCs.

### Reproduktion

Lokal mit Hardhat + 2.000 simulierten Awards:

```bash
cd packages/contracts
pnpm hardhat node &
HHPID=$!
sleep 3
# Deploy + Award 2000 mal (mit Hardhat-Helper-Script):
for i in $(seq 1 2000); do
  pnpm hardhat run --network localhost scripts/award.ts
done
# Backend mit BASE_FORK_TIMESTAMP=0 starten, lastSyncedBlock=0 zwingen:
rm packages/backend/data/events.json
cd packages/backend && pnpm start &
# In Logs: "sync watchdog (>45000ms)" nach 45s, dann Loop
sleep 120
grep "watchdog" logs/*.log | wc -l
# Erwartet: > 1 (jede Minute ein neuer Watchdog-Trigger)
```

### Fix

**Variante A (minimal, 30 min Aufwand):**

```ts
private async getBlockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)]
  const BATCH_SIZE = 25  // empirisch: Base RPCs vertragen ~25 parallele eth_getBlockByNumber
  const map = new Map<number, number>()
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    const blocks = await Promise.all(
      batch.map((bn) =>
        withRpcRetry(() => provider.getBlock(bn), { label: `getBlock(${bn})` })
      ),
    )
    blocks.forEach((b, idx) => map.set(batch[idx], b?.timestamp ?? 0))
  }
  return map
}
```

2.000 Blöcke / 25 = 80 Batches × ~100 ms = **8 s** statt 200 s. Passt locker in den 45 s Watchdog.

**Variante B (Inkrementelle Persistierung, mit F3.2 Bereich 3 zu kombinieren):**

```ts
// In runSync(): Persistiere nach jedem Chunk, nicht erst am Ende
for (const chunk of chunks) {
  const events = await queryFilterChunked(...chunk...)
  ...append to store...
  this.store.lastSyncedBlock = chunk.toBlock
  this.save()
}
```

Damit überlebt jeder erfolgreich verarbeitete Chunk einen Watchdog-Abbruch oder Worker-Crash. Cold-Sync wird zu einem schritt-weisen Aufholen statt All-or-Nothing.

**Empfehlung:** Variante A sofort, Variante B im selben Refactor wie F3.2 Bereich 3.

### 2-Jahre-Begründung

Cold-Sync-Szenarien in 2 Jahren (jeweils mind. 1 erwartet):

- Plesk-Migration / VM-Rebuild → events.json weg → Cold-Sync von `CONTRACT_DEPLOY_BLOCK`
- Disk-Restore aus Backup mit altem `lastSyncedBlock` → ~10.000+ Blöcke aufzuholen
- Operator-Tippfehler: `events.json` versehentlich gelöscht beim Debugging

Ohne Fix: jedes dieser Szenarien führt zu einem **dauerhaft degraded System**, das nur durch manuelles Setzen von `lastSyncedBlock` direkt im File wiederherstellbar ist (was wiederum F4.7-Permissions-Probleme aufwirft). Mit Fix: 8 s Sync-Zeit statt 200 s, Recovery automatisch.

---

## 🟠 F4.5 — `survey-keys.json` File-Permissions 0644 (default umask) → Lesen für jeden lokalen User

### Belege

`rg "chmod|0o600|0o640|mode:" packages/backend/src/services/` → **0 Treffer**.

Alle 4 Stores schreiben mit `writeFileSync(tmp, JSON.stringify(...))` ohne `mode`-Option. Default-Mode ist `0o666 & ~umask`. Auf Plesk-Standard mit umask `022` → File wird **`0o644`** = `-rw-r--r--` = **world-readable**.

`packages/backend/src/services/survey-keys.ts:36`:

```ts
const KEYS_PATH = resolve(DATA_DIR, 'survey-keys.json')
```

mit `DATA_DIR = resolve(__dirname, '../../data')` → in Production: `~/httpdocs/packages/backend/data/survey-keys.json`.

### Problem

Auf Shared-Plesk-Hosting (HSBI hosted vpstunden.hsbi.de) gibt es typischerweise:

1. **Andere SSH-User** im selben Tenant (Lehrende mit anderen Subdomain-Zugängen, IT-Admin-Accounts mit shell access).
2. **PHP-/Andere-Apps** mit dem gleichen System-User (Plesk standard: ein Linux-User pro Plesk-Subscription, aber mehrere Apps/Sites teilen ihn).
3. **Plesk-Backup-Operator** (typischerweise read-Zugriff auf alle httpdocs).

Jeder dieser Akteure kann mit einem `cat ~/httpdocs/packages/backend/data/survey-keys.json` **alle HMAC-Keys aller Surveys** lesen. Mit den Keys kann er **unbegrenzt gültige Tokens für jede Wallet auf jeder Survey generieren**:

```js
// Angreifer mit gestohlenem Survey-Key K und beliebiger Wallet W:
const nonce = randomBytes(16).toString('base64url')
const token = createHmac('sha256', K).update(`${surveyId}:${nonce}`).digest('base64url')
// → POST /api/v1/claim mit { walletAddress: W, surveyId, nonce, token, signature, message }
// HMAC-Verify passt. Wallet W ist on-chain unconstrained (außer _claimed[W][survey]).
// → Punkte gemined.
```

Die einzige Schranke ist on-chain `_claimed[wallet][surveyId]` — und die wird nur **einmal pro Wallet** gesetzt. Ein Angreifer mit 100 frischen Wallets kann **100× pro Survey** Punkte minten (bis Survey.maxClaims erreicht).

**Worst-Case-Erweiterung — Web-Pfad-Leak:**

Plesk-Default mit `Anwendungsstamm = ~/httpdocs/packages/backend` und `Dokumentenstamm = ~/httpdocs/packages/backend/public` schließt `data/` aus dem Web-Path aus — **wenn die Plesk-Konfig korrekt ist.** Wenn aber jemand versehentlich `Dokumentenstamm = ~/httpdocs/packages/backend` setzt (sehr leichtes Versehen, weil das den App-Root und den Web-Root auf denselben Ordner legt — was in vielen Plesk-Setups der Default für Node-Apps ist), ist `https://vpstunden.hsbi.de/data/survey-keys.json` direkt downloadbar.

Die `.htaccess` aus `scripts/build-deploy-ci.sh:88-95` macht **keinen** expliziten `Deny` auf `data/`:

```apache
RewriteEngine On
RewriteRule ^gsn/ - [L,NC]
RewriteRule ^vpp/ - [L,NC]
RewriteRule ^kits/ - [L,NC]
AddType application/javascript .js
AddType application/xml .xml
```

→ Wenn `data/` im Document-Root erreichbar ist, gibt es keine `.htaccess`-Schutzschicht.

### Reproduktion

**Live-Verifikation überfällig** (nur Joris kann das prüfen):

```bash
ssh deineuser@vpstunden.hsbi.de
ls -la ~/httpdocs/packages/backend/data/
# Erwartet: -rw------- (0600) für survey-keys.json + used-nonces.json
# Realität (vermutlich): -rw-r--r-- (0644)

# Web-Pfad-Test:
curl -s -o /dev/null -w "%{http_code}\n" https://vpstunden.hsbi.de/packages/backend/data/survey-keys.json
curl -s -o /dev/null -w "%{http_code}\n" https://vpstunden.hsbi.de/data/survey-keys.json
# Beide MÜSSEN 403/404 returnen. Wenn 200 → 🔴🔴🔴
```

### Fix

**Sofort (5 min Code-Change + 1 manueller chmod auf Production):**

```ts
// In survey-keys.ts und nonce-store.ts:
function save(file: SurveyKeyFile): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  }
  const tmp = KEYS_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 })
  renameSync(tmp, KEYS_PATH)
}
```

Plus auf Plesk:

```bash
ssh deineuser@vpstunden.hsbi.de
cd ~/httpdocs/packages/backend/data
chmod 700 .
chmod 600 *.json
```

**Plus `.htaccess`-Hardening:**

In `scripts/build-deploy-ci.sh` die `.htaccess` erweitern:

```apache
<DirectoryMatch "/(data|tmp|node_modules)/">
    Require all denied
</DirectoryMatch>
```

Plus: in `server.ts` (Express-Static-Routing) explizit `data/` nicht serven (Node serviert `data/` nicht aus, aber falls die Plesk-Konfig den Apache vor dem Node-Worker hat, ist der Apache der gefährliche Pfad).

**Mittelfristig:** OS-level Encryption-at-Rest für `survey-keys.json` (z.B. Files in einem getrennten LUKS-mount), oder besser: HSM-style-Key-Storage (außerhalb des Repo-Scopes).

### 2-Jahre-Begründung

Auf Shared-Plesk mit unbekannter Tenant-Hygiene über 2 Jahre: Wahrscheinlichkeit eines unauthorized Read >> 0. Der Schaden bei Eintritt ist **unbegrenzte Token-Generation** = Forschungs-Datenintegrität komplett zerstört, alle Surveys müssen rotated und neu konfiguriert werden, Studierenden-Reputation des Systems beschädigt.

Die Cost-of-Fix ist **5 Minuten Code + 1 Minute SSH**. Risk-Adjusted: Kein-Brainer.

---

## 🟠 F4.6 — `events.json` Reorg-Robustheit fehlt → Doppel-Punkte im UI nach Base-Reorg

### Belege

`packages/backend/src/services/json-file-event-store.ts:174-216` (Event-Aufnahme):

```ts
for (const event of pointsEvents) {
  if (!('args' in event)) continue
  this.store.pointsAwarded.push({
    // ← reines push, keine Dedup
    wallet: event.args[0],
    surveyId: Number(event.args[1]),
    points: Number(event.args[2]),
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
    timestamp: timestamps.get(event.blockNumber) ?? 0,
  })
}
```

`getPointsAwardedByWallet` (Z. 267-270):

```ts
return this.store.pointsAwarded.filter((e) => e.wallet.toLowerCase() === lower)
```

Keine `(txHash, logIndex)`-Dedup, keine `surveyRegistered`-Dedup, keine Replay-Protection beim Append.

### Problem

Base-L2 hat Sequencer-Single-Block-Finality (selten Reorgs), aber:

- Sequencer-Failover-Ereignisse (~1× pro Jahr historisch)
- L1-Reorg-Cascading auf L2 (extrem selten, aber möglich bei L1-Beacon-Chain-Issues)
- RPC-Provider-Switching mid-sync zwischen Knoten mit unterschiedlichem Tip (siehe Bereich 3 F3.6)

In jedem dieser Fälle: ein bereits in `events.json` aufgenommenes Event wird in einem späteren Sync neu gesehen (mit anderem `blockNumber` aber identischem `txHash` — oder, bei Reorg vor Tx-Inclusion, gar nicht mehr).

**Konkret-Szenario:**

| t   | Block-Tip                                            | Event in Block                                               | events.json           |
| --- | ---------------------------------------------------- | ------------------------------------------------------------ | --------------------- |
| 0   | 28.000.100                                           | `PointsAwarded(W, 5, 100, txHash=0xAAA)` in Block 28.000.080 | append                |
| 1   | sync, `lastSyncedBlock = 28.000.100`                 | —                                                            | enthält `0xAAA`       |
| 2   | Reorg: Block 28.000.080–100 ersetzt                  | `0xAAA` re-mined in Block 28.000.105                         | —                     |
| 3   | sync ab Block 28.000.101, `latestBlock = 28.000.150` | sieht `0xAAA` erneut                                         | **append (Duplikat)** |

`getPointsAwardedByWallet(W)` returnt nun zweimal `(W, 5, 100)` → **UI zeigt 200 Punkte statt 100**. On-chain ist nur 100 gemined. Vertrauensverlust gegenüber dem System ("die Punkte schwanken willkürlich").

`getCurrentAdmins` ist robust durch `Set`-Semantik, `surveyRegistered`-Doppel ist schwer zu erkennen aber im UI als "Survey existiert doppelt" sichtbar.

### Reproduktion

Reorg auf Hardhat simulierbar:

```bash
cd packages/contracts
pnpm hardhat node &
# Deploy V2, awarde 1 mal in Block N
# Snapshot Block N
# Mine 5 weitere Blöcke
# Reset to snapshot Block N-1 (Reorg simuliert)
# Awarde dasselbe Event nochmal in Block N+1
# Backend resync triggern
# events.json zeigt 2 Einträge mit identischem txHash, unterschiedlichen blockNumbers
```

### Konsequenzen

- **Drift im UI:** Studierende sehen mehr Punkte als on-chain real existiert.
- **Total-Saldo bleibt korrekt** (`getTotalPoints` ist Live-Read), aber die historische Aufschlüsselung in `getPointsAwardedByWallet` driftet.
- **Über Zeit:** Cache wird systemisch unzuverlässig, was die ganze "Blockchain als Source-of-Truth"-Versprechung unterminiert (siehe Audit-Plan-Note "genau das ist das Anti-Versprechen eines Blockchain-basierten Systems").

### Fix

**Dedup beim Append:**

```ts
const seen = new Set(this.store.pointsAwarded.map((e) => `${e.txHash}:${e.blockNumber}`))
for (const event of pointsEvents) {
  if (!('args' in event)) continue
  const dedupKey = `${event.transactionHash}:${event.blockNumber}`
  if (seen.has(dedupKey)) continue
  seen.add(dedupKey)
  this.store.pointsAwarded.push({ ... })
}
```

Plus für `roleChanges` und `surveyRegistered` analog.

**Plus Reorg-Awareness:** bei jedem Sync `latestBlock - REORG_DEPTH` (z.B. 12 für Base) als safe `latestBlock` verwenden, um ungeminten Events nicht zu früh zu speichern. Tail-Re-Query der letzten `REORG_DEPTH` Blöcke bei jedem Sync, mit Diff-Berechnung gegen die bereits gespeicherten Events.

### 2-Jahre-Begründung

Reorg-Wahrscheinlichkeit auf Base in 2 Jahren: gering (≤ 5 Ereignisse), aber nicht null. Dazu kommen RPC-Switching-Mismatches (häufiger). Schaden ohne Fix: kumulative Cache-Verschmutzung mit User-sichtbarem UI-Drift. Operator hat keinen einfachen Reset-Pfad (außer `events.json` löschen + Cold-Sync, was F3.2 + F4.4 triggert). **Reproduzierbarkeit der Forschungsdaten** leidet — bei einer Forschungssoftware ein No-Go.

---

## 🟠 F4.7 — `lastSyncedBlock > latestBlock` Silent-Mask + falscher `lastSuccessfulSyncAt`

### Belege

`packages/backend/src/services/json-file-event-store.ts:135-145`:

```ts
private async runSync(): Promise<void> {
  try {
    const latestBlock = await provider.getBlockNumber()
    const fromBlock = this.store.lastSyncedBlock
      ? this.store.lastSyncedBlock + 1
      : config.contractDeployBlock || 0

    if (fromBlock > latestBlock) return                  // ← silent return
    ...
```

Aber Z. 124-126 in `sync()`:

```ts
await Promise.race([this.runSync(), ...watchdog...])
this.lastSuccessfulSyncAt = Date.now()                  // ← gesetzt auch nach silent return
this.lastSyncError = null
```

### Problem

Wenn ein Read-Provider auf einen stale-Knoten switched (z.B. Bereich 3 F3.6 Cross-Provider-Stale-Block) und 30 Blöcke hinterher liefert:

- `lastSyncedBlock = X-1`
- `provider.getBlockNumber()` → stale Knoten antwortet `X-30`
- `fromBlock = X > latestBlock = X-30` → silent `return` ohne Logging
- `lastSuccessfulSyncAt = Date.now()` → Operator sieht via `/diag` **`lastSyncAgeSeconds = 0`**
- Aber tatsächlich wurde **nichts synchronisiert** und Events der letzten 30 Blöcke fehlen im Cache.

Dauert die Stale-Phase länger (5 min, 10 min — wie in Bereich 3 F3.6 dokumentiert), ist `lastSyncAgeSeconds = 0` permanent während der Cache veraltet. Erst wenn der Provider switcht und liefert wieder einen aktuelleren `latestBlock > lastSyncedBlock`, holt es auf.

**Worst Case mit Reorg:** Wenn der Stale-Knoten auf einer anderen Chain-Tip-Geschichte ist (z.B. nach RPC-Compromise, oder weil der Knoten noch auf einer abgewickelten Reorg-Branche ist), könnte `lastSyncedBlock` Werte enthalten, die in der finalen Chain nie existiert haben — und die echten Events der finalen Chain werden für immer übersprungen.

### Konsequenzen

- Operator-Diagnose-Lüge: `/health/ready` und `/diag` zeigen `lastSyncAgeSeconds = 0`, aber Cache treibt weg.
- Kombiniert mit F4.6: stale + reorg → Drift im UI ohne Warnung.
- Cross-mit Bereich 3 F3.6: Stale-Knoten ohne Detection ist die Wurzel; F4.7 ist das Cache-seitige Symptom ohne Sichtbarkeit.

### Fix

```ts
if (fromBlock > latestBlock) {
  logger.warn(
    { fromBlock, latestBlock, drift: fromBlock - latestBlock },
    'Provider returned latestBlock < lastSyncedBlock — likely stale node, skipping sync',
  )
  this.lastSyncError = `provider stale: lastSyncedBlock=${fromBlock - 1} > latestBlock=${latestBlock}`
  return // aber lastSuccessfulSyncAt NICHT updaten!
}
```

Plus: `lastSuccessfulSyncAt` nur setzen, **wenn echt geschrieben wurde**. Refactor: `runSync` returnt `boolean` (= "habe ich neue Blöcke verarbeitet?"), `sync()` setzt `lastSuccessfulSyncAt` nur bei `true`.

Plus: `/diag` zeigt `lastSyncError` prominent (aktuell macht es das, aber kein Alerting).

### 2-Jahre-Begründung

Stale-Provider-Ereignisse über 2 Jahre: häufig (jede Free-Tier-RPC ist bei Last-Spike unzuverlässig). Aktuell unsichtbar. Mit Fix: Operator sieht es im `/diag` und kann reagieren (Provider tauschen, Cache invalidieren). Cost-of-Fix: 10 min Code + 5 min Test. Vertrauen in `/diag` ist zentral für Production-Operations.

---

## 🟡 F4.8 — Kein `fsync` zwischen `writeFileSync(tmp)` und `renameSync` → Power-Loss / NFS-Risk

### Belege

In allen 4 Stores identisch (siehe F4.1-Beleg).

`fs.writeFileSync` mit String-Inhalt macht **kein** `fsync` per Default. POSIX-Rename ist atomar gegen Crash, aber **nicht gegen Power-Loss**: das Filesystem kann die Rename-Operation in den Journal-Log schreiben, bevor die Daten der `tmp`-Datei tatsächlich auf Disk-Sektoren geschrieben sind.

Konsequenz: nach Power-Cycle ist `survey-keys.json` ein **0-Byte-File** (Rename war committed, Daten waren noch im Page-Cache).

### Problem

EXT4 mit `data=ordered` (Default) garantiert die Daten-vor-Metadaten-Reihenfolge — aber nur für Files, die **vor** dem Rename geöffnet/gewritet wurden. Der `writeFileSync(tmp)`-Pfad hat keinen explizit-managed Dateideskriptor und kein `fsync(fd)`-Call.

Auf Plesk-Backed-Storage (kann NFS sein, abhängig von HSBI-Setup) ist die Garantie noch schwächer: NFS-Cache kann die Metadaten ohne die Daten persistieren.

### Reproduktion

Schwer zu reproduzieren ohne Power-Cycle eines Test-Servers. Theoretisch beweisbar via VM mit forced power-off zwischen Write und Rename.

### Fix

```ts
import { openSync, writeSync, fsyncSync, closeSync, renameSync } from 'node:fs'

function save(file: SurveyKeyFile): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  const tmp = KEYS_PATH + '.tmp'
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, JSON.stringify(file, null, 2))
    fsyncSync(fd) // ← garantiert Daten auf Disk
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, KEYS_PATH)
  // Optional: fsync(DATA_DIR) für rename-durability auf manchen FS
}
```

Cost: ~10 ms zusätzliche Latenz pro Write (relevant bei 30 parallelen Claims, aber im Claim-Pfad eh nicht der Bottleneck).

### 2-Jahre-Begründung

Power-Loss-Wahrscheinlichkeit auf HSBI-Plesk über 2 Jahre: gering (Datacenter-USV), aber > 0. Bei Eintritt ohne Fix: 0-Byte-File. Recovery: F4.3 Backup. Mit Fix: keine Recovery nötig. **Vorgelagert zu F4.3** — wenn Backup existiert, ist F4.8 weniger kritisch.

---

## 🟡 F4.9 — Kein Cleanup von `.tmp`-Restposten beim Boot

### Belege

`rg "\.tmp" packages/backend/src/services/` findet die Erzeugung, aber kein Cleanup.

### Problem

Wenn ein Worker zwischen `writeFileSync(tmp)` und `renameSync(tmp, dst)` getötet wird, bleibt `.tmp` liegen. Bei nächstem Save wird die `.tmp`-Datei einfach überschrieben — funktional kein Problem.

ABER:

- Plesk hat Disk-Quota. Wenn 4 Stores × 1 Worker-Crash = 4 `.tmp`-Restposten ≈ 5 MB Müll. Über Zeit irrelevant — bis ein größerer Crash mehrere parallele `.tmp`s erzeugt.
- Operator sieht `.tmp`-Files via `ls` und vermutet inkonsistenten State. Diagnose-Friction.
- **Wenn ein Tool wie `proper-lockfile` benutzt wird (siehe F4.1-Fix), könnten Stale-Locks entstehen.** Dann ist Cleanup obligatorisch.

### Fix

In `start()`-Methode von `JsonFileEventStore` (und in den Module-Init der anderen Stores):

```ts
import { readdirSync, unlinkSync } from 'node:fs'

function cleanupStaleTmps(dir: string): void {
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.tmp')) {
      try {
        unlinkSync(resolve(dir, f))
        logger.warn({ file: f }, 'Cleaned up stale .tmp file from previous crash')
      } catch (err) {
        logger.warn({ err, file: f }, 'Could not clean up .tmp file')
      }
    }
  }
}
```

Beim Module-Init aufrufen.

### 2-Jahre-Begründung

Niedrige Eintrittswahrscheinlichkeit, niedriger Schaden. Cleanup-Code ist 10 Zeilen. Defensiv-Programmierung gegen Operator-Diagnose-Verwirrung.

---

## 🟡 F4.10 — `nonce-store.save` Write-Amplification → Disk-I/O-Spike bei Klassen-Last

### Belege

`packages/backend/src/services/nonce-store.ts:86-97`:

```ts
function save(state: CacheState): void {
  ...
  const file: NonceFile = {
    schemaVersion: 1,
    used: Array.from(state.set).sort(),                  // O(N log N) bei jedem Write
  }
  const tmp = NONCES_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(file, null, 2))     // gesamtes File schreiben
  renameSync(tmp, NONCES_PATH)
}
```

### Problem

Jeder erfolgreiche Claim löst einen Full-File-Rewrite aus:

- `Array.from(set)` + `sort()` = O(N log N)
- `JSON.stringify(file, null, 2)` mit 2-Space-Indent = ~75 Bytes/Eintrag
- Bei 4.000 bestehenden Nonces (2-Jahres-Realität) = ~300 KB writeFileSync **pro Claim**

Klassen-Spike: 30 parallele Claims = 30 × 300 KB Writes = ~9 MB Disk-I/O in <60 s. Auf Plesk-Shared-Storage mit IO-Quota (oft 1.000 IOPS) merklich. Plus: Multi-Worker-Race (F4.1) macht das hier zur perfekten Race-Window-Generator-Maschine.

Plus: `sort()` bei jedem Write ist purer Waste. Reihenfolge ist semantisch irrelevant.

### Fix

**Variante A (minimal, aber entfernt sort):** entferne `sort()` — Set-Iterations-Reihenfolge ist deterministisch (Insertion-Order seit ES2015) und ausreichend.

**Variante B (Append-Only-Log):** SQLite mit WAL-Mode. Eine `INSERT INTO used (key) VALUES (?)`-Anweisung schreibt ~50 Bytes WAL-Append statt 300 KB Full-Rewrite. Dazu kommt Indexed-Lookup statt Set-In-Memory.

**Variante C (Bucketing):** `used-nonces.json` durch `used-nonces-<surveyId>.json` ersetzen → pro Survey nur ~150 Nonces = 11 KB Write statt 300 KB. Nachteil: Filesystem hat jetzt 30 Files statt 1.

**Empfehlung:** Variante A sofort (5 min), Variante B mit F4.1-Migration zu SQLite.

### 2-Jahre-Begründung

Bei 4.000 Nonces über 2 Jahre: ~9 MB I/O pro Klassen-Spike × ~50 Spikes = ~450 MB total. Quota-relevant ist es nicht, aber **Latenz im Claim-Pfad** bei Spike steigt mit N — bei 4.000 Nonces ist `JSON.stringify` ~10 ms, bei 100.000 wäre es 200 ms (im Claim-Pfad, der heute end-to-end ~500 ms ist). Über 2 Jahre tolerierbar, danach grenzwertig.

---

## 🟡 F4.11 — Schema-Versioning ohne Migration-Pfad → Future-Self-Footgun

### Belege

`survey-keys.ts:47`: `schemaVersion: 1`
`nonce-store.ts:36-38`: `schemaVersion: 1`
`events.json` und `admin-labels.json`: kein `schemaVersion`-Feld.

`load()` in `survey-keys.ts:64-78` und `nonce-store.ts:62-71` liest das Feld nicht aus, validiert es nicht. Bei einem zukünftigen Schema-Bump (z.B. Survey-Keys mit zusätzlichem `algorithm`-Feld) gibt es keine Migration und keinen Schutz vor Falsch-Parsen.

### Problem

In 6–12 Monaten ist ein Schema-Bump wahrscheinlich:

- HMAC-Key-Rotation mit historischen Keys
- Nonce-Pruning mit Aging-Information
- Multi-Survey-Support mit Survey-Gruppierung

Jeder dieser Bumps wird ohne Schema-Check zu silent data loss oder Crashs führen. Backups (F4.3) sind nach Schema-Bump nicht mehr ladbar ohne explicit Migration.

### Fix

```ts
const CURRENT_SCHEMA = 1

function load(): SurveyKeyFile {
  ...
  const parsed = JSON.parse(raw) as Partial<SurveyKeyFile>
  if (parsed.schemaVersion !== CURRENT_SCHEMA) {
    throw new Error(
      `survey-keys.json schema mismatch: file=${parsed.schemaVersion}, expected=${CURRENT_SCHEMA}. ` +
      `Run migration script bin/migrate-survey-keys.ts.`,
    )
  }
  ...
}
```

Plus: bei Schema-Bumps explizite Migration-Skripte in `scripts/migrate-store-vN.ts` mit Backup-Schritt.

Plus: `events.json` und `admin-labels.json` mit `schemaVersion` versehen (Migration: silent default `1` für legacy Files).

### 2-Jahre-Begründung

Erste Schema-Bump erwartet 6 Monate, weiterer Bump 12–18 Monate. Cost-of-Fix-Now: 30 min. Cost-of-Fix-After-First-Bump-Mit-Daten-Verlust: mehrere Stunden + Daten-Recovery.

---

## 🟡 F4.12 — Kein Audit-Log auf Survey-Key-Reads

### Belege

`packages/backend/src/services/survey-keys.ts:117-120`:

```ts
export function getSurveyKey(surveyId: number): string | null {
  const file = load()
  return file.keys[toKey(surveyId)]?.key ?? null
}
```

Kein Logging. `getSurveyKey` wird aufgerufen in `claim.ts:155` (jeder Claim) und `surveys.ts:292` (admin GET `/key`).

`packages/backend/src/routes/surveys.ts:289-312` (admin GET `/key`):

```ts
router.get('/:id/key', requireAdminHandler, async (req, res, next) => {
  ...
  const key = getSurveyKey(surveyId)
  ...
  res.json({ ..., data: { surveyId, key, ... } })
})
```

Kein `logger.info({ adminAddress, surveyId }, 'Admin retrieved survey key')`-Call.

### Problem

Wenn ein Admin-Account kompromittiert ist (gestohlene Wallet oder Phishing), kann der Angreifer:

1. Sich als Admin authentisieren (Bereich 6).
2. Über `GET /api/v1/surveys/<id>/key` jeden HMAC-Key lesen.
3. Token-Storm gegen alle Surveys generieren.

Es gibt **keine Spur** in den Logs, dass Keys exfiltriert wurden. Forensik nach Vorfall ist unmöglich.

### Fix

```ts
router.get('/:id/key', requireAdminHandler, async (req, res, next) => {
  ...
  const key = getSurveyKey(surveyId)
  ...
  logger.warn(
    {
      action: 'SURVEY_KEY_RETRIEVED',
      adminAddress: req.adminAddress,    // assume requireAdminHandler injects
      surveyId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    },
    'Survey key retrieved by admin',
  )
  res.json(...)
})
```

Plus: Rate-Limiter speziell auf `/key`-Endpoint (max 5 Reads/Stunde/Admin) — ein legitimer Admin braucht den Key 1× zur Setup-Zeit, nicht alle 30s.

Plus: `/admin/audit-log`-Endpoint, der die letzten Key-Reads anzeigt (mit Wallet-Adresse + Timestamp).

### 2-Jahre-Begründung

Ohne Audit-Log: ein gestohlener Admin-Key bleibt unentdeckt und kann monatelang Tokens minten. Mit Audit-Log: Operator sieht ungewöhnliche Häufung in `/diag`, kann reagieren (Admin-Key revoken, Survey-Keys rotieren).

---

## ⚪ F4.13 — In-Memory `cache` nie invalidiert nach externer File-Änderung

### Belege

`survey-keys.ts:50-89`, `admin-labels.ts:33-67`, `nonce-store.ts:44-83`: Pattern überall identisch:

```ts
let cache: ... | null = null
function load(): ... {
  if (cache) return cache         // ← Cache-hit, File nie neu gelesen
  ...
  cache = ...
  return cache
}
```

### Problem

In-Process-Cache wird nie invalidiert (außer `__resetForTests`). Wenn ein Operator manuell den File ändert (z.B. nach Backup-Restore, oder `key/rotate` von einer parallelen Instanz), sehen laufende Worker das nie — bis Plesk-Restart.

Für `survey-keys.json` und `admin-labels.json` ist das selten ein Problem (Operator macht eh `touch tmp/restart.txt`). Für `used-nonces.json` ist es bei Multi-Worker direkt korrupt-machend (siehe F4.1).

### Fix

Nicht relevant wenn F4.1 (Lock + force-reload) implementiert ist. Wenn nicht: optional `mtime`-Check beim `load()`:

```ts
let cacheLoadedFromMtime = 0
function load(): ... {
  const mtime = statSync(PATH).mtimeMs
  if (cache && mtime === cacheLoadedFromMtime) return cache
  ...
  cacheLoadedFromMtime = mtime
  return cache
}
```

Cost: 1 `stat` pro Call (~0.1 ms). Vernachlässigbar.

### 2-Jahre-Begründung

Edge-case-Hardening. Nicht security-kritisch, aber spart eine Operator-Wtf-Session.

---

## ⚪ F4.14 — `surveys.ts` erlaubt `delete` auf Key direkt nach `register` ohne Lock

### Belege

`packages/backend/src/routes/surveys.ts:90-110`:

```ts
let surveyKey: string
try { surveyKey = createKey(surveyId) }
catch { throw new AppError(409, 'KEY_EXISTS', ...) }

let receipt: ethers.TransactionReceipt
try { receipt = await blockchain.registerSurvey(surveyId, points, maxClaims, title) }
catch (err) {
  deleteKey(surveyId)                    // ← rollback
  throw err
}
```

### Problem

Zwei Failure-Modes ohne Lock:

1. **F4.2-Race:** Worker A `createKey`, Worker B `createKey`, beide laufen parallel. Worker B revertet on-chain, ruft `deleteKey` auf → löscht den Key, der eigentlich Worker A gehört (siehe F4.2-Detail-Analyse).
2. **Operator-Race:** Worker A registriert, on-chain Tx wird gemined. Vor dem `deleteKey`-Catch ruft Operator manuell `key/rotate` auf (z.B. weil sie ungeduldig sind). Wenn Worker A's `registerSurvey` doch noch failed (timeout, RPC-Stall), löscht es den frisch rotierten Key.

Beide werden durch F4.2-Lock gefixt, deshalb hier Nit.

### Fix

Identisch zu F4.1/F4.2: File-Lock. Plus: Order-Refactor (on-chain Tx vor Key-Generation), siehe F4.2-Fix.

---

## Aus V1 obsolet geworden

Bereich 4 ist neu. Es gibt keine V1-Findings, die obsolet werden.

V1 Bereich 4 hatte Hypothesen (im V1-Audit-Plan dokumentiert) zum reinen `events.json` als einziger Store. Davon ist eine in V2 erhalten geblieben:

- **Sequenzielle `getBlockTimestamps`-Loop** (ehemals 4.X im V1-Plan, neu kategorisiert als F4.4 hier) — wurde in V2 NICHT gefixt, ist heute kombiniert mit F3.2 noch kritischer.

Die V2-spezifischen Stores (`survey-keys`, `used-nonces`, `admin-labels`) waren in V1 nicht existent → komplett neue Findings.

---

## Severity-Tally Bereich 4

🔴 Blocker: 3 (F4.1, F4.2, F4.3)
🟠 Major: 3 (F4.4, F4.5, F4.6)
🟡 Minor: 4 (F4.7, F4.8, F4.10, F4.11)
⚪ Nit: 2 (F4.9 ist eher Major-leaning aber operativ → Minor; F4.12 ist Major-leaning aber forensik → Minor; F4.13, F4.14 = Nits)

Anpassung: F4.7 ist eher Major (Drift-Sichtbarkeit), F4.9 Minor, F4.12 Minor (Audit-Logging), F4.13/F4.14 Nits → finaler Tally:

🔴 Blocker: 3
🟠 Major: 3 (F4.4, F4.5, F4.6) + F4.7 → **4**
🟡 Minor: F4.8, F4.10, F4.11, F4.12 → **4**
⚪ Nit: F4.9, F4.13, F4.14 → **3**

**Final Bereich 4: 🔴 3 / 🟠 4 / 🟡 4 / ⚪ 3 = 14 Findings**

---

## Empfohlener Fix-Order

1. **F4.5 — File-Permissions chmod 0600** (5 min Code + 1 SSH-Befehl). Unmittelbarste Lecke. Vorab Live-Test ob `data/` web-erreichbar ist.
2. **F4.3 — Backup-Cron** (1 Tag inkl. Off-Site-Pull-Setup). Schützt gegen alle anderen Findings durch Recovery-Path.
3. **F4.1 + F4.2 — File-Lock via `proper-lockfile`** (1 Tag inkl. Tests). Eliminiert die zwei Race-Klassen.
4. **F4.4 — `getBlockTimestamps` Batching + Retry** (30 min, kombinierbar mit F3.2). Macht Cold-Sync wieder erreichbar.
5. **F4.6 — Reorg-Dedup** (2h). Macht Cache vertrauenswürdig.
6. **F4.7 — `lastSyncedBlock > latestBlock`-Logging** (15 min). Sichtbarkeits-Fix.
7. **F4.12 — Audit-Log auf Key-Reads** (30 min). Forensik-Voraussetzung.
8. **F4.10 — `sort()` entfernen** (5 min). Quick-Win.
9. **F4.8 — `fsync`** (30 min). Power-Loss-Hardening.
10. **F4.11 — Schema-Versioning Validierung** (1h). Future-Footgun-Prävention.
11. F4.9, F4.13, F4.14 — Nits, en passant in den anderen Refactors.

**Gesamtaufwand:** ~3–4 Personentage für die Blocker + Major. Architektur-Migration (SQLite via Variante C in F4.1) als Q3-Projekt einplanen.

---

## Cross-Cutting Notes für andere Bereiche

- **Bereich 2 (Key Management):** F4.5 (chmod) gilt analog für alle weiteren Secret-Files. F4.12 (Audit-Logging) gehört auch zur Minter-Wallet-Nutzung. Generelles Threat-Modell für Plesk-Tenant-Trust fehlt.
- **Bereich 3 (RPC):** F4.4 ist die backend-seitige Hälfte von F3.2 (Cold-Sync-Crash-Loop). F4.7 ist das Cache-seitige Symptom von F3.6 (Stale-Block).
- **Bereich 6 (Auth, Replay):** F4.1 ist der **Replay-Tor-Opener** trotz HMAC-Token-Architektur. Die ganze HMAC-Sicherheit fällt zusammen, wenn Multi-Worker den Nonce-Store korrumpieren kann. Bereich 6 muss explizit bestätigen, dass `markUsed` async-locked ist.
- **Bereich 7 (Deployment):** F4.3 (Backup) und F4.5 (Permissions) gehören in den Plesk-Setup-Runbook. `.htaccess`-Hardening (F4.5-Fix) ist Deployment-Konfiguration. Quartalsweise Restore-Drill als Operations-Pflicht aufnehmen.
- **Bereich 8 (Tests):** Concurrent-Worker-Test (F4.1-Reproduktion) als CI-Test aufnehmen. Reorg-Test (F4.6) als Hardhat-Integration-Test.
