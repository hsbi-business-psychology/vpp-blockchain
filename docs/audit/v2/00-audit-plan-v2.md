# VPP Blockchain — Re-Audit V2 — Plan & Inventur

**Auditor:** Senior Auditor (extern, second pass)
**Stand:** 2026-04-18
**Scope:** kompletter Re-Audit auf den AKTUELLEN Code-Stand nach dem V2-Umbau (UUPS, HMAC, atomic stores, RPC-Härtung, MetaMask-Fix). Der alte Audit (`docs/audit/00–04`) bleibt als Historie unangetastet.
**Ziel:** Go/No-Go-Entscheidung für Klassen-Einsatz auf Base Mainnet, bewertet gegen den heutigen Code, nicht gegen die V1-Architektur.

---

## 1. Executive Summary — Was hat sich seit Audit-V1 geändert?

Zwischen dem alten Audit (`docs/audit/02–03`) und heute hat sich das System fundamental verschoben. Die kritischen V1-Findings (Klartext-Secret on-chain, identischer Link für alle Teilnehmer, frozen ABI ohne Upgrade-Pfad) wurden architektonisch adressiert. Gleichzeitig sind neue Risiko-Surfaces entstanden, die im V1-Audit gar nicht existierten (HMAC-Schlüssel auf Disk, Nonce-Store als autoritativer Replay-Schutz, UUPS-Upgrade-Pfad).

### 1.1 Konkrete Änderungs-Diff (V1 → V2)

| Bereich              | V1 (alter Audit)                                                                               | V2 (heute)                                                                                                                                                              | Quelle                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Smart Contract       | `SurveyPoints.sol`, immutable, `secretHash` on-chain, `awardPoints(student, surveyId, secret)` | `SurveyPointsV2.sol` hinter UUPS-Proxy, kein `secretHash`, `awardPoints(student, surveyId)`                                                                             | `packages/contracts/contracts/SurveyPointsV2.sol`, ADR-0004                                             |
| Claim-Flow           | Identischer `secret` für alle Teilnehmer, in URL und in `calldata`                             | Per-Teilnehmer Nonce/Token, HMAC-SHA256 mit per-Survey-Schlüssel, off-chain verifiziert                                                                                 | `packages/backend/src/services/hmac.ts`, `packages/backend/src/routes/claim.ts`                         |
| Admin-Recovery       | `ADMIN_ROLE` self-admin, `DEFAULT_ADMIN_ROLE` faktisch leer                                    | `ADMIN_ROLE` immer noch self-admin (`SurveyPointsV2.sol:143`), aber `DEFAULT_ADMIN_ROLE` kann via UUPS-Upgrade re-mappen + neuer `LastAdmin()`-Check verhindert Lockout | `packages/contracts/contracts/SurveyPointsV2.sol:143-156`, `:209-215`                                   |
| Punkte-Korrektur     | nicht möglich                                                                                  | `revokePoints(student, surveyId)` (`SurveyPointsV2.sol:222-232`), `reactivateSurvey()`                                                                                  | `SurveyPointsV2.sol`, `packages/backend/src/routes/surveys.ts`                                          |
| Backend-State        | nur Cache (`events.json`)                                                                      | autoritativ: `data/used-nonces.json`, `data/survey-keys.json`, `data/admin-labels.json`; alle mit atomic write-tmp+rename                                               | `packages/backend/src/services/{nonce-store,survey-keys,admin-labels,json-file-event-store}.ts`         |
| RPC-Resilienz        | single `JsonRpcProvider`, kein Fallback, Batching aktiv                                        | `FallbackProvider` mit `batchMaxCount: 1`, `KNOWN_BASE_FALLBACKS`, `EVENT_RPC_URL` separat (Alchemy-Free-Tier-Workaround), Sync-Watchdog                                | `packages/backend/src/services/blockchain.ts`, `packages/backend/src/services/json-file-event-store.ts` |
| Survey-Registrierung | nur on-chain Tx mit `secretHash`                                                               | on-chain Tx + automatische HMAC-Key-Generierung mit Rollback bei TX-Failure, plus PHP-Snippet-Generator für SoSci/LimeSurvey                                            | `packages/backend/src/routes/surveys.ts`, `packages/backend/src/services/template.ts`                   |
| Frontend-Wallet      | MetaMask-Sign-Popup unzuverlässig, kein Locale-Switch                                          | sticky-toast + Timeout/Reject-Handling für MetaMask, deutsche Default-Locale                                                                                            | `packages/frontend/src/lib/wallet.ts`, `packages/frontend/src/hooks/use-wallet.ts`                      |
| Deployment           | direkter Verify, `node_modules` jedes Mal neu hochgeladen                                      | atomic `node_modules`-Hash-Skip, TLS-Cert-Pinning mit Fallback, V2-ABI im Deploy-Bundle                                                                                 | `.github/workflows/deploy.yml`, Commit `a4c00bc`, `1955555`, `cc6faac`                                  |
| Migrations-Pfad      | n/a                                                                                            | `deploy-v2.ts` (UUPS-Init, Admin-Migration aus V1-Logs, V1-Deaktivierung, Deployer-Renounce), idempotenter `finish-cutover.ts`                                          | `packages/contracts/scripts/{deploy-v2,finish-cutover}.ts`                                              |
| Doku                 | V1-Architektur                                                                                 | komplett re-written für V2 (`0ff928f`), V2-Migration-Runbook (`756f2e0`)                                                                                                | `docs/`, README                                                                                         |

### 1.2 Git-Log Highlights (letzte 50 Commits)

Die Reihenfolge der wichtigsten Umbauten lässt sich am Commit-Log ablesen:

1. **RPC-Härtung & Stabilität (Sept–Okt):** `3c05708` FallbackProvider, `0a381a3` Batching aus, `185621b` writes über Fallback, `2c12f31` Sync-Watchdog, `4b39a97` Alchemy-Free-Tier-Routing, `1955555` atomic event-store writes.
2. **Auth/UX-Fixes:** `9a4db48` 401-Loop weg, `874ff34` CSP/lang-init, `e71e25b` Admin-Dashboard-Fix.
3. **HMAC + V2 Contracts (Kern-Umbau):** `db6fc81` `SurveyPointsV2.sol`, `a741093` deploy-v2/migrate scripts, `752d72f` HMAC + nonce-store + survey-keys, `0a82470` Backend-Switch, `da3bf5f` Frontend-Switch.
4. **Cutover-Härtung:** `39378f0` Minter raus aus V1→V2-Migration (Least Privilege), `943c08a` retry+publicnode, `97a53d1` skip log-scan wenn `V1_ADMINS` gesetzt, `5926875` `finish-cutover.ts`.
5. **Operations-Polish:** `a4c00bc` V2-ABI ins Deploy-Bundle, `45889fe` Frontend auf Mainnet-Proxy, `6acf9d3` System-Status zeigt Adresse+Version, `b953d9f` 1-Click-Template-Download, `f1c0384` HMAC-Key komplett aus Admin-UI raus.

Übergreifendes Muster: das Team hat reaktiv auf reale Production-Incidents reagiert (Alchemy-Cap, CSP, MetaMask, Passenger-Restart), die V2-Migration aber strukturiert und idempotent vorbereitet.

---

## 2. Aktuelle Architektur (1 Absatz pro Komponente)

**Smart Contract (`SurveyPointsV2.sol`).** UUPS-Proxy auf Base Mainnet (`0x…`-Proxy laut `45889fe`). Inheritance: `Initializable`, `AccessControlUpgradeable`, `ReentrancyGuardTransient` (EIP-1153, Cancun-only), `UUPSUpgradeable`. Drei Rollen: `DEFAULT_ADMIN_ROLE` (gated `_authorizeUpgrade`), `ADMIN_ROLE` (Survey-Lifecycle, Admin-Verwaltung), `MINTER_ROLE` (`awardPoints`, `revokePoints`, `markWalletSubmitted`). `awardPoints` hat keinen Secret-Parameter mehr. Neu: `revokePoints`, `reactivateSurvey`, `LastAdmin()`-Invariante (verhindert dass der letzte ADMIN entfernt wird), `version()` → `"2.0.0"`. Storage-Gap `__gap[40]` für zukünftige Felder. **Achtung:** `_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)` ist unverändert aus V1 übernommen — `DEFAULT_ADMIN_ROLE` kann ADMIN_ROLE nicht direkt revoken, sondern nur über einen Upgrade.

**Backend (`packages/backend`).** Express + ethers v6. Drei autoritative Disk-Stores in `data/`: `used-nonces.json` (Replay-Schutz, Schlüssel `${surveyId}:${nonce}`, atomic), `survey-keys.json` (per-Survey HMAC-Schlüssel, 32 Random-Bytes base64url, atomic), `admin-labels.json` (Display-Namen für Admins). Plus Cache: `events.json` (Event-Store, inkrementell ab `CONTRACT_DEPLOY_BLOCK`, Watchdog `SYNC_TIMEOUT_MS`). RPC via `FallbackProvider` mit `batchMaxCount: 1` und einer harten Liste `KNOWN_BASE_FALLBACKS` (publicnode etc.); separater `EVENT_RPC_URL` für `eth_getLogs` (umgeht Alchemy-Free-Tier 10-Block-Cap). Minter-Wallet als `ethers.NonceManager` über `ethers.Wallet`, `MIN_BALANCE_WEI`-Pre-Check vor jeder Write-Tx. Auth via EIP-191-Signaturen + on-chain `ADMIN_ROLE`-Lookup (`middleware/auth.ts`).

**Claim-Flow (`routes/claim.ts` + `services/hmac.ts`).** Teilnehmer ruft Backend mit `walletAddress`, `surveyId`, `nonce`, `token`, `signature`, `message`. Backend: (1) Shape-Validierung von Nonce/Token, (2) Message-Freshness via `maxMessageAgeMs`, (3) EIP-191-Verifikation, (4) Survey-Lookup (`exists`, `active`, `surveyKey`), (5) `verifyToken` (HMAC-SHA256 mit `crypto.timingSafeEqual`), (6) Doppel-Replay-Check (`nonce-store.isUsed` UND `blockchain.hasClaimed`), (7) **`nonce-store.markUsed` BEVOR** `awardPoints` (fail-closed: lieber verloren als doppelt). Triggert anschließend Event-Store-Sync.

**Survey-Lifecycle (`routes/surveys.ts`).** `POST /` registriert on-chain UND erzeugt vorab HMAC-Key mit `survey-keys.createKey()`; bei TX-Failure Rollback des Keys. `POST /:id/template` rendert SoSci-/LimeSurvey-Snippet als PHP, der den HMAC-Schlüssel als String-Literal einbettet, eine Random-Nonce generiert und die Claim-URL pro Teilnehmer baut. `GET /:id/key` gibt den Key an Admins zurück. `POST /:id/key/rotate` erzeugt neuen Key. `POST /:id/deactivate|reactivate|revoke` mappen 1:1 auf Contract-Calls.

**Frontend (`packages/frontend`).** Vite + React 19 + react-router. Wallet-Variante: lokal generierte ethers-Wallets in `localStorage` (Plaintext) ODER MetaMask-Anbindung. MetaMask-Härtung: Account-Probe vor `personal_sign`, Timeout, sticky toast bei lang laufendem Popup. Claim-Page liest URL-Params `s`, `n`, `t`, signiert mit lokaler oder MetaMask-Wallet, postet an `/api/v1/claim`. Admin-Dashboard zeigt aktuell System-Status (Contract-Adresse + Version), Surveys, Admins.

**Deployment (`.github/workflows`, `scripts/`).** GitHub Actions baut Contracts/Backend/Frontend, lädt via `lftp` über FTPS auf Plesk, pinnt das `hosting.hsbi.de`-Cert-Chain (Fallback: encrypted-but-unverified TLS), skippt unveränderte `node_modules` per Hash, touched `tmp/restart.txt` für Phusion-Passenger-Reload. Secrets (`MINTER_PRIVATE_KEY`, FTP-Creds) in GitHub-Secrets. CI: Hardhat-Node + `deploy-v2-local.ts` für Backend-Integration-Tests, plus Lint, Coverage, Lighthouse.

**Stores & Persistenz (`data/`).** Vier Files, alle atomic via `writeFileSync` → `renameSync`. Tatsächlicher Ordner ist im `.gitignore` (Glob bestätigt: `packages/backend/data/` leer/nicht versioniert). Kein dokumentiertes Backup-Konzept im Repo. Kein File-Lock — bei parallelen Plesk-Workern theoretisch race-fähig (Plesk Passenger spawned mehrere Worker-Prozesse). Last-Write-Wins für `survey-keys.json` und `used-nonces.json` ist sicherheitskritisch zu prüfen.

---

## 3. Welche alten Findings sind durch den Umbau OBSOLET?

| Alt-Finding                                               | Status               | Begründung (mit Quelle)                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1.1 Kein Upgrade-Mechanismus**                          | ✅ OBSOLET           | UUPS-Proxy via `UUPSUpgradeable`, `_authorizeUpgrade` durch `DEFAULT_ADMIN_ROLE` gegated. `SurveyPointsV2.sol:255-258`                                                                                                                                             |
| **1.3 Klartext-Secret on-chain (Critical)**               | ✅ OBSOLET           | `awardPoints(address, uint256)` hat keinen `secret`-Parameter mehr. `SurveyPointsV2.sol:170-184`                                                                                                                                                                   |
| **1.5 Monotoner Punkte-Counter ohne Korrektur**           | ✅ OBSOLET           | `revokePoints(student, surveyId)` löscht `claimed[student][surveyId]` und reduziert `studentPoints`. `SurveyPointsV2.sol:222-232`                                                                                                                                  |
| **1.6 `getSurveyInfo` exposed `secretHash`**              | ✅ OBSOLET           | `SurveySnapshot`-Struct enthält keinen `secretHash` mehr. `SurveyPointsV2.sol:99-105`, `:286-300`                                                                                                                                                                  |
| **1.7 Link-Sharing-Catastrophe (Critical)**               | ✅ OBSOLET           | Per-Teilnehmer-Nonce in `n=` + HMAC-Token in `t=`; einmal verbraucht (`nonce-store`) ist die URL tot. `services/hmac.ts`, `routes/claim.ts:200-210`                                                                                                                |
| **1.4 Keine Secret-Rotation / Survey-Löschung (High)**    | ⚠️ TEILWEISE OBSOLET | Off-chain `rotateKey()` ersetzt Survey-Re-Erstellung. `reactivateSurvey()` heilt versehentliche Deaktivierungen. ABER: kein on-chain `deleteSurvey()`, alte Entries bleiben on-chain sichtbar. Wird in Bereich 1 verifiziert.                                      |
| **1.2 Admin-Lockout (Medium)**                            | ⚠️ TEILWEISE OBSOLET | `LastAdmin()`-Invariante (`SurveyPointsV2.sol:209-215`) verhindert Self-Lockout. ABER `_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)` ist unverändert (`:143`) — Recovery-Pfad für `DEFAULT_ADMIN_ROLE` läuft NUR über Upgrade. Wird in Bereich 1 + Bereich 7 verifiziert. |
| **2.7 NonceManager ohne Persistenz (Minor)**              | ⚠️ TEILWEISE OBSOLET | Nicht gefixt im Code, aber Risiko reduziert durch FallbackProvider + Sync-Watchdog. Wird in Bereich 2 final bewertet.                                                                                                                                              |
| **2.8 `nonce too low` unbehandelt (Minor)**               | ⚠️ UNGEKLÄRT         | Commit `14b6100` mappt `AccessControlUnauthorizedAccount` und Provider-Fehler — Nonce-Errors expliziet zu prüfen in Bereich 2.                                                                                                                                     |
| **2.10 `.env.development` mit Hardhat-Default-Key (Nit)** | ❓ ZU PRÜFEN         | Datei existiert noch im Repo? Verifikation in Bereich 7.                                                                                                                                                                                                           |

---

## 4. Welche alten Findings sind WAHRSCHEINLICH NOCH RELEVANT?

| Alt-Finding                                                 | Vermutung            | Verifikations-Plan                                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **2.1 Klartext-Minter-Key auf Plesk (Blocker)**             | NOCH RELEVANT        | `MINTER_PRIVATE_KEY` wird in `config.ts` weiterhin als Plain-String aus ENV geladen, kein KMS, kein Multi-Sig. Plesk-Login bleibt SPOF. Bereich 2.                                                                       |
| **2.2 Kein Recovery-Playbook (Blocker)**                    | NOCH RELEVANT        | `docs/runbooks/`-Lookup ausstehend. Falls Migration-Runbook (Commit `756f2e0`) nicht den Compromise-Fall abdeckt → unverändert. Bereich 7.                                                                               |
| **2.3 GitHub-Actions = 1-Hop-Eskalation (Blocker)**         | NOCH RELEVANT        | `deploy.yml` unverändert in der relevanten Surface; FTP+TLS-Pinning verhindert MITM aber nicht GHA-Pipeline-Compromise. Plus: `MINTER_PRIVATE_KEY` ist GHA-Secret (für Integration-Tests/Deploy). Bereich 2 + Bereich 7. |
| **2.4 `MIN_BALANCE_WEI` zu niedrig (Major)**                | NOCH RELEVANT        | `blockchain.ts` unverändert — gleiche statische Schwelle. Bereich 2.                                                                                                                                                     |
| **2.5 Kein Low-Balance-Alerting (Major)**                   | NOCH RELEVANT        | Kein Code-Pfad zu Alerting-Dienst gefunden. Bereich 2 + Bereich 7.                                                                                                                                                       |
| **2.6 Kein Hard-Cap auf `maxFeePerGas` (Major)**            | NOCH RELEVANT        | `awardPoints`/`registerSurvey` in `blockchain.ts` haben keinen `gasPrice`/`maxFeePerGas`-Override. Bereich 2.                                                                                                            |
| **2.9 Keine Format-Validierung des Minter-Keys (Minor)**    | NOCH RELEVANT        | `config.ts` validiert nicht — bei Tippfehler wird ggf. der Key in Logs sichtbar. Bereich 2.                                                                                                                              |
| **2.11 Doku-Inkonsistenz Plesk-Env vs. `.env`-Datei (Nit)** | NOCH RELEVANT        | `.env.production.example` schreibt beide Optionen weiterhin gleichberechtigt vor. Bereich 7.                                                                                                                             |
| **Cross-Cutting V1: Secret in Server-Logs**                 | NICHT MEHR ANWENDBAR | Es gibt keinen Secret-Parameter mehr — aber: HMAC-Key in `survey-keys.json` und im PHP-Snippet-Output potenziell loggable. NEU als HMAC-Key-Leakage in Bereich 4 + Bereich 7.                                            |

---

## 5. Re-Audit-Plan: Bereiche 1–8

### Bereich 1 — Smart Contract V2 (`SurveyPointsV2.sol` + Storage-Layout)

**Risiko-Einschätzung:** 🟠 Major. Kern der Wertschöpfung; jeder Bug = on-chain.
**Hypothesen:**

- `_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)` macht `DEFAULT_ADMIN_ROLE`-Recovery zu einer Upgrade-Operation → höhere Komplexität im Incident.
- `__gap[40]` ist evtl. nicht korrekt dimensioniert für die aktuellen State-Variablen + `AccessControlUpgradeable`-Slots.
- `ReentrancyGuardTransient` benötigt EIP-1153 — Base unterstützt seit Cancun (März 2024) ja, aber Test-Coverage prüfen.
- `revokePoints` hat kein Event für die Up-Counter-Korrektur (nur Decrement); Off-chain-Indexer muss das idempotent verarbeiten.
- `reactivateSurvey` reaktiviert `surveyId`, aber HMAC-Key off-chain könnte rotiert worden sein → Inkonsistenz.
  **Output:** `docs/audit/v2/01-bereich-1-smart-contract-v2.md`

### Bereich 2 — Backend Key Management & Minter-Wallet

**Risiko-Einschätzung:** 🔴 Blocker-Kandidat. Direkter on-chain-Schlüssel im Klartext.
**Hypothesen:**

- Findings 2.1, 2.4, 2.5, 2.6 unverändert (siehe oben).
- `NonceManager` ohne Persistenz × FallbackProvider mit `batchMaxCount: 1` = potenziell unterschiedliche Nonces aus unterschiedlichen RPCs bei Fallback-Switch.
- HMAC-Key-Generation läuft VOR der on-chain-Tx in `surveys.ts` — Rollback-Logic ggf. lückenhaft (was wenn `unlinkSync` failed?).
  **Output:** `docs/audit/v2/02-bereich-2-key-management.md`

### Bereich 3 — RPC & Connectivity

**Risiko-Einschätzung:** 🟡 Minor (gehärtet, aber komplex).
**Hypothesen:**

- `KNOWN_BASE_FALLBACKS` enthält Public-RPCs ohne Rate-Limiting-Garantie — bei Klassen-Run mit 30 parallelen Claims = Throttling.
- `EVENT_RPC_URL`-Trennung gut, aber `getBlockTimestamps` läuft sequenziell (alter V1-Befund) — bei Cold-Sync nach Plesk-Restart immer noch Last-Spike.
- `/health/diag` exposed zu viel Operator-Info (RPC-Hosts) — informational disclosure?
  **Output:** `docs/audit/v2/03-bereich-3-rpc-resilience.md`

### Bereich 4 — Stateful Stores & Data Integrity

**Risiko-Einschätzung:** 🔴 Blocker-Kandidat. Neue autoritative Disk-Stores ohne Backup, ohne File-Lock, ohne Multi-Worker-Schutz.
**Hypothesen:**

- Plesk Passenger spawned mehrere Worker → atomic rename ist pro-File-OK, aber `survey-keys.createKey()` hat eine TOCTOU zwischen `hasKey()` und `writeFileSync` (zwei Worker können parallel `createKey` für dieselbe `surveyId` aufrufen).
- `used-nonces.json` wächst unbegrenzt; bei mehreren tausend Claims über die Zeit performance- und Backup-relevant.
- Verlust von `data/used-nonces.json` (Disk-Crash, fehlerhaftes Restore) ⇒ kompletter Replay-Schutz weg, Doppelclaims möglich (nur on-chain `hasClaimed` als zweite Linie, aber das blockiert nur denselben Wallet).
- Verlust von `data/survey-keys.json` ⇒ alle aktiven Surveys unbrauchbar (Token-Verifikation schlägt fehl).
- Kein Backup-Job, kein Restore-Test dokumentiert.
- File-Permissions in production? Wenn `data/` für `apache:www-data` lesbar → SoSci-Admin-Zugriff via Plesk-Webshell?
  **Output:** `docs/audit/v2/04-bereich-4-stores-data-integrity.md`

### Bereich 5 — Frontend Wallet & XSS

**Risiko-Einschätzung:** 🟡 Minor (lokale Wallet bleibt der „selbstverantwortliche" Modus).
**Hypothesen:**

- `localStorage` bleibt Plaintext-Key. Jede XSS = Wallet-Drain (für lokale Wallets).
- CSP-Lockdown nach `874ff34` prüfen: blockiert er auch `eval`, dynamische Scripts, MetaMask-injected scripts?
- `downloadKeyFile` exportiert Plaintext-JSON — User-Education-Frage.
- MetaMask-Reliability-Fix: Timeout-Branches korrekt? Reject vs. Pending-Detection?
  **Output:** `docs/audit/v2/05-bereich-5-frontend-wallet-xss.md`

### Bereich 6 — Auth, Replay & Sign-Flows

**Risiko-Einschätzung:** 🟠 Major. Sicherheitskritischer Pfad.
**Hypothesen:**

- `canonicalMessage` und EIP-191-Verifikation: ist die Message-Domain (Origin/ChainId/SurveyId/Wallet) lückenlos gebunden? Cross-Site-Replay zwischen Surveys möglich?
- `markUsed` BEFORE `awardPoints` ist fail-closed — aber: was bei `awardPoints`-Crash ohne Tx-Receipt? Nonce verloren, Student blockiert.
- `maxMessageAgeMs`-Default-Wert? Skew zwischen Server- und Client-Uhr (SoSci-PHP-Server vs. Backend-Server).
- Rate-Limit auf `/claim` (Bereich 6 + Bereich 3): wirksam pro IP oder pro Survey? Bei NAT (Schul-WLAN) = alle Studierenden teilen 1 IP → DoS.
- Admin-Auth über EIP-191-Signatur ohne Nonce/JWT — Replay innerhalb `maxMessageAgeMs` denkbar?
  **Output:** `docs/audit/v2/06-bereich-6-auth-replay.md`

### Bereich 7 — Deployment, Hosting & Operational Readiness

**Risiko-Einschätzung:** 🔴 Blocker-Kandidat (alte 2.1/2.2/2.3 unverändert).
**Hypothesen:**

- GHA-Compromise-Pfad unverändert. `MINTER_PRIVATE_KEY` als GHA-Secret → 1-Hop.
- TLS-Pinning Fallback („encrypted-but-unverified") ist im Klartext-Log akzeptiert — aber MITM auf `hosting.hsbi.de` via Hochschul-Proxy denkbar.
- Plesk-Login = Single Account = SPOF.
- `data/`-Backup-Strategie? Plesk-Snapshots? Kann Joris einen Restore in <30 min durchspielen?
- `deploy-v2.ts` / `finish-cutover.ts` als Production-Skripte: laufen mit `MINTER_PRIVATE_KEY` UND mit Deployer-Key (anfangs `DEFAULT_ADMIN_ROLE`) — wo läuft das? Lokal? GHA? Sicherer Host?
- `keepDeployerAdmin`-Flag-Default: bestätigt es wirklich `false` in Production?
  **Output:** `docs/audit/v2/07-bereich-7-deployment-ops.md`

### Bereich 8 — Tests & CI

**Risiko-Einschätzung:** 🟡 Minor (CI ist da, Coverage-Quality offen).
**Hypothesen:**

- HMAC-Token-Tests: positive UND negative Pfade (falscher Key, expired-Message, replayed-Nonce, malformierter Token)?
- `deploy-v2.ts` hat keinen Dry-Run-Test — Migration wird live „getestet".
- Integration-Tests gegen Hardhat-Node = ja, aber gegen UUPS-Proxy mit echter `_authorizeUpgrade`-Logik?
- Frontend-E2E (Playwright?) für MetaMask-Flow vorhanden?
- Coverage-Report im CI veröffentlicht (Codecov-Skip-Logik in Commit `a15b56c`)?
  **Output:** `docs/audit/v2/08-bereich-8-tests-ci.md`

### Synthese & Go/No-Go

**Output:** `docs/audit/v2/09-synthese-go-nogo.md`

---

## 6. Reihenfolge der Bereich-Audits

Begründung: erst die hochkritischen On-Chain- und Key-Bereiche, dann Daten-Integrität, dann Operational, dann Frontend/CI als Backstop.

1. **Bereich 1** — Smart Contract V2 (Fundament; alles Folgende setzt korrekte On-Chain-Semantik voraus)
2. **Bereich 4** — Stateful Stores (NEU im V2; höchstes „neues" Risiko)
3. **Bereich 6** — Auth, Replay & Sign-Flows (HMAC + EIP-191; Kern-Sicherheit)
4. **Bereich 2** — Backend Key Management (alte Blocker re-validieren)
5. **Bereich 3** — RPC & Connectivity (gehärtet, aber Klassen-Last-Test offen)
6. **Bereich 5** — Frontend Wallet & XSS
7. **Bereich 7** — Deployment, Hosting & Operational Readiness
8. **Bereich 8** — Tests & CI
9. **Synthese & Go/No-Go**

Erwartete Output-Files siehe Spalte „Output" in Abschnitt 5.
