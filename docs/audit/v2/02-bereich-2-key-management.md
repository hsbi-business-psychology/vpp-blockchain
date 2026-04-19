# Bereich 2 — Backend Key Management & Minter-Wallet (V2-Audit)

**Auditor:** Senior Auditor (extern, second pass)
**Stand:** 2026-04-18
**Scope:** Minter-Wallet-Lifecycle (Generierung → Storage → Boot-Load → in-process-Use → Tx-Submit → Receipt → Recovery), `blockchain.ts` (NonceManager, FallbackProvider-write-Pfad, `assertSufficientBalance`), `config.ts` (Boot-Validierung), `admin.ts` (`addAdmin`/`removeAdmin`-Relayer-Pfad), `deploy-v2.ts` (Rollen-Vergabe), `.env.production.example` + `docs/deployment.md` (Plesk-Storage-Modell), Logging-Hygiene (`logger.ts`, `errorHandler.ts`).

---

## Executive Summary

Das V2-Backend-Key-Management hat **zwei strukturelle Owner-Akzeptanzen** (Minter-mit-ADMIN_ROLE, Klartext-Minter-Key in der Plesk-Node.js-ENV-Konfiguration), die in dieser Audit-Iteration explizit als **bewusst eingegangene Risiken** behandelt werden — nicht als Findings. Diese Akzeptanzen sind operativ tragfähig **unter** vier Bedingungen:

1. Es gibt **keinen zweiten Klartext-Wohnort** für den Minter-Key außerhalb der Plesk-Konfiguration.
2. Es gibt **einen geschriebenen Recovery-Plan**, der den Compromise-Worst-Case (volle ADMIN-Übernahme on-chain) explizit annimmt.
3. Die **Doku** (`docs/security.md`) sagt die Wahrheit über diese Akzeptanzen — sonst arbeitet jede:r künftige Reviewer:in (Datenschutz, HSBI-IT, Klausurbüro) mit falschem Threat-Model.
4. Die **operativen Reflexe** (Gas-Spike-Schutz, Balance-Alarm, Boot-Format-Validierung, Logging-Redact) machen **wenigstens das, was man kostenlos haben kann**.

Heute scheitert der Code an **allen vier** Bedingungen.

**Konkrete Fund-Liste:**

- 🔴 **F2.1** — `packages/backend/probe.mjs:7` enthält den **Live-Mainnet-Minter-Privatekey im Klartext** (`0xd1bec0…5336`). Untracked, war NIE committed (verifiziert via `git log --all -S`), aber liegt seit Wochen lokal auf der Owner-Maschine. Bombe: ein einziges versehentliches `git add .`, ein Repo-Sync auf einen anderen Host, ein lokales Backup ins falsche Cloud-Konto, ein `rsync` ohne Excludes nach Plesk. Nicht akzeptiertes Risiko.
- 🔴 **F2.2** — Kein dokumentierter Recovery-Pfad für Minter-Compromise. `v2-migration-runbook.md` enthält 0 Treffer auf `compromise|recover|emergency`. `security.md:66` ist eine Drei-Zeilen-Lüge ("revoke MINTER_ROLE" — reicht nicht, weil Minter auch ADMIN_ROLE hat). Owner hat das Trade-off Minter=Admin akzeptiert; das macht den Recovery-Plan **wichtiger**, nicht unwichtiger.
- 🟠 **F2.3** — Kein Gas-Hard-Cap in den Write-Pfaden (`blockchain.ts:218-424`). Base-Spike-Welle kann eine einzelne `awardPoints`-Tx zur Balance-Vernichterin machen.
- 🟠 **F2.4** — `MIN_BALANCE_WEI = 50_000n * 1_000_000n` (`blockchain.ts:192`) = 0,00000005 ETH = pro-Gas-Unit-Kosten, nicht Tx-Kosten. Schwelle ist 16× zu niedrig dimensioniert. Plus: `/health/diag` exposed Balance, aber kein automatisches Alerting.
- 🟠 **F2.5** — `lib/logger.ts:3-8` ohne `redact`-Konfig; `errorHandler.ts:234` loggt rohe `err`-Objekte. Bei einem Boot-Crash mit Format-Fehler im Key (siehe F2.7) → Klartext-Key im Plesk-Worker-Log. Cluster mit Bereich 6 F6.4.
- 🟠 **F2.6** — `docs/security.md` ist an mindestens 5 Stellen falsch (Minter-Rolle, Compromise-Impact, UPGRADER_ROLE-Existenz, Rate-Limit-Default, Plesk-Snapshot-Behauptung). Das ist nicht nur kosmetisch: jeder externe Reviewer (HSBI-Datenschutz, externe Audits, Hochschul-IT-Audit) trifft Entscheidungen auf Basis dieser Doku.
- 🟡 **F2.7** — `config.ts:13-19` `required()` prüft nur Anwesenheit, kein Hex-Format / 0x-Prefix / 32-Byte-Length. Tippfehler im Key landet via Crash-Stack-Trace im Log.
- 🟡 **F2.8** — `NonceManager` ist in-memory (`blockchain.ts:185`); `errorHandler.ts:35-122` mappt KEIN `nonce too low` / `replacement transaction underpriced`. Bei Worker-Restart mit in-flight-Tx + Provider-Switch → generischer 500.
- 🟡 **F2.9** — ETH-Refill-Prozess undokumentiert. `deployment.md:251` empfiehlt manuelles BaseScan-Watching. Niemand definiert, wer wann was tut.
- ⚪ **F2.10** — `.env.production.example` und `docs/deployment.md:107` listen Plesk-Panel-ENV-Var und `.env`-Datei als gleichwertige Optionen, ohne die Konsequenzen zu unterscheiden. Jetzt wo Plesk-Panel als Owner-Decision festgelegt ist: `.env`-Datei-Option streichen.

**Insgesamt: 10 Findings (2 🔴 / 4 🟠 / 3 🟡 / 1 ⚪).**

Plus zwei explizit dokumentierte **Owner-Decisions** (Section "Documented Owner Decisions" am Ende), die kein Finding sind, aber für künftige Reviewer:innen sichtbar dokumentiert werden müssen.

---

## Findings

### 🔴 F2.1 — `packages/backend/probe.mjs` enthält Live-Mainnet-Minter-Privatekey im Klartext

**File:Line:** `packages/backend/probe.mjs:7`

**Problem:**

```js
// probe.mjs:6-10
const PROXY = '0x8b8Ed86CEC6f886EC5AE208C1Ef3B084d91a86Dd'
const MINTER_PK = '0xd1be…5336' // [REDACTED — live Mainnet minter PK, see audit log]
const wallet = new ethers.Wallet(MINTER_PK, p)
const TARGET = '0xBeDaA5C0F5d250B5aBC82d79CA35E0F2BfE12B76'
```

> **Forensik-Hinweis:** Der vollständige Hex-Wert wurde aus dieser Datei
> entfernt, nachdem `probe.mjs` gelöscht wurde (Audit-Log 2026-04-19). Der
> Wert ist im AUDIT-LOG.md `Documented Risk Acceptance`-Eintrag M1 mit
> Sha256-Hash referenziert, falls Forensik nachträglich nötig ist.

Der Live-Mainnet-Minter-Privatekey steht als Hex-Literal im Quellcode. Diese Datei:

- ist `untracked` (verifiziert: `git ls-files packages/backend/probe.mjs` → leer),
- wurde **nie** in der Git-History committed (verifiziert: `git log --all -S "<MINTER_PK>"` → 0 Treffer auf allen Branches),
- liegt seit Wochen auf der Owner-Maschine (Git-Status zeigt sie ohne `.last_modified`-Detail, aber sie ist Teil des `?? packages/backend/probe.mjs`-Status seit dem letzten Restart-Snapshot des Audits).

**Warum das trotzdem ein Blocker ist:** Owner-Decisions zu Storage-Optionen (Plesk-Klartext-ENV ist ok) ändern **nichts** an einer lokalen Bombe, die genau der Storage-Hygiene widerspricht, die im restlichen Repo praktiziert wird (`.env.example` mit Platzhalter, niemals Live-Key irgendwo).

**Realistische Leak-Pfade in den nächsten 2 Jahren:**

1. **`git add .` aus Versehen.** Owner arbeitet im Repo, macht eine Änderung in `packages/backend/src/` und tippt Reflex `git add . && git commit -m "fix"`. probe.mjs landet im Commit. Wenn Owner-Push direkt nach main: in 60 s öffentlich auf GitHub. force-push danach hilft nicht: GitHub-API-Mirror behält die Blobs für 90 Tage, Forks/Clones haben den Blob für immer. Gefundenheits-Wahrscheinlichkeit: <5 min (öffentliche GitHub-Search-Bots scannen kontinuierlich auf `0x[a-f0-9]{64}`-Patterns).
2. **rsync nach Plesk ohne Excludes.** Wenn der CI-Deploy mal hängt und der Owner manuell mit `rsync -avz packages/backend/ plesk:/httpdocs/packages/backend/` arbeitet (ohne `--exclude probe.mjs`), landet die Datei auf Plesk. Plesk serviert per Default keine `.mjs` aus dem Backend-Folder, aber: `data/`-Permissions-Audit (siehe Bereich 4 F4.5) zeigt, dass Plesk-Tenant-Read auf `packages/backend/`-Files greifbar ist.
3. **Lokales Backup ins falsche Konto.** Time Machine, iCloud-Sync, Dropbox-Folder, GitHub-Desktop's Repo-Backup — jedes davon nimmt das untrackede File mit. Bei einem Backup-Provider-Compromise (Dropbox-Token-Leak, iCloud-Hijack via SIM-Swap) → Key öffentlich.
4. **Pair-Programming / Bildschirm-Share.** Owner zeigt jemand anderem im Repo-Browser kurz das Backend-Verzeichnis → File-Listing in der Sidebar zeigt `probe.mjs`, Hover-Preview oder versehentliches Öffnen → Key auf Bildschirm-Recording.
5. **Editor-LSP-Sync.** VS-Code mit Settings-Sync, Cursor mit Cloud-Backup, JetBrains mit Toolbox-Sync — alles sync't den Workspace-State (oft inklusive Untracked-Files-Liste mit Pfaden, manchmal inklusive Datei-Contents in Cache-Indices).

**Fix (5 Sekunden, sofort, keine Diskussion):**

```bash
# 1. Schlüssel aus probe.mjs löschen
rm packages/backend/probe.mjs

# 2. Ist der Key nur lokal in probe.mjs gewesen? Falls JA: nichts weiter zu tun.
#    Falls NEIN (irgendwo anders aufgetaucht, z.B. in Slack, in einem alten
#    Backup, in einem GitHub-Issue, in einer CI-Log): ROTIEREN.
```

**Optional (empfohlen, weil "nur lokal" nicht beweisbar ist):**

```bash
# Minter-Key sicherheitshalber rotieren:
# 1. Neue Wallet generieren (lokal, mit ethers.Wallet.createRandom() in einem Throwaway-Script)
# 2. Neue Wallet in Plesk-ENV setzen (Plesk-Panel)
# 3. Plesk-Restart (touch tmp/restart.txt)
# 4. Mit alter Wallet via BaseScan oder einem geprüften CLI-Skript:
#    grantRole(MINTER_ROLE, NEW_ADDRESS)
#    grantRole(ADMIN_ROLE, NEW_ADDRESS)  // = addAdmin(NEW_ADDRESS)
#    revokeRole(MINTER_ROLE, OLD_ADDRESS)
#    revokeRole(ADMIN_ROLE, OLD_ADDRESS)  // = removeAdmin(OLD_ADDRESS)
# 5. Alte Wallet leeren (transfer ETH zur neuen Wallet, ohne Restbalance)
# 6. probe.mjs ENDGÜLTIG löschen, NICHT als Template behalten
```

**Was statt probe.mjs als Owner-Reflex:**

Owner braucht offensichtlich gelegentlich eine "wie sieht das on-chain wirklich aus"-Probe. Statt Klartext-Key in einer Datei: **`packages/backend/scripts/probe.mjs.example`** als Template ohne Key, plus Doku im Header:

```js
// scripts/probe.mjs.example
// Copy to scripts/probe.mjs (gitignored), set MINTER_PK from your password manager,
// run with `node scripts/probe.mjs`, DELETE after use.
import { ethers } from 'ethers'
const MINTER_PK = process.env.MINTER_PK_PROBE // <-- aus 1Password/Bitwarden/etc, NICHT aus Datei
if (!MINTER_PK) throw new Error('Set MINTER_PK_PROBE env var')
// ... rest
```

Plus `scripts/probe.mjs` zur `.gitignore` hinzufügen (NICHT nur `*.env`, weil das `.mjs` nicht erfasst).

**2-Jahre-Begründung:** Über 2 Jahre × tausende Git-Operationen × diverse Backup-Sync-Pfade × eine immer mal wieder benutzte Owner-Maschine geht eine 1×10⁻³-Wahrscheinlichkeit pro Operation ziemlich sicher gegen 1. Ein einziger Leak = sofortiger on-chain Take-Over (siehe Worst-Case-Skizze in Bereich 2 Pre-Work + Skizze A unten). Das einzige was den Schaden überhaupt begrenzt ist die DEFAULT_ADMIN_ROLE-Wallet (Hochschule), die einen UUPS-Notfall-Upgrade ausführen kann — und dafür braucht man F2.2 (Recovery-Plan) als Voraussetzung.

---

### 🔴 F2.2 — Kein Recovery-Plan für Minter-Compromise; security.md erzählt eine harmlose Lüge

**File:Line:** `docs/v2-migration-runbook.md` (kompletter File hat 0 Treffer auf `compromise|recover|emergency`), `docs/security.md:60-66`

**Problem:**

Owner hat zwei Trade-offs akzeptiert:

1. Minter hat ADMIN_ROLE (deploy-v2.ts:497-500).
2. Minter-Key liegt im Klartext in der Plesk-Node.js-ENV-Konfiguration (`docs/deployment.md:107`).

Beide Akzeptanzen sind operativ tragfähig — **wenn** ein Recovery-Plan existiert. Existiert nicht.

**Was es heute gibt:**

```text
// docs/security.md:60-66 (Auszug)
### Backend Minter Key (Server)
- Server wallet holds `MINTER_ROLE` on the contract.
- Private key stored in `.env` (never committed to the repository).
- This wallet pays gas for all transactions.
- **Compromise impact:** an attacker can call `awardPoints` freely until the
  role is revoked. It cannot mint retroactively for wallets that already
  claimed (on-chain `_claimed` guard still holds), and it cannot modify
  survey configuration. Mitigation: admin can instantly revoke `MINTER_ROLE`
  and re-grant it to a new backend wallet; no contract redeploy required.
```

**Drei Lügen in einem Absatz:**

1. **"Server wallet holds `MINTER_ROLE`"** — falsch. Hält MINTER_ROLE **und** ADMIN_ROLE (deploy-v2.ts:492-503, Owner-akzeptiert).
2. **"Compromise impact: an attacker can call `awardPoints` freely … and it cannot modify survey configuration"** — falsch. Mit ADMIN_ROLE kann der Angreifer auf `cast`/`ethers`-Ebene ohne Backend-Beteiligung:
   - `addAdmin(0xATTACKER)` → permanent Admin
   - `removeAdmin(0xLEGITIMATE)` für jeden anderen Admin (LastAdmin-Schutz nur für den letzten verbleibenden)
   - `deactivateSurvey(N)` für jede laufende Survey
   - `revokePoints(0xVICTIM, surveyId)` für jeden Studi-Punkt
   - `markWalletSubmitted(0xANY)` → manipuliert HSBI-Note-Vergabe
3. **"Mitigation: admin can instantly revoke `MINTER_ROLE` and re-grant it to a new backend wallet"** — falsch. Reicht nicht: nach `revokeRole(MINTER_ROLE, OLD_MINTER)` hat der Angreifer **immer noch ADMIN_ROLE** und kann `addAdmin(0xATTACKER)` ausführen. Korrekt: `removeAdmin(OLD_MINTER) + revokeRole(MINTER_ROLE, OLD_MINTER) + addAdmin(NEW_MINTER) + grantRole(MINTER_ROLE, NEW_MINTER)`. Plus: `removeAdmin(OLD_MINTER)` wird vom **Backend** mit `requireAdminHandler` blockiert (`routes/admin.ts:131-138` — `MINTER_PROTECTED`-Check). Das heißt: Recovery muss **direkt** via BaseScan/`cast` von einer **anderen** Admin-Wallet ausgeführt werden, nicht über das eigene Backend.

**Realistische Recovery-Sequenz (bisher nirgendwo dokumentiert):**

```text
T+0:  Verdacht/Beweis: Minter-Key kompromittiert.

T+5:  ENTSCHEIDUNG: Recovery via legitime Admin-Wallet (NICHT via Backend!),
      weil das Backend mit dem alten Minter signiert.

T+10: Identifizieren: welche Admin-Wallet ist sicher? Bei Single-Admin-
      Setup (Owner = einziger ADMIN, plus Minter): Owner-Wallet ist die
      einzige Recovery-Option. Bei Mehr-Admin-Setup: jeder verbleibende
      ehrliche Admin reicht.

T+15: Aus Owner-Wallet (z.B. via MetaMask + BaseScan-"Write Contract"-
      Interface ODER via `cast`):

      1. addAdmin(NEW_MINTER_ADDRESS)             — neuer Backend-Minter
                                                    bekommt ADMIN
      2. grantRole(MINTER_ROLE, NEW_MINTER_ADDRESS) — und MINTER
      3. removeAdmin(OLD_MINTER_ADDRESS)          — alter Minter verliert
                                                    ADMIN
      4. revokeRole(MINTER_ROLE, OLD_MINTER_ADDRESS) — verliert MINTER
      5. (parallel: alte Wallet leeren — sweep ETH zur Owner-Wallet,
         damit der Angreifer kein Gas mehr für andere unsignierte Reverts
         hat)

T+30: Plesk-ENV-Update mit NEW_MINTER_PRIVATE_KEY, touch tmp/restart.txt.
      Backend startet mit neuer Wallet, alle Backend-relayed Auth-Pfade
      funktionieren wieder.

T+45: VERIFY: cast call <PROXY> "isAdmin(address)(bool)" OLD_MINTER → false
                                                          NEW_MINTER → true
              cast call <PROXY> "hasRole(bytes32,address)(bool)"
                  <MINTER_ROLE> NEW_MINTER → true
                  <MINTER_ROLE> OLD_MINTER → false

T+60: POST-MORTEM: wie kam der Angreifer an den Key? probe.mjs-Leak?
      Plesk-Tenant-Read? Insider? Doku im Repo unter docs/incidents/.
```

**Wenn die DEFAULT_ADMIN_ROLE-Wallet auch kompromittiert ist** (worst-case): UUPS-Upgrade auf eine neue Implementation, die im `_authorizeUpgrade`-Init **alle** alten Rollen revoked und neue setzt. Aufwand: 1-2 Tage, Implementierung + Test + Deploy. Pre-baked Notfall-Implementation als `SurveyPointsV2RecoveryStub.sol` im Repo halten, damit man im Stress-Fall nicht erst Code schreiben muss.

**Was alles im Recovery-Plan stehen muss (Mindest-Set):**

```markdown
docs/runbooks/minter-compromise-recovery.md

1. ESCALATION TREE
   - Wer wird wann benachrichtigt? Owner-Phone, IT-Hochschule, Datenschutz.
2. INDICATORS (woran erkenne ich Compromise?)
   - Unerwartete Tx von Minter-Wallet (Watch-Service auf BaseScan).
   - Unbekannte Admin-Adressen in /api/v1/admin (siehe F2.4-Alerting).
   - Logs mit RPC-Errors die nicht zu legitimen Backend-Operations passen.
3. CONTAINMENT (sofort)
   - 3a. Plesk Node.js-App stoppen (verhindert weitere legitime Tx, die
     mit der jetzt-vergifteten Logik kollidieren könnten).
   - 3b. Wallet-Sweep: ETH von OLD_MINTER zur Owner-Wallet, damit Angreifer
     kein Gas-Budget mehr hat.
4. RECOVERY (oben dokumentierte 6-Schritt-Sequenz)
5. POST-MORTEM
   - Tx-Liste seit Compromise-Verdacht: was hat der Angreifer getan?
     Welche addAdmin/removeAdmin/revokePoints? Manuelle Reverse-Ops.
   - Source-Identifikation: Plesk-Logs, lokale probe-Files, Git-History,
     Browser-Extensions, geteilte Maschinen.
6. KOMMUNIKATION
   - Studis informieren bei revokePoints-Schaden.
   - Datenschutz informieren bei markWalletSubmitted-Manipulation
     (HSBI-Note-Verzerrung ist potentiell prüfungsrechtlich relevant).
```

**Plus security.md komplett neu schreiben** (siehe F2.6 für vollständige Korrektur-Liste).

**2-Jahre-Begründung:** Owner hat zwei Trade-offs akzeptiert, deren Mitigation auf einen funktionierenden Recovery-Pfad angewiesen ist. Ohne diesen Pfad ist die Akzeptanz **nicht durchführbar**. Im Krisenfall (Owner überlastet, nicht greifbar, panisch) entscheidet der schon-da-stehende Plan. Im Best-Case nie gebraucht; im Worst-Case der Unterschied zwischen 1 h Recovery und 4 h Klassen-Run-Verlust mit Datenschutz-Folgen. Aufwand: 1 Personentag für Doku + 1 Tag für `RecoveryStub.sol` + Test = 16 h. Im Vergleich: Compromise-Vorfall ohne Plan = ein verlorenes Wochenende plus möglicherweise eine ganze Klausurperiode.

---

### 🟠 F2.3 — Kein `maxFeePerGas`-Hard-Cap; Base-Spike kann Wallet in 5-10 Tx leeren

**File:Line:** `packages/backend/src/services/blockchain.ts:218-227, 233-244, 255-273, 279-288, 390-424`

**Problem:**

Alle Write-Pfade rufen `contract.<method>(...)` ohne Override-Parameter:

```ts
// blockchain.ts:218-227
export async function awardPoints(
  student: string,
  surveyId: number,
): Promise<ethers.TransactionReceipt> {
  await assertSufficientBalance()
  const tx = await contract.awardPoints(student, surveyId)
  // ↑ KEIN { maxFeePerGas, maxPriorityFeePerGas, gasLimit }
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}
```

ethers v6 Default: liest `provider.getFeeData()` → `eth_feeHistory` über letzte ~5 Blöcke → setzt `maxFeePerGas = 2 * baseFee + maxPriorityFeePerGas`, `maxPriorityFeePerGas = 1.5 gwei` (oder Provider-RPC-Vorschlag).

Auf Base typisch: baseFee ≈ 0,01-0,1 gwei → ~0,1 gwei effective gas price → 80k gas für `awardPoints` ≈ 8 000 000 wei = 0,000008 ETH ≈ 0,002 USD.

**Spike-Szenarien (in 2 Jahren mehrfach):**

- **NFT-Mint-Welle auf Base** (passiert 2024-2025 mehrfach, z.B. Friend.tech, Higher, BasePaint). baseFee springt auf 5-10 gwei für 30-60 min. `getFeeData` würde dann `maxFeePerGas ≈ 20 gwei` melden. ethers ackzeptiert das ohne Cap.
- **Sequencer-Backlog** (passiert 1-2× pro Jahr): Tx queue bei Base, baseFee springt auf 50+ gwei für 5-10 Blöcke.
- **MEV-Storm während Coinbase-Listings** (passiert nach jeder größeren Listing-Ankündigung).

**Quantifizierung:** awardPoints im Spike (50 gwei): 80k × 50e9 = 4 000 000 000 000 000 wei = 0,004 ETH/Tx. Bei einer realistischen Wallet-Balance von 0,005-0,01 ETH (siehe `v2-migration-runbook.md:88-91`): **1-2 Tx und die Wallet ist tot**. Die nächsten 28 Studis im Klassen-Run sehen `INSUFFICIENT_FUNDS`.

**Fix:**

```ts
// services/blockchain.ts (neu, am Modul-Top)
const MAX_FEE_PER_GAS_WEI = ethers.parseUnits(
  process.env.MAX_FEE_PER_GAS_GWEI ?? '2', // 2 gwei = 200x typischer Base-Wert
  'gwei',
)
const MAX_PRIORITY_FEE_PER_GAS_WEI = ethers.parseUnits(
  process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI ?? '0.1',
  'gwei',
)

const TX_OVERRIDES = {
  maxFeePerGas: MAX_FEE_PER_GAS_WEI,
  maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS_WEI,
}

// In jedem Write-Pfad:
const tx = await contract.awardPoints(student, surveyId, TX_OVERRIDES)
```

Verhalten bei Spike: Tx wird vom Mempool nicht aufgenommen, hängt bis baseFee unter `maxFeePerGas` fällt. Studi sieht eine Verzögerung statt einen Komplettausfall + Balance-Verlust.

**Plus:** Im Frontend (`claim.tsx`) sollte ein länger pending Tx eine User-freundliche Meldung triggern: "Netzwerk gerade ausgelastet, dein Claim wird in den nächsten Minuten verarbeitet — Seite offen lassen oder später erneut prüfen."

**Optional härter:** Bei Spike-Detection (provider.getFeeData() liefert `baseFeePerGas > MAX_FEE/2`): pre-emptive 503 statt Tx hängen lassen. Frontend kann dann einen freundlicheren Retry-Hint geben.

**2-Jahre-Begründung:** Wallet-Drain während eines Klassen-Runs ist die kombiniert-schädlichste Failure-Mode (technisch + reputationell). 1 Personentag Implementation + Test, deckt 100 % der Spike-Szenarien ab. Trade-off: bei genuinem hochfrequentem Bedarf könnten Tx unnötig verzögert werden — bei Klausur-Klassen mit 30 Studis in 30 Minuten ist das Problem aber 0.

---

### 🟠 F2.4 — `MIN_BALANCE_WEI` ist nutzlos dimensioniert, kein Alerting

**File:Line:** `packages/backend/src/services/blockchain.ts:192-211`

**Problem:**

```ts
// blockchain.ts:192
const MIN_BALANCE_WEI = 50_000n * 1_000_000n // ~50k gas units at 1 Mwei/gas
//                       ↑ 50_000 × 10^6 = 5 × 10^10 wei = 0,00000005 ETH
```

Der Kommentar sagt selbst: "50k gas units at 1 Mwei/gas". Das ist die Kosten **eines einzigen Gas-Units** zu einem Mainnet-Gas-Preis (1 Mwei = 0,001 gwei = 1e-9 ETH/gas). Eine ganze `awardPoints`-Tx kostet aber 80k gas × ~10 gwei (worst-case Base-Spike-erwartung) = 8×10^14 wei = **16 000× über `MIN_BALANCE_WEI`**.

`assertSufficientBalance` (`blockchain.ts:199-211`) wirft also nur dann, wenn die Wallet **weniger** Geld hat als für ein-einziges-Gas-Unit. Faktisch heißt das: solange die Wallet noch 5×10^10 wei hat (also genug für 0 Tx, aber nicht null), gibt der Check grünes Licht.

**Konsequenz:** Studi schickt Claim-Request mit Balance = 0,000001 ETH (50× über MIN_BALANCE_WEI, aber unter der echten Tx-Kosten von ~0,000008 ETH). `assertSufficientBalance` passt; `contract.awardPoints` wird gerufen; ethers' Tx-Send wirft `INSUFFICIENT_FUNDS`; `errorHandler.parseProviderError` mappt korrekt zu 503. Der Studi sieht eine technisch korrekte Fehlermeldung, aber:

- Hätte mit korrekt dimensioniertem `MIN_BALANCE_WEI` (z.B. 0,0001 ETH = ~50 Tx Reserve) bereits **vor** dem Tx-Send eine andere, klarere Antwort bekommen.
- Hätte das Backend früher ge-loggt + ge-alertet, dass Refill notwendig ist.

**Plus: Kein automatisches Alerting.**

`getMinterBalance()` (`blockchain.ts:436-438`) wird in `/api/v1/health/diag` exposed. `deployment.md:251` empfiehlt:

> "Monitor the backend wallet balance on BaseScan. When balance drops below $1, top up to continue processing claims."

Manuelles Monitoring. In der Praxis: niemand polled BaseScan stündlich. Owner merkt Balance-low erst, wenn der erste Studi eine Fehler-Meldung im Klassen-Run bekommt — und dann sind 30 Sekunden später 29 weitere Fehler-Meldungen unterwegs.

**Fix:**

```ts
// services/blockchain.ts
// Realistische Schwelle: Reserve für ~50 Tx bei worst-case-Spike-Gas:
//   80_000 gas × 10 gwei = 8e14 wei pro Tx
//   50 Tx × 8e14 = 4e16 wei = 0,04 ETH
// Operator-konfigurierbar:
const MIN_BALANCE_WEI = ethers.parseEther(
  process.env.MIN_BALANCE_ETH ?? '0.005', // ~30 Tx bei normalem Base-Gas
)

// Plus: Warn-Schwelle (5x MIN_BALANCE) für proactive Alerts
const WARN_BALANCE_WEI = MIN_BALANCE_WEI * 5n
```

Plus Alerting via einfachstem Weg den HSBI-Plesk hergibt:

```ts
// services/balance-monitor.ts (neu)
import { logger } from '../lib/logger.js'
import * as blockchain from './blockchain.js'

let lastWarningSentAt = 0
const WARN_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 1× pro Tag

export async function checkBalanceAndWarn(): Promise<void> {
  try {
    const balance = await blockchain.getMinterBalance()
    if (balance < WARN_BALANCE_WEI) {
      const now = Date.now()
      if (now - lastWarningSentAt > WARN_COOLDOWN_MS) {
        logger.error(
          {
            balanceEth: ethers.formatEther(balance),
            warnThresholdEth: ethers.formatEther(WARN_BALANCE_WEI),
            minThresholdEth: ethers.formatEther(MIN_BALANCE_WEI),
            minterAddress: blockchain.getMinterAddress(),
            severity: 'OPERATIONAL',
            action: 'TOP_UP_REQUIRED',
          },
          'MINTER_BALANCE_LOW: backend wallet needs ETH refill',
        )
        lastWarningSentAt = now
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Balance check failed')
  }
}

// In server.ts beim Boot + Cron:
import { checkBalanceAndWarn } from './services/balance-monitor.js'
await checkBalanceAndWarn() // beim Boot
setInterval(checkBalanceAndWarn, 60 * 60 * 1000) // jede Stunde
```

Das Logging als Severity-marker `OPERATIONAL` macht es greppbar in Plesk-Logs (`grep 'MINTER_BALANCE_LOW' /var/log/passenger/<app>/*.log`). Ein einfacher Cron auf der Plesk-Kiste kann das wiederum in eine E-Mail an den Owner umleiten:

```bash
# /etc/cron.hourly/vpp-balance-warn
LOG=/var/log/passenger/<app>/access.log
if grep -q 'MINTER_BALANCE_LOW' "$LOG" --max-count=1; then
  mail -s 'VPP Backend: Minter wallet balance low' owner@hsbi.de < /dev/null
  # Move log marker so we don't email again until next occurrence
fi
```

(Real-world simplicity: Plesk hat `mail`-Integration via Postfix. Kein externer Alerting-Service nötig.)

**Stretch-Goal:** BaseScan-Watchlist-Alert (kostenlos, https://basescan.org/myaddress → "Add to watchlist" + "Notify on balance change"). Owner bekommt E-Mail bei jeder ETH-Bewegung. Plus: erkennt unerlaubte Outflows (wenn jemand Tx vom Minter signiert die nicht vom Backend kommen — F2.2-Indikator).

**2-Jahre-Begründung:** Der jetzige `MIN_BALANCE_WEI` ist Code-Theater (sieht nach Sicherheits-Check aus, ist aber funktional ein No-op). Ein einziger leerer Klassen-Run wegen low-balance = mehrere Stunden Stress + Reputations-Schaden. Der Fix ist 30-60 min Implementation + 5 min Plesk-Cron-Setup. Plus: Balance-Watchlist auf BaseScan ist die einfachste Insider-Threat-Detection für F2.2-Indicators.

---

### 🟠 F2.5 — Logger ohne Redact; Boot-Crash-mit-ungültigem-Key leaked Klartext-Key

**File:Line:** `packages/backend/src/lib/logger.ts:3-8`, `packages/backend/src/middleware/errorHandler.ts:234`

**Problem:**

```ts
// lib/logger.ts:3-8
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})
// → KEIN redact-Konfig
```

```ts
// errorHandler.ts:234
logger.error({ err }, 'Unhandled error')
// → loggt rohes err-Objekt mit allen Eigenschaften
```

Plus: `requestLogger.ts` (siehe Bereich 6 F6.4) loggt Request-Headers ohne Filter — d.h. der `x-admin-signature`/`x-admin-message`-Cluster ist ungeschützt. Hier: same problem für Boot- und Tx-Failure-Pfade.

**Konkretes Leak-Szenario (Cluster mit F2.7 Boot-Validierung):**

Owner setzt versehentlich `MINTER_PRIVATE_KEY="<minter-pk-64-hex> \n"` (Whitespace am Ende, vergessenes `0x`-Prefix). Backend bootet:

```text
T+0:   config.ts:13-19 required("MINTER_PRIVATE_KEY") → returns the string with whitespace
T+1:   blockchain.ts:184: new ethers.Wallet(config.minterPrivateKey, provider)
T+2:   ethers wirft INVALID_ARGUMENT: "private key must start with 0x"
       Plus: ethers' Error inkludiert den argument-Value als
       error.argument = 'privateKey', error.value = '<the-key>' im error-info
T+3:   Uncaught — server.ts hat keinen try/catch um den Boot
T+4:   Process crasht; Passenger restartet
T+5:   logger.error({ err }, 'Boot failed') (oder ähnlich) — error.value
       enthält den Key. Pino schreibt:

       {"level":50,"time":...,"err":{"type":"Error","message":"invalid
       private key: must start with 0x","argument":"privateKey",
       "value":"<minter-pk-64-hex> \n","stack":"..."},"msg":"Boot failed"}

T+6:   Plesk-Worker-Restart-Loop. Jeder Restart schreibt denselben Log-
       Eintrag erneut. Nach 10 Minuten: 100+ Klartext-Key-Einträge im Log.
T+...: Wer Plesk-Tenant-Read auf den Logs hat (siehe Bereich 4 F4.5,
       Bereich 6 F6.4): direkter Take-Over via probe-Replay-Sequenz.
```

**Plus: Minter-Address im Log.**

`blockchain.getMinterAddress()` (`blockchain.ts:432-434`) wird in `routes/admin.ts:47` aufgerufen für `buildEntries`, wird in `health/diag` exposed, taucht in jedem `addAdmin`/`removeAdmin`-Antwort-Body auf. Address an sich ist nicht sensitiv (sowieso on-chain sichtbar), aber wenn die Address im Log-Aggregator zusammen mit Tx-Hashes und Timestamps korreliert wird → erleichtert OSINT für Angreifer (wann macht der Minter wieviele Tx, wann ist der Klassen-Run).

**Fix:**

```ts
// lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      // Konfigwerte (falls je via { config } geloggt wird)
      'config.minterPrivateKey',
      // Generic key-pattern für 64-hex-string Errors aus ethers
      'err.value',
      'err.argument',
      'err.privateKey',
      // Tx-Pfade — Minter-Adresse low-risk, aber konsistent ausblenden
      // (NICHT Tx-Hash redacten — ist on-chain sowieso öffentlich und
      // wird für Forensik gebraucht)
      // Header-Sigs (parallel mit Bereich 6 F6.4)
      'req.headers["x-admin-signature"]',
      'req.headers["x-admin-message"]',
      'req.headers.authorization',
      'req.body.adminSignature',
      'req.body.adminMessage',
      'req.body.signature',
      'req.body.message',
      'req.body.privateKey',
    ],
    censor: '[REDACTED]',
    remove: false, // explizit drin lassen mit '[REDACTED]'
  },
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})
```

Plus: `server.ts` Boot wrappen:

```ts
// server.ts (am Top des async main)
async function bootSafely() {
  try {
    // ... existing boot code
  } catch (err) {
    // Custom-Fehler ohne sensitive Args:
    if (err instanceof Error && /private key/i.test(err.message)) {
      logger.fatal('MINTER_PRIVATE_KEY is invalid (format/length error). Check Plesk env config.')
      // KEIN err-Objekt loggen, weil ethers' err.value den Klartext-Key enthält
      process.exit(1)
    }
    logger.fatal({ err }, 'Boot failed')
    process.exit(1)
  }
}
```

**Test:** `npm test` für `services/blockchain.boot.test.ts` der explizit `MINTER_PRIVATE_KEY=invalid_value` setzt und prüft, dass der Key NICHT im stderr-Output landet.

**2-Jahre-Begründung:** F2.7 (Boot-Format-Validierung) macht ein Key-Format-Crash eine reale Möglichkeit (Plesk-Panel-Whitespace-Bug ist Klassiker). Ohne Redact = Klartext-Key in Logs, die per Plesk-Tenant-Read greifbar sind (Bereich 4 F4.5). Plus: Logs werden archiviert, gebackuped, per Cron rotiert. Jeder dieser Pfade vervielfältigt das Leak-Risiko. Der Redact-Fix ist 15 Minuten Code, deckt diese und alle ähnlichen zukünftigen Logger-Pfade ab.

---

### 🟠 F2.6 — `docs/security.md` an mindestens 5 Stellen falsch

**File:Line:** `docs/security.md` (mehrere Stellen)

**Problem:**

`docs/security.md` ist die Doku, an die externe Reviewer (HSBI-Datenschutz, Hochschul-IT, externe Audits, künftige Maintainer) verwiesen werden. Sie ist im V2-Update vom April 2026 nicht mit dem Code synchronisiert worden:

| #   | Zeile | Aussage in security.md                                                                                      | Realität                                                                                                                                                                                                         |
| --- | ----- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 60-62 | "Server wallet holds `MINTER_ROLE` on the contract."                                                        | Hält MINTER_ROLE **und** ADMIN_ROLE (deploy-v2.ts:497-500). Owner-akzeptiert, aber undokumentiert.                                                                                                               |
| 2   | 66    | "Compromise impact: an attacker can call `awardPoints` freely … and it cannot modify survey configuration." | Mit ADMIN_ROLE: addAdmin, removeAdmin, deactivateSurvey, revokePoints, markWalletSubmitted. **Volle** Kontrolle über Survey-Lifecycle.                                                                           |
| 3   | 66    | "Mitigation: admin can instantly revoke `MINTER_ROLE` and re-grant it to a new backend wallet"              | Reicht nicht — siehe F2.2 für korrekte 6-Schritt-Sequenz.                                                                                                                                                        |
| 4   | 83-87 | "Upgrader Key (UUPS): UPGRADER_ROLE is the single role that can authorise a new implementation"             | UPGRADER_ROLE existiert NICHT im Contract. `_authorizeUpgrade` (SurveyPointsV2.sol:255-258 laut Audit-Plan) ist von `DEFAULT_ADMIN_ROLE` gegated.                                                                |
| 5   | 42-43 | "Layer 6: Rate Limiting → Claim endpoint: 5 req / minute / IP, General API: 100 req / minute / IP"          | Code-Defaults: Claim 100 req/min, API 600 req/min (config.ts:46-54). Doku ist 20-6× zu niedrig. (Cluster mit Bereich 6 F6.6.)                                                                                    |
| 6   | 71    | "File is gitignored and backed up through the Plesk filesystem snapshots."                                  | Plesk-Snapshot-Behauptung ohne Beleg. Bereich 4 F4.8 hat unbestätigt: keine dokumentierte Snapshot-Konfiguration im Repo. Wer übernimmt die Verantwortung? Wer testet Restore?                                   |
| 7   | 79    | "Admin actions require EIP-191 signature verification of a freshly signed message (≤ 5 minutes old)."       | Korrekt, aber unterstreicht das Replay-Fenster ohne den Server-Side-Nonce-Mangel zu erwähnen (siehe Bereich 6 F6.1). Macht das Sicherheits-Modell schlechter klingen-als-es-ist verglichen mit dem Soll-Zustand. |
| 8   | 100   | "Backend key compromise: Damage limited to point distribution; revoke MINTER_ROLE; no historical damage"    | Wiederholung von #2 in der Threat-Model-Tabelle. Gleicher Fehler.                                                                                                                                                |

**Warum das kein Nit, sondern Major ist:** Die Doku ist die Schnittstelle zwischen Code-Realität und Stakeholdern, die Owner-Decisions bewerten/abnicken. Owner hat zwei Trade-offs **aktiv akzeptiert** (Minter=Admin, Plesk-Klartext-ENV) — das setzt voraus, dass die Doku diese Trade-offs **transparent** macht, sonst können HSBI-Datenschutz oder ein:e zukünftige:r externe:r Audit:in nicht informiert zustimmen. Aktuell wird der Compromise-Impact als "limited" beschrieben — das ist Lüge.

Plus: bei einem Datenschutz-Vorfall (Tx vom Minter manipuliert markWalletSubmitted) fragt die Datenschutzbeauftragte:

> "Was hat dazu geführt? Habt ihr das vor Inbetriebnahme bewertet?"

Antwort dann: "Das stand nicht in unserer Sicherheits-Doku, dass das möglich ist." → Vorgang.

**Fix:**

Komplett neu schreiben (Section "Backend Minter Key (Server)" + Threat-Model-Tabelle). Vorschlag:

```markdown
### Backend Minter Key (Server)

The backend Minter wallet holds **both** `MINTER_ROLE` and `ADMIN_ROLE`
on the smart contract. This is a deliberate architectural trade-off
(see ADR 0003 "Stateless Backend Relayer" + the deploy-v2.ts header
comments) that enables the relayer pattern: admins authenticate
off-chain via EIP-191 signatures and the backend submits the actual
on-chain TXs from the single funded wallet.

**Storage.** The private key is stored in the Plesk Node.js panel
"Custom Environment Variables" section as `MINTER_PRIVATE_KEY`. This
storage is not encrypted-at-rest in the Plesk-Tenant model — Plesk
keeps the env config readable to the application user and to anyone
with Plesk-admin access. This is an **accepted operational trade-off**
given the HSBI hosting context (see "Documented Owner Decisions"
section below for full rationale).

**Wallet funding.** The Minter wallet pays gas for all transactions.
Must be funded with ETH on Base (~$10 reserve recommended; see
balance-monitoring section).

**Compromise impact.** A leaked Minter private key gives an attacker
the **full ADMIN_ROLE surface**, including:

- `awardPoints(student, surveyId)` — mint arbitrary points
- `revokePoints(student, surveyId)` — delete points from any wallet
- `addAdmin(address)` — grant ADMIN_ROLE to any address (permanent)
- `removeAdmin(address)` — revoke ADMIN_ROLE from any other admin
  (last-admin protection only prevents removing the literal last
  admin; if the attacker has added themselves as admin first, all
  legitimate admins can be removed)
- `deactivateSurvey(id)` — disable any active survey
- `markWalletSubmitted(address)` — manipulate HSBI thesis-admission
  flag for any wallet
- `unmarkWalletSubmitted(address)` — reverse legitimate submission marks

The compromise does NOT enable:

- Contract upgrades (gated by `DEFAULT_ADMIN_ROLE` on a separate
  wallet not held by the backend)
- HMAC-key access (HMAC keys live off-chain in `survey-keys.json`
  with no on-chain reference)
- Retroactive minting for already-claimed (wallet, surveyId) tuples
  (on-chain `_claimed` mapping blocks redundant claims)

**Recovery procedure.** See `docs/runbooks/minter-compromise-recovery.md`
for the full step-by-step. Summary: a holder of an ADMIN_ROLE wallet
that is NOT the compromised Minter (typically the
DEFAULT_ADMIN_ROLE-holding "Hochschule" wallet) executes a 6-step
sequence directly via BaseScan or `cast` (NOT via the backend, since
the backend is the compromised path):

1. addAdmin(NEW_MINTER)
2. grantRole(MINTER_ROLE, NEW_MINTER)
3. removeAdmin(OLD_MINTER)
4. revokeRole(MINTER_ROLE, OLD_MINTER)
5. (parallel) sweep ETH from OLD_MINTER to safe wallet
6. update Plesk env, touch tmp/restart.txt
```

Plus Threat-Model-Tabellen-Eintrag korrigieren:

```markdown
| Backend key compromise | Full ADMIN_ROLE take-over until DEFAULT_ADMIN_ROLE
holder executes recovery (≤ 1 h with runbook). Documented as accepted
trade-off (see ADR 0003 + Documented Owner Decisions section). |
```

Plus: UPGRADER_ROLE-Abschnitt entweder entfernen ODER als historisches V1-Konzept markieren ODER zu einer korrekten Beschreibung von DEFAULT_ADMIN_ROLE umschreiben.

Plus: Rate-Limit-Defaults korrigieren auf 100 / 600 (oder besser: nach Bereich 6 F6.6-Fix auf 30 / 200).

**2-Jahre-Begründung:** Doku-Lügen über Sicherheits-Trade-offs sind die häufigste Ursache für Audit-Failures und Datenschutz-Vorgänge im Hochschul-Kontext. Zwei Stunden Doku-Refactor jetzt vermeidet vier Stunden Schmerz später. Cluster mit F2.2 (Recovery-Runbook): beide gemeinsam machen die Owner-Decisions formal verteidigbar.

---

### 🟡 F2.7 — `MINTER_PRIVATE_KEY` ohne Format-Validierung; Tippfehler crasht Boot mit Klartext-Key im Stack

**File:Line:** `packages/backend/src/config.ts:13-19, 39`

**Problem:**

```ts
// config.ts:13-19
function required(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

// config.ts:39
minterPrivateKey: required('MINTER_PRIVATE_KEY'),
```

Validiert: existiert + nicht-leer. Validiert NICHT: 0x-Prefix, Hex-Charset, Länge (32 Bytes = 64 hex chars).

**Realistische Tippfehler-Szenarien:**

| Eingabe (Plesk-Panel)                     | `required()`-Result | Ethers-Wallet-Constructor |
| ----------------------------------------- | ------------------- | ------------------------- |
| `0xd1bec053…5336`                         | passt               | ✓                         |
| `d1bec053…5336` (kein `0x`)               | passt               | ✗ wirft INVALID_ARGUMENT  |
| `0xd1bec053…5336\n` (Newline)             | passt               | ✗ wirft INVALID_ARGUMENT  |
| `0xd1bec053…5336 ` (Trailing space)       | passt               | ✗ wirft INVALID_ARGUMENT  |
| `0xD1BEC053…5336` (uppercase)             | passt               | ✓ (ethers normalisiert)   |
| `0xd1bec…533` (1 char zu wenig)           | passt               | ✗ wirft INVALID_ARGUMENT  |
| `0x` + zufällige 64 Chars Mit `g`/`h`/`z` | passt               | ✗ wirft INVALID_ARGUMENT  |

ethers' `INVALID_ARGUMENT`-Error inkludiert in v6 standardmäßig den fehlerhaften `value` im Error-Info. Stack landet im Plesk-Worker-Log → siehe F2.5 für Leak-Pfad.

**Plus:** `config.ts` wird beim Modul-Import ausgeführt (Top-Level). Wenn `MINTER_PRIVATE_KEY` ungültig ist, crasht der Boot **vor** der ersten Request. Plesk-Passenger interpretiert das als Boot-Failure und restartet endlos in einer Loop. Jeder Restart-Versuch = ein weiterer Klartext-Key-Eintrag im Log.

**Fix:**

```ts
// config.ts (oder neu: lib/keyValidation.ts)
function validatePrivateKey(value: string, key: string): string {
  const trimmed = value.trim()

  // Normalize 0x prefix
  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`

  // Check length (0x + 64 hex chars = 66)
  if (withPrefix.length !== 66) {
    throw new Error(
      `Invalid format for ${key}: expected 32-byte hex (64 chars + 0x prefix), got ${withPrefix.length - 2} chars`,
      // KEIN value im error message — error.message landet eventuell im Log
    )
  }

  // Check hex charset (0x + a-fA-F0-9)
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error(
      `Invalid format for ${key}: contains non-hex characters`,
    )
  }

  return withPrefix
}

// Statt: minterPrivateKey: required('MINTER_PRIVATE_KEY'),
minterPrivateKey: validatePrivateKey(required('MINTER_PRIVATE_KEY'), 'MINTER_PRIVATE_KEY'),
```

Plus Test:

```ts
// test/config.test.ts
describe('validatePrivateKey', () => {
  it('accepts valid 0x-prefixed key', () => {
    /* ... */
  })
  it('accepts unprefixed valid key (auto-prefixes)', () => {
    /* ... */
  })
  it('rejects whitespace, newlines, partial keys', () => {
    expect(() => validatePrivateKey('0xd1bec ', 'MINTER_PRIVATE_KEY')).toThrow(/Invalid format/)
    // Stelle sicher, dass die Error-Message NICHT den Key-Wert enthält:
    try {
      validatePrivateKey('0x<64-hex-key>extra', 'MINTER_PRIVATE_KEY')
    } catch (e) {
      expect(e.message).not.toContain('d1bec053')
    }
  })
})
```

**2-Jahre-Begründung:** Plesk-Panel-Whitespace-Bug ist Klassiker (Copy-Paste aus 1Password, Browser-Auto-Trim macht's manchmal nicht). Über 2 Jahre × mehrere Owner-Wechsel × mehrere Plesk-Migrations-Schritte: 1-2 Tippfehler-Vorfälle erwartbar. Mit aktuellem Code: jeder Vorfall = Klartext-Key im Log + Restart-Loop. Mit Validierung: sauberer Fail-fast mit klarem Error-Message ohne Key-Inhalt. 30 min Code + Test.

---

### 🟡 F2.8 — `NonceManager` in-memory + kein Mapping für `nonce too low`/`replacement transaction underpriced`

**File:Line:** `packages/backend/src/services/blockchain.ts:185`, `packages/backend/src/middleware/errorHandler.ts:35-122` (REVERT_MAP)

**Problem:**

```ts
// blockchain.ts:185
const managedSigner = new ethers.NonceManager(wallet)
```

`ethers.NonceManager` cached die Nonce in-memory. Bei jedem Process-Start liest er einmal `getTransactionCount("latest")` und inkrementiert lokal weiter.

**Failure-Modes:**

1. **Worker-Restart mit pending Tx.** Backend submitted `awardPoints`-Tx mit Nonce N. Tx ist im Mempool, noch nicht mined. Plesk-Passenger killed den Worker (Idle-Timeout, Memory-Limit, manueller Restart). Neuer Worker started, NonceManager liest `getTransactionCount("latest")` = N (die pending Tx zählt nicht). Nächste Tx vom neuen Worker nutzt Nonce N → `replacement transaction underpriced` (der Mempool sieht zwei Tx mit derselben Nonce).
2. **FallbackProvider-Switch zwischen Calls.** `getTransactionCount("latest")` über sub-provider A returns N, dann sub-provider B returns N-1 (5-10 Block-Lag). NonceManager nutzt N-1. Tx wird abgelehnt mit `nonce too low`.
3. **Race zwischen zwei concurrent Backend-Workers** (Plesk-Passenger spawned mehrere). Worker 1 liest Nonce N, Worker 2 liest Nonce N (gleichzeitig, before-Worker-1's-Tx-Submitted). Beide submitten mit N → einer wird mined, der andere bekommt `nonce too low`.

**Plus: kein Mapping in `errorHandler.parseProviderError`:**

```ts
// errorHandler.ts:159-187 (parseProviderError)
// Mapped: INSUFFICIENT_FUNDS
// NICHT mapped: NONCE_EXPIRED, REPLACEMENT_UNDERPRICED, NONCE_TOO_LOW
```

Folge: `nonce too low` → durchfällt zu `errorHandler:234 logger.error({ err }, 'Unhandled error')` → 500 INTERNAL_ERROR mit generischer Meldung. Studi sieht "An unexpected error occurred" und versucht erneut. Beim Retry: erneut `nonce too low` (weil NonceManager den Counter nicht selbstkorrigiert) → endlos-fail bis zum nächsten Worker-Restart.

**Wahrscheinlichkeit in der Praxis:**

- Plesk Passenger spawned bei Default-Config 1 Worker-Prozess pro Domain (`passenger_min_instances 1`, `passenger_max_instances 6`). Single-Worker-Phase = kein Race; bei Spike auf 2+ Worker = möglicher Race.
- Worker-Restarts: Plesk-Default `passenger_pool_idle_time 300` → bei genug Aktivität nie idle, bei Klassen-Run-Pause ja. Restart-Race-Window: kleine Sekunden.
- FallbackProvider-Switch: bei normalem Betrieb selten (provider A antwortet schnell genug); bei Provider-Outage häufiger.

Erwartete Häufigkeit: 1-2 Vorfälle/Jahr im Klassen-Run. Pro Vorfall: 1-3 Studis betroffen, alle 1 Stunde später per Manual-Retry erfolgreich. Operativ: Schmerz, aber keine Sicherheits-Implikation.

**Fix:**

**Variante A — Minimal (Error-Mapping):**

```ts
// errorHandler.ts (parseProviderError erweitern)
const code = (err as Record<string, unknown>).code as string | undefined

if (code === 'NONCE_EXPIRED' || code === 'REPLACEMENT_UNDERPRICED') {
  return new AppError(
    503,
    'TX_NONCE_CONFLICT',
    'Transaction temporarily failed due to nonce conflict (concurrent admin operations or backend restart). ' +
      'Please try again in 30 seconds. If the problem persists, contact the operator.',
  )
}

const message = (err as Record<string, unknown>).message
if (
  typeof message === 'string' &&
  /(nonce too low|replacement transaction underpriced|nonce has already been used)/i.test(message)
) {
  return new AppError(503, 'TX_NONCE_CONFLICT', '...')
}
```

Plus: bei NONCE_EXPIRED-Detection im NonceManager re-syncen (ethers v6 API: `await managedSigner.reset()`).

**Variante B — Persistente Nonce (overkill für aktuelle Last):**

Disk-File `data/last-nonce.json` mit atomic-Write nach jeder erfolgreich submitteten Tx. Beim Boot: `Math.max(getTransactionCount("latest"), file.lastNonce + 1)`. Schützt gegen Worker-Restart-Race. Aufwand: ~50 LoC + Test. Lohnt sich erst, wenn reale Häufigkeit problematisch wird.

**Empfehlung: Variante A jetzt, Variante B als Reserve.**

**2-Jahre-Begründung:** 1-2 Vorfälle/Jahr × 1-3 Studi-Frust × Operator-Eingriff (Retry-Hint geben) = überschaubarer Schmerz. Variante-A-Fix (~30 min) verbessert Studi-UX ohne Architektur-Änderung. Variante B (~3 h) ist Reserve, wenn nach 6 Monaten Live-Metriken zeigen, dass die Vorfälle häufiger sind.

---

### 🟡 F2.9 — ETH-Refill-Prozess undokumentiert; manuelles BaseScan-Watching ist nicht real

**File:Line:** `docs/deployment.md:251`

**Problem:**

```text
// deployment.md:249-251
### Backend Wallet Balance
Monitor the backend wallet balance on [BaseScan](https://basescan.org).
When balance drops below $1, top up to continue processing claims.
```

Das ist die gesamte Dokumentation. Keine:

- Verantwortlichen-Definition (wer polled? wie oft?)
- Alarm-Schwelle (oben gesagt: $1 — bei aktueller Wallet-Größe von typischerweise 5-10 USD ist das 10-20 % Reserve, was im Klassen-Run zu spät ist)
- Refill-Prozess (von wo kommt das Geld? Coinbase-Konto? Wessen? Wer hat Zugang?)
- Refill-Latenz (Coinbase-Bridge zu Base = 10 min, Coinbase-Verifikation neuer User = 1-3 Tage)
- Behandlung im Notfall (Klassen-Run läuft, Wallet leer, Refill dauert 10 min)
- Kommunikation an Studis während Wartezeit

**Realistisches Failure-Szenario:**

T+0: Klassen-Run startet 14:00 mit Wallet-Balance 0,002 ETH (~6 USD).
T+5: 30 Studis claimen parallel. ~30 × 0,000008 ETH = 0,00024 ETH. Balance jetzt 0,00176 ETH.
T+10: Spike-Welle (NFT-Drop, siehe F2.3): Gas verzehnfacht. 5 weitere Tx kosten je 0,00008 ETH. Balance jetzt 0,00136 ETH.
T+15: Studi 31 claimt. INSUFFICIENT_FUNDS (weil F2.4: MIN_BALANCE_WEI ist Theater, ethers' Tx-Send wirft selbst).
T+15: Owner ist nicht im Termin (anderes Meeting). Niemand polled BaseScan.
T+20: Studi 32, 33, 34 claimen. Alle 503.
T+25: Studi 31 hat dem Lehrenden Bescheid gegeben. Lehrende:r weiß nicht, wo nachschauen.
T+30: Owner kommt aus Meeting, sieht Slack-Nachrichten. Loggt sich in Coinbase ein. Hat 0 EUR Guthaben.
T+30: Owner schickt SEPA-Überweisung zu Coinbase (1-3 Werktage).
T+30+1Tag: Refill ausgeführt. Klasse längst beendet, betroffene Studis müssen am nächsten Termin nachclaimen oder kriegen ihre Punkte manuell vom Owner per `awardPoints`-Direct-Tx.

**Fix:**

`docs/runbooks/eth-refill-procedure.md` (neu):

```markdown
# ETH Refill Procedure for Backend Minter Wallet

## Pre-Conditions (vor jedem Klassen-Run)

- [ ] Wallet-Balance >= 0.005 ETH (Reserve für 30 Tx bei worst-case-Spike)
  - Check: https://basescan.org/address/<MINTER_ADDRESS>
- [ ] Coinbase-Konto hat mindestens 20 EUR Guthaben (für Notfall-Refill)
- [ ] Owner hat Coinbase-Zugang auf Mobil-Gerät (für unterwegs-Refill)

## Continuous Monitoring

- BaseScan-Watchlist-Alert konfiguriert (kostenlos, https://basescan.org/myaddress)
  → E-Mail bei jeder Balance-Bewegung > 0,001 ETH
- Backend-Logs greppen nach 'MINTER_BALANCE_LOW' (siehe F2.4-Fix-Cron)

## Standard Refill (Reserve auffüllen, kein Notfall)

Latenz: ~5 Minuten bei vorhandenem Coinbase-Guthaben.

1. Coinbase-App öffnen
2. "Senden" → Empfänger: <MINTER_ADDRESS> (auswendig oder als Kontakt gespeichert)
3. Netzwerk: **Base** (NICHT Ethereum!)
4. Betrag: 0,01 ETH (~30 USD = ~100 Tx Reserve)
5. Bestätigen
6. BaseScan-Watch zeigt eingehende Tx in <60 s
7. Backend nutzt automatisch (kein Restart nötig)

## Emergency Refill (Klassen-Run läuft, Balance leer)

Latenz: 10 min bei vorhandenem Coinbase-Guthaben; 1-3 Tage bei leerem Konto.

1. Wenn Coinbase-Guthaben fehlt: Sofort Sofortüberweisung/Kreditkarte
   (Aufschlag ~3 %, aber sofort verfügbar)
2. ETH kaufen → Senden → Base-Netzwerk → Minter-Wallet
3. Studis informieren via SoSci-Goodbye-Page-Banner ODER per E-Mail-Verteiler
4. Während Wartezeit: betroffene Studi-Wallet-Addresses sammeln
5. Nach Refill-Bestätigung: Studis informieren "bitte erneut auf Claim-Link klicken"
6. Falls Nonce schon verbraucht (siehe Bereich 6 F6.8): Manual-Recovery via
   Admin-Endpoint /admin/nonce/restore (existiert noch nicht — siehe F6.8)

## Backup-Plan (Coinbase nicht verfügbar)

- Owner hält 0,02 ETH-Reserve in einer separaten Wallet (Hardware-Wallet z.B.
  Ledger / Trezor).
- Im Notfall: Reserve-Wallet → Minter-Wallet, dauert <1 min auf Base.
- Wichtig: Reserve-Wallet ist NICHT die DEFAULT_ADMIN_ROLE-Wallet (Aufgaben-Trennung).

## Wer macht was

- **Refill auslösen:** Owner (Joris) primär, Lehrende:r als Backup mit
  Zugang zur Reserve-Wallet (siehe oben).
- **Monitoring:** BaseScan-Alert geht an owner@hsbi.de + zweite-Email als Backup.
- **Nicht-Verfügbarkeit Owner:** Definierter Vertretung (Wer? Eintragen.)

## Cost-Awareness

Bei 1000 Claims/Jahr × 0,000008 ETH/Tx = 0,008 ETH/Jahr = ~25 USD/Jahr für Gas.
Zzgl. Reserve und Spike-Puffer: 50-100 USD/Jahr Budget pro VPP-Instanz.
```

**Plus:** Im Frontend einen "low balance"-Banner für Admins:

```tsx
// pages/admin.tsx
{
  minterBalance < BigInt('5000000000000000') && ( // 0.005 ETH
    <Alert severity="warning">
      Backend-Wallet-Balance niedrig: {ethers.formatEther(minterBalance)} ETH. Refill nötig bevor
      der nächste Klassen-Run startet. Siehe docs/runbooks/eth-refill-procedure.md.
    </Alert>
  )
}
```

**2-Jahre-Begründung:** Operativer Reflex, nicht Sicherheits-Issue. Aber: ein Klassen-Run-Aussfall durch leere Wallet hat real-world-Impact (Punkte für Klausur-Note, Studis verärgert, Lehrende:r unzuverlässig). 2 h Doku + 30 min Frontend-Banner deckt 95 % der Szenarien ab. Trade-off: keine reale Mehr-Investition außer Owner-Zeit für die Doku.

---

### ⚪ F2.10 — `.env.production.example` und `deployment.md` listen `.env`-Datei und Plesk-Panel-ENV-Var als gleichwertige Optionen

**File:Line:** `.env.production.example:1-7`, `docs/deployment.md:101-110`

**Problem:**

```text
// .env.production.example:1-7
# ╔══════════════════════════════════════════════════════════════╗
# ║  VPP Blockchain — Production Environment Variables         ║
# ║                                                            ║
# ║  Copy this file to .env on the Plesk server (httpdocs/)    ║
# ║  OR set these as "Custom Environment Variables" in the     ║
# ║  Plesk Node.js panel.                                      ║
# ╚══════════════════════════════════════════════════════════════╝
```

```text
// deployment.md:101-110 (Section "Initial Setup (one-time)")
4. Set environment variables in the Plesk Node.js panel:
   - NODE_ENV = production
   - PORT = 3000
   - RPC_URL = your Base RPC endpoint
   - CONTRACT_ADDRESS = your deployed contract
   - MINTER_PRIVATE_KEY = your backend wallet key
   - ...
```

Doku ist halb auf "Plesk-Panel" festgelegt, halb noch auf "`.env`-Datei OR Plesk-Panel".

**Owner-Decision (in dieser Audit-Iteration bestätigt):** Plesk-Panel-ENV-Var ist die akzeptierte Lösung.

**Konsequenz aus dieser Decision:** `.env`-Datei-Option **streichen**. Sonst:

- Künftige Deploys können versehentlich beide Methoden setzen → welche gewinnt?
- Operator unsicher, ob er beim ENV-Update auch die `.env`-Datei mit aktualisieren muss
- `.env`-Datei auf Disk hat zusätzliche Plesk-FTP-Zugriffs-Surface, die mit Panel-ENV nicht existiert (Panel-Config liegt in einem anderen Plesk-Verzeichnis)

**Fix:**

```diff
// .env.production.example
- # ║  Copy this file to .env on the Plesk server (httpdocs/)    ║
- # ║  OR set these as "Custom Environment Variables" in the     ║
- # ║  Plesk Node.js panel.                                      ║
+ # ║  Set these as "Custom Environment Variables" in the        ║
+ # ║  Plesk Node.js panel (Domains > <domain> > Node.js >       ║
+ # ║  "Custom environment variables" section).                  ║
+ # ║                                                            ║
+ # ║  DO NOT save this file as .env on the Plesk server — the   ║
+ # ║  Plesk-Panel-ENV-Var path is the single source of truth.   ║
+ # ║  This file is a TEMPLATE for documentation only.           ║
```

Plus: `app.js`-Boot-Wrapper (siehe `scripts/build-deploy-ci.sh:63-75`) lädt aktuell `.env` aus dem App-Root:

```js
// scripts/build-deploy-ci.sh:63-67 generates app.js with:
const { config: loadEnv } = require('dotenv')
const { resolve } = require('path')
loadEnv({ path: resolve(__dirname, '.env') })
```

Wenn Plesk-Panel-ENV die Single-Source-of-Truth ist, ist dieser dotenv-Load redundant. Plesk-Passenger setzt die Panel-ENV-Vars schon im `process.env`, **bevor** `app.js` startet. Den `loadEnv`-Call kann man entfernen — verhindert Verwirrung wenn jemand im Notfall doch eine `.env`-Datei in `httpdocs/packages/backend/` ablegt und sich wundert, warum sie ignoriert wird (oder schlimmer: warum sie alle Panel-ENV-Vars überschreibt).

Alternative-Konservativer-Fix: dotenv-Load belassen, aber **nur für lokales Dev** (NODE_ENV !== 'production'). In Prod: ausschließlich Panel-ENV.

**2-Jahre-Begründung:** Single-Source-of-Truth verhindert Ops-Verwirrung über 2 Jahre × mehrere mögliche Operator-Wechsel. 5 min Doku-Update + optional 5 min Boot-Wrapper-Refactor. Cluster mit F2.6 (security.md-Refactor) — gleichzeitig erledigen.

---

## Documented Owner Decisions

Diese Punkte sind keine Findings, sondern explizit in der Audit-Iteration mit dem Owner besprochene und als akzeptable Trade-offs bestätigte Architektur-Entscheidungen. Sie werden hier dokumentiert, damit zukünftige Reviewer:innen (HSBI-Datenschutz, externe Audits, künftige Maintainer:innen) den Kontext nachvollziehen können und Owner-Decisions nicht versehentlich "neu entdeckt" und als Findings reaktiviert werden.

### OD-2.A — Minter-Wallet hält ADMIN_ROLE (zusätzlich zu MINTER_ROLE)

**File:** `packages/contracts/scripts/deploy-v2.ts:497-500` (mit ausführlichem Header-Kommentar Z. 72-95)

**Status:** Akzeptiert.

**Begründung (Code-Header, paraphrasiert):**

- Backend ist ein Stateless-Relayer: Admins authentifizieren sich off-chain mit EIP-191-Signaturen, das Backend submittet die on-chain Tx mit der einzigen funded Wallet (Minter).
- Endpoints `/admin/add`, `/admin/remove`, `/surveys/:id/deactivate`, `/surveys/:id/revoke`, `/wallets/:addr/mark` haben on-chain `msg.sender = Minter`. SurveyPointsV2 enforced `onlyRole(ADMIN_ROLE)` auf diesen Functions. → Minter braucht ADMIN_ROLE für das Relayer-Pattern.

**Akzeptiertes Risiko:**

- Minter-Compromise = volle ADMIN_ROLE-Take-Over. Worst-Case-Schaden quantifiziert in F2.2 Recovery-Plan (siehe dort).

**Mitigation (vom Owner als ausreichend bewertet):**

- DEFAULT_ADMIN_ROLE bleibt bei einer separaten Wallet (Hochschule), die UUPS-Upgrades autorisieren kann.
- HMAC-Keys leben off-chain (`data/survey-keys.json`) und sind durch Minter-Compromise nicht erreichbar.
- LastAdmin()-Invariante verhindert kompletten Lockout.

**Pflichten daraus:**

- F2.2 (Recovery-Runbook) ist **Voraussetzung** für die Akzeptanz.
- F2.6 (security.md korrigieren) ist **Voraussetzung** dafür dass HSBI-Datenschutz informiert zustimmen kann.

### OD-2.B — `MINTER_PRIVATE_KEY` als Klartext in der Plesk-Node.js-Panel-ENV-Konfiguration

**File:** `docs/deployment.md:101-110`, `.env.production.example:1-26`

**Status:** Akzeptiert.

**Begründung (Owner):**

- HSBI-Hosting-Realität: Plesk + Node.js-Panel ist die verfügbare Infrastruktur. KMS, HashiCorp Vault, AWS Secrets Manager sind nicht greifbar.
- Plesk-Panel-Custom-ENV-Vars sind die Standard-Methode für Backend-Secrets in dieser Umgebung. Andere Hochschul-Systeme machen es genauso.
- Plesk-Tenant-Read-Risiko ist real, aber Threat-Model trägt das: ein Plesk-Admin-Compromise wäre ohnehin Game-Over für viele andere HSBI-Systeme.

**Akzeptiertes Risiko:**

- Plesk-Tenant mit Read-Access auf den App-User kann den Klartext-Key sehen.
- Plesk-Backup-Snapshots können Klartext-Key enthalten und in Backup-Lokationen drift'en.
- Plesk-Admin = Zugriff.

**Mitigation (vom Owner als ausreichend bewertet):**

- HSBI-Plesk-Operator hat eigene Sicherheits-Verantwortung; das Threat-Model "böser Plesk-Operator" ist außerhalb des Audit-Scopes für VPP-spezifischen Code.
- F2.2-Recovery-Plan deckt den Fall ab, dass es trotzdem passiert.

**Pflichten daraus:**

- F2.1 (`probe.mjs` Live-Key löschen) bleibt Blocker — die Plesk-Akzeptanz schützt nicht vor zusätzlichen Klartext-Wohnorten **außerhalb** von Plesk.
- F2.5 (Logger-Redact) bleibt Major — die Plesk-Akzeptanz heißt nicht, dass der Key zusätzlich noch in Logs/Stack-Traces auftauchen soll.
- F2.7 (Boot-Format-Validierung) bleibt Minor — Tippfehler im Plesk-Panel sind häufig genug, dass die Validierung Pflicht ist.
- F2.10 (Doku-Single-Source-of-Truth) bleibt Nit — wenn Plesk-Panel die akzeptierte Lösung ist, soll die Doku **nur** das sagen.

---

## Empfohlener Fix-Pfad

**Phase 1 — Sofort (vor jedem weiteren Klassen-Run; Bombe entschärfen):**

1. **F2.1** — `rm packages/backend/probe.mjs`. Optional Key rotieren (sicherer Weg, weil "nur lokal" nicht beweisbar). 5 min ausführen.
2. **F2.5** — `lib/logger.ts` Redact-Konfig erweitern (siehe Code-Snippet). 15 min.

**Phase 2 — Vor Production-Operation (operative Reife):**

3. **F2.2** — `docs/runbooks/minter-compromise-recovery.md` schreiben + `SurveyPointsV2RecoveryStub.sol` als optional pre-baked. 1-2 Personentage.
4. **F2.6** — `docs/security.md` komplett refactoren (Section "Backend Minter Key" + Threat-Model-Tabelle + UPGRADER_ROLE-Korrektur + Rate-Limit-Korrektur). 2-3 h.
5. **F2.3** — Gas-Hard-Cap in `blockchain.ts` einbauen (`TX_OVERRIDES`-Pattern). 1 h.
6. **F2.4** — `MIN_BALANCE_WEI` korrekt dimensionieren + `balance-monitor.ts` + Plesk-Cron für E-Mail. 2 h.

**Phase 3 — Operative Politur:**

7. **F2.7** — `validatePrivateKey` in `config.ts` + Test. 30 min.
8. **F2.8** — `parseProviderError` für `NONCE_EXPIRED`/`REPLACEMENT_UNDERPRICED` erweitern + NonceManager-Reset bei Fehler. 1 h.
9. **F2.9** — `docs/runbooks/eth-refill-procedure.md` schreiben + Frontend-Low-Balance-Banner. 2 h.
10. **F2.10** — `.env.production.example` + `deployment.md` auf "nur Plesk-Panel" konsolidieren. 15 min.

**Geschätzter Gesamt-Aufwand:** 4-5 Personentage. Phase 1 ist ein Mittagessen, Phase 2 ist die eigentliche Arbeit (Recovery-Runbook ist der größte Brocken), Phase 3 ist die Reife-Investition.

---

## Cross-Cutting Notes (für andere Bereiche)

**Zu Bereich 1 (Smart Contract V2):**

- F2.2-Recovery-Plan braucht eine optional pre-baked `SurveyPointsV2RecoveryStub.sol`. Implementation kann minimal sein: nur `_authorizeUpgrade` + ein `recoverAdmin(address[] memory toRevoke, address newAdmin)`-Pfad. Bereich 1 sollte das in einem Folge-Audit ergänzen.
- LastAdmin()-Invariante schützt nicht vor "Angreifer fügt sich selbst hinzu, dann removed alle anderen". Doku in security.md (F2.6-Fix) muss das klar machen.

**Zu Bereich 3 (RPC & Connectivity):**

- F2.3-Gas-Hard-Cap braucht keine RPC-spezifische Anpassung; ethers v6 nutzt den Wert unabhängig vom Provider.
- F2.8-NonceManager-Race verstärkt sich bei FallbackProvider-Sub-Provider-Switches (Bereich 3 hat dafür eigene Findings). Beide gemeinsam testen.

**Zu Bereich 4 (Stateful Stores):**

- F2.5-Logger-Redact ist Cluster mit Bereich 6 F6.4 (pino-http für Headers). Beide gemeinsam fixen, eine PR.
- F2.4-Balance-Monitor schreibt in Plesk-Logs — die Bereich-4-Backup-Strategie sollte Logs in das Backup-Konzept aufnehmen (für F2.2-Forensik).
- F2.7-Boot-Validierung ist eine "fail-fast"-Variante des Stores-Robustheits-Themas. Selbe Designphilosophie.

**Zu Bereich 5 (Frontend Wallet & XSS):**

- F2.4-Frontend-Low-Balance-Banner ist Frontend-Add. CSP muss `getMinterBalance`-API-Call zulassen (sollte bereits, weil die API gleichen Origin hat).

**Zu Bereich 6 (Auth, Replay & Sign-Flows):**

- F2.5-Logger-Redact und F6.4-pino-http-Redact sind dieselbe Implementation, eine PR.
- F2.2-Recovery-Plan referenziert F6.1-Server-Side-Nonce-Status: nach F6.1-Fix ist die "via BaseScan oder cast"-Recovery-Pflicht weiterhin nötig (das Backend ist immer noch der kompromittierte Pfad).

**Zu Bereich 7 (Deployment, Hosting & Operational Readiness):**

- F2.2-Recovery-Plan, F2.6-security.md, F2.9-Refill-Plan, F2.10-Doku-Konsolidierung sind alle Bereich-7-relevant. Bereich 7 sollte einen "Operator Runbook"-Index aufstellen, der auf diese vier Files verweist.
- F2.4-Plesk-Cron für E-Mail-Alarm braucht Plesk-spezifische Konfiguration — Bereich 7 sollte das im Plesk-Setup-Abschnitt verankern.
- OD-2.B-Akzeptanz hängt davon ab, dass HSBI-Plesk-Tenant-Modell stabil bleibt. Bereich 7 sollte das als Voraussetzung im Operational-Readiness-Check explizit prüfen.

**Zu Bereich 8 (Tests & CI):**

- F2.7-Format-Validierung braucht Test (`config.test.ts`).
- F2.5-Logger-Redact braucht Test (`logger.test.ts` mit Mock-Pino).
- F2.3-Gas-Cap braucht Test gegen Mock-Provider mit hohen baseFee-Werten.
- F2.8-Error-Mapping braucht Test mit gemockten ethers-Errors.

---

## Severity-Tally Bereich 2

| Severity   | Anzahl | Findings               |
| ---------- | ------ | ---------------------- |
| 🔴 Blocker | 2      | F2.1, F2.2             |
| 🟠 Major   | 4      | F2.3, F2.4, F2.5, F2.6 |
| 🟡 Minor   | 3      | F2.7, F2.8, F2.9       |
| ⚪ Nit     | 1      | F2.10                  |
| **Gesamt** | **10** |                        |

Plus 2 Documented Owner Decisions (OD-2.A, OD-2.B) — kein Finding, aber Doku-Pflicht.

---

## Aus V1 obsolet geworden

V1-Bereich-2-Audit existiert nicht im Repo (war im Audit-Plan v2 als "noch relevant" gelistet, aber das Original-File `docs/audit/03-bereich-2-key-management.md` ist nicht vorhanden — wurde mit den anderen V1-Audit-Files entfernt). Wo der V1-Plan auf Hypothesen verwiesen hat (siehe `00-audit-plan-v2.md` Abschnitt 4):

- **2.1 Klartext-Minter-Key auf Plesk:** Status NOCH RELEVANT → reklassifiziert zu **OD-2.B** (Owner-Decision). F2.1 (`probe.mjs`) ist die echte Bombe.
- **2.2 Kein Recovery-Playbook:** Status NOCH RELEVANT → bestätigt als 🔴 **F2.2**.
- **2.3 GitHub-Actions = 1-Hop-Eskalation:** Cross-Cutting, Bereich 7 (out-of-scope hier).
- **2.4 `MIN_BALANCE_WEI` zu niedrig:** Bestätigt als 🟠 **F2.4**.
- **2.5 Kein Low-Balance-Alerting:** Bestätigt als Teil von 🟠 **F2.4** (gemeinsam dokumentiert).
- **2.6 Kein Hard-Cap auf `maxFeePerGas`:** Bestätigt als 🟠 **F2.3**.
- **2.7 NonceManager ohne Persistenz:** Bestätigt als 🟡 **F2.8** (mit zusätzlichem Error-Mapping-Aspekt).
- **2.8 `nonce too low` unbehandelt:** Konsolidiert in 🟡 **F2.8**.
- **2.9 Keine Format-Validierung des Minter-Keys:** Bestätigt als 🟡 **F2.7**.
- **2.10 `.env.development` mit Hardhat-Default-Key:** Wurde nicht erneut geprüft (Bereich 7-Scope). Im aktuellen Audit nicht mehr im File-Set.
- **2.11 Doku-Inkonsistenz Plesk-Env vs. `.env`-Datei:** Bestätigt als ⚪ **F2.10**.

Effektiv: V1-Bereich-2-Findings sind 1:1 in V2 wiedererkannt. Keine echte Reduzierung der Risiko-Surface zwischen V1 und V2 in diesem Bereich, weil die Architektur-Verschiebungen (UUPS, HMAC, Nonce-Store) andere Bereiche betroffen haben — der Minter-Wallet-Lifecycle ist seit V1 unverändert. Die einzige Zugewinn: V2 hat den UUPS-Recovery-Pfad als theoretische Option (für F2.2-Worst-Case), den V1 nicht hatte.
