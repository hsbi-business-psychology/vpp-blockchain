# VPP Blockchain — Audit Log v2

Letzte Aktualisierung: 2026-04-19 (Re-Synthese-Pass abgeschlossen)

## Status

- [x] Bereich 0 — Init
- [x] Bereich 1 — Smart Contract V2
- [x] Bereich 2 — Backend Key Management & Minter-Wallet
- [x] Bereich 3 — RPC & Connectivity
- [x] Bereich 4 — Stateful Stores & Data Integrity
- [x] Bereich 5 — Frontend Wallet & XSS
- [x] Bereich 6 — Auth, Replay & Sign-Flows
- [x] Bereich 7 — Deployment, Hosting & Operational Readiness
- [x] Bereich 8 — Tests & CI
- [x] Bereich 9 — Synthese (Master-Findings + zwei Verdicts, `09-synthesis-go-no-go.md`)

**Audit V2 abgeschlossen.** Finale Synthese in `09-synthesis-go-no-go.md`: Master-Findings (18 dedupliziert), Verdict Testrun vs. Verdict 2-Jahre, 24-h-Fix-Sequenz, Akzeptierte Risiken, Long-Term-Backlog, Bus-Factor-Test.

## Severity-Tally — Original (per-Bereich-Findings, wie gemeldet)

🔴 Blocker: 18 / 🟠 Major: 31 / 🟡 Minor: 30 / ⚪ Nit: 17 = **96 Findings**

Plus: 2 Documented Owner Decisions (kein Finding) — siehe Bereich 2.
Plus: 6 Cluster-Anker aus Bereichen 2/4/5/6 in Bereich 7 zur operativen Ausführung.
Plus: 36 priorisierte Test-Backlog-Items aus Bereich 8 mit Cross-Reference zu 27 „ungetesteten" Findings aus Bereichen 1–7.

## Severity-Tally — Re-Synthese (dedupliziert, kontext-priorisiert)

**18 Master-Findings** aus 96 Original-Findings (Faktor 5 Dedupe).

| Verdict                                | 🔴 Blocker                                     | 🟠 Major                            | 🟡 Minor | ⚪ Nit |
| -------------------------------------- | ---------------------------------------------- | ----------------------------------- | -------- | ------ |
| **Studi-Testrun (3 Tage, beobachtet)** | 4 (M1, M9, M11, M12)                           | 7 (M2, M3, M6, M10, M13, M14, M15)  | 6        | 1      |
| **2-Jahre-Produktiv (unbeobachtet)**   | 9 (M1, M2, M3, M4, M7, M8, M9, M11, M14) + M15 | 7 (M5, M6, M10, M12, M13, M16, M17) | 1 (M18)  | —      |

Plus: 9 explizit dokumentierte Risk-Acceptance-Items (siehe `09-synthesis-go-no-go.md` Section "Akzeptierte Risiken").

## Verdict-Zusammenfassung

| Szenario                                           | Status                  | Bedingung                                                                           |
| -------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| **Studi-Testrun (≤30 Studis, 3 Tage, beobachtet)** | 🟢 **GO**               | Nach 24-h-Fix-Sequenz (10–12 h Wall-Clock)                                          |
| **2-Jahre-Produktiv (unbeobachtet, 4 Runs/Jahr)**  | 🟠 **GO mit Bedingung** | 24-h-Sequenz + Phase 2 (~12–15 PT staged bis Q3/2026) + Bus-Factor-Setup (1 PT)     |
| **Bus-Factor-Test (Hirschfeld solo, 2-h-Patch)**   | 🔴 **SCHEITERT HEUTE**  | 1 PT Owner-Recherche + `operators-private.md` + CODEOWNERS + Drill                  |
| **V3-Re-Deployment-Pflicht**                       | Q1–Q2/2027              | Spätestens bei F1.2-Vorfall, F1.4-Architektur-Heilung, oder On-Chain-Auth-Migration |

**Konkrete Schluss-Zeile (aus `09-synthesis-go-no-go.md`):**

> `[0] BLOCKERS, [6] MAJORS verbleibend nach 24h-Fix-Sequenz für Studi-Testrun.`
> `[7] BLOCKERS, [6] MAJORS verbleibend nach 24h-Fix-Sequenz für 2-Jahre-Produktivbetrieb.`

## Chronologisches Log

### 2026-04-18 00:08 — Bereich 0 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/00-audit-plan-v2.md` — Plan, V1→V2-Diff, Status alter Findings, Re-Audit-Reihenfolge.
- `docs/audit/v2/AUDIT-LOG.md` — diese Datei.

**Gelesen (Bestandsaufnahme):**

- Audit-V1: `docs/audit/00-audit-plan.md`, `01-context-answers.md`, `02-bereich-1-smart-contract.md`, `03-bereich-2-key-management.md`. Bereich 3/4 V1 nicht im Repo.
- ADR: `docs/adr/0004-hmac-claim-tokens-and-upgradeable-contract.md`.
- Smart Contract: `packages/contracts/contracts/SurveyPointsV2.sol`, `scripts/deploy-v2.ts`, `scripts/finish-cutover.ts`.
- Backend (komplett): `services/blockchain.ts`, `services/hmac.ts`, `services/nonce-store.ts`, `services/survey-keys.ts`, `services/json-file-event-store.ts`, `services/admin-labels.ts`, `services/template.ts`, `routes/claim.ts`, `routes/admin.ts`, `routes/surveys.ts`, `routes/health.ts`, `middleware/auth.ts`, `config.ts`.
- Frontend: `hooks/use-wallet.ts`, `lib/wallet.ts`, `pages/claim.tsx`.
- Ops: `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `.env.production.example`, `README.md`.
- Git-History: `git log --oneline -50` (Septemner-Umbau RPC → Oktober HMAC/V2 → April Operations-Polish).

**Erkenntnisse aus der Inventur (KEINE Findings):**

1. **Architektur-Sprung verifiziert.** V2 ist nicht V1+Patch, sondern ein Neuaufbau der Trust-Boundary: Off-Chain HMAC ersetzt On-Chain-Secret, UUPS ersetzt Immutability, atomic File-Stores ersetzen Memory-State. Vier der sechs kritischen V1-Findings (1.1, 1.3, 1.5, 1.6, 1.7) sind dadurch obsolet.

2. **Recovery-Pfad verschoben, nicht eliminiert.** `_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)` (`SurveyPointsV2.sol:143`) ist unverändert übernommen — `DEFAULT_ADMIN_ROLE` kann ADMIN_ROLE nicht direkt revoken. Recovery läuft jetzt über UUPS-Upgrade, was das Threat-Modell auf den DEFAULT-ADMIN-Schlüssel verschiebt. Wer ist DEFAULT_ADMIN in Production? Hardware-Wallet, Multi-Sig oder Hot-Wallet? In Bereich 1 + 2 zu klären.

3. **Neue autoritative State-Files = neuer SPOF.** `data/used-nonces.json` und `data/survey-keys.json` sind im Repo nicht versioniert (`.gitignore`), kein Backup-Konzept dokumentiert, kein File-Lock gegen Multi-Worker-Plesk-Passenger. Verlust = Replay-Schutz weg ODER alle Surveys unbrauchbar.

4. **Alte Blocker aus Bereich 2 (Minter-Key) wurden NICHT adressiert.** Klartext-Key auf Plesk, kein Hard-Cap auf `maxFeePerGas`, kein Low-Balance-Alerting, kein Recovery-Playbook (zumindest nicht im offensichtlichen Pfad). Alle vier müssen in Bereich 2/7 frisch bewertet werden — der V1-Status ist die wahrscheinliche Baseline.

5. **HMAC-Key-Distribution = neuer Angriffsvektor.** Der per-Survey-HMAC-Schlüssel landet als String-Literal im SoSci-PHP-Snippet (`services/template.ts`). Wer SoSci-Admin-Zugang hat (HSBI-IT? andere Lehrende?), kann beliebig viele Tokens für jede Wallet-Adresse generieren. SoSci-Admins sind nicht VPP-Admins — neuer Trust-Boundary, in Bereich 4/6/7 zu prüfen.

6. **CI/Operations sind reaktiv gewachsen.** Viele Commits sind direkte Fixes auf reale Production-Incidents (Alchemy-Cap, CSP, MetaMask, Passenger-Pause). Das deutet auf eine engagierte Maintenance, aber auch auf fehlende Pre-Production-Tests für realitätsnahe Last (Klassen-Run mit 30+ parallelen Claims). In Bereich 3/8 zu validieren.

**Nächster Schritt:** Bereich 1 (Smart Contract V2) — Output `docs/audit/v2/01-bereich-1-smart-contract-v2.md`.

---

### 2026-04-18 01:15 — Bereich 1 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/01-bereich-1-smart-contract-v2.md` — 11 neue V2-Findings + Mapping der V1-Findings auf obsolet/neu-bewertet.

**Gelesen (zusätzlich zu Bereich 0):**

- `packages/contracts/contracts/SurveyPointsV2.sol` (399 Zeilen, komplett)
- `packages/contracts/test/SurveyPointsV2.test.ts` (407 Zeilen, alle 38 `it`-Blöcke der V2-Spec)
- `packages/contracts/scripts/deploy-v2.ts` (551 Zeilen)
- `packages/contracts/scripts/finish-cutover.ts` (235 Zeilen)
- `packages/contracts/scripts/deploy-v2-local.ts` (74 Zeilen)
- `packages/contracts/.openzeppelin/base.json` (Storage-Layout-Manifest, 263 Zeilen)
- `packages/contracts/hardhat.config.ts` (68 Zeilen)
- `docs/adr/0004-hmac-claim-tokens-and-upgradeable-contract.md` (181 Zeilen)
- `docs/smart-contract.md` (245 Zeilen)
- `packages/backend/src/services/template.ts` (265 Zeilen)

**Severity-Verteilung Bereich 1:**

🔴 Blocker: 1 (F1.1 Minter hat ADMIN_ROLE — manueller BaseScan-Grant umgeht das Least-Privilege-Design des Deploy-Scripts; Minter-Compromise eskaliert von „fake awards" zu Survey-Lifecycle-Vollkontrolle).

🟠 Major: 4

- F1.2 LastAdmin-Schutz umgehbar via direkten `revokeRole`/`renounceRole` (komplettes ADMIN_ROLE-Lockout möglich, Recovery nur via Upgrade).
- F1.3 Doku-Inkonsistenzen, die im Incident-Fall zu falschen Annahmen führen (Auth-Rolle für Upgrade falsch, `revokePoints`-Rolle falsch, `version()`-String falsch, Env-Var-Namen falsch, `upgrade-v2.ts` referenziert aber nicht im Repo).
- F1.4 HMAC-Key im PHP-Snippet leakt an SoSci-Operator-Trust-Boundary (Code-Comment akzeptiert das, aber „SoSci-Admin == VPP-Admin"-Annahme stimmt in HSBI-Realität nicht).
- F1.5 OZ-Storage-Manifest-Filename `base.json` statt `unknown-8453.json` — UNGEPRÜFT, ob das Plugin es findet; bei Mismatch entfällt der Storage-Layout-Schutz beim Upgrade.

🟡 Minor: 4

- F1.6 Test-Lücke: ADMIN_ROLE-only-Holder wird nicht explizit gegen Upgrade getestet.
- F1.7 Deploy- und Cutover-Skripte ohne automatisierte Tests (Migration wird live „getestet").
- F1.8 `revokePoints`-Event-Stream — Cross-Cutting in Bereich 4 (Event-Store-Coverage).
- F1.9 `version()` als hard-coded String, kein Auto-Bump-Mechanismus.

⚪ Nit: 2

- F1.10 `awardPoints(student, 0)` revertiert mit irreführendem `SurveyNotFound` statt `InvalidSurveyId`.
- F1.11 `addAdmin`-Idempotenz emittiert kein Event bei No-Op (Operator-Forensik-Lücke).

**Kern-Erkenntnisse Bereich 1:**

1. **V2 hat die V1-Critical-Findings architektonisch eliminiert** (4 von 7 V1-Findings obsolet, 2 teilweise adressiert). Der Contract selbst ist sauber implementiert: Custom-Errors durchgehend, konsistente `onlyRole`-Auth, vollständige Events, sinnvolles Storage-Layout mit `__gap[40]`.

2. **Die Findings liegen primär an den Schnittstellen,** nicht im Contract-Code selbst:
   - Schnittstelle Contract ↔ Deploy-Skript: Minter wird im Skript ausgeschlossen, in Production manuell wieder rein-gegranted (F1.1).
   - Schnittstelle Contract ↔ Doku: vier separate Inkonsistenzen, jede einzeln klein, in Summe gefährlich für Incidents (F1.3).
   - Schnittstelle Contract ↔ Backend ↔ SoSci: HMAC-Key-Trust-Boundary nicht modelliert (F1.4).
   - Schnittstelle Contract ↔ OZ-Plugin: Manifest-Filename ungewöhnlich, Validierungspfad ungesichert (F1.5).
   - Schnittstelle `removeAdmin` ↔ OZ-Standardpfade `revokeRole`/`renounceRole`: LastAdmin-Schutz nur im Wrapper, nicht im Override (F1.2).

3. **Empfohlener Fix-Pfad:**
   - **Sofort:** F1.1 (BaseScan-`revokeRole` Minter, oder ADR mit explizitem Trade-off + Multi-Sig-Plan).
   - **V2.1-Upgrade:** F1.2 + F1.10 + F1.9 in einer Implementation.
   - **Doku- und Skript-Edits:** F1.3 (kein Code-Risiko).
   - **Test-Hardening:** F1.6 + F1.7 + F1.5-Verifizierung in CI.
   - **Architektur-Diskussion mit HSBI-IT:** F1.4 (SoSci-Hosting-Modell).

**Cross-Cutting-Hinweise für nächste Bereiche:**

- **Bereich 2:** F1.1 verschlimmert das Minter-Compromise-Szenario massiv. V1-Findings 2.1, 2.4, 2.6 unverändert relevant und kombinieren mit F1.1 zu deutlich höherem Gesamtrisiko.
- **Bereich 4:** F1.8 — Event-Store muss `PointsRevoked`, `SurveyReactivated`, `SurveyDeactivated`, `WalletUnsubmitted` korrekt verarbeiten.
- **Bereich 6:** F1.4 verschiebt das Auth-Modell — zusätzliche Schutzmaßnahmen in `routes/claim.ts` prüfen (Rate-Limit pro Survey, Anomalie-Detection).
- **Bereich 7:** F1.3 (fehlendes Skript), F1.5 (Manifest-Filename), F1.7 (Skript-Tests). Plus: Recovery-Pfad für „LastAdmin via revokeRole entfernt" wäre nach F1.2-Fix obsolet, vorher kritisch.

**Nächster Schritt:** Bereich 4 (Stateful Stores & Data Integrity) — laut Plan vor Bereich 2/3, weil das die NEUSTE Risiko-Surface aus dem V2-Umbau ist. Output `docs/audit/v2/04-bereich-4-stores-data-integrity.md`.

---

### 2026-04-18 02:30 — Bereich 3 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/03-bereich-3-rpc-connectivity.md` — 11 V2-Findings + Empfehlungen + Cross-Cutting-Notes.

**Gelesen (zusätzlich zu Bereich 0/1):**

- `packages/backend/src/services/blockchain.ts` (567 Zeilen, komplett — Re-Read mit Fokus auf Provider-Konstruktion)
- `packages/backend/src/lib/rpcRetry.ts` (97 Zeilen, komplett)
- `packages/backend/src/services/json-file-event-store.ts` (308 Zeilen, komplett — Re-Read mit Fokus auf runSync + Watchdog)
- `packages/backend/src/routes/health.ts` (169 Zeilen, komplett)
- `packages/backend/src/server.ts` (155 Zeilen, komplett — Boot-Sequenz, CSP)
- `packages/backend/src/services/survey-cache.ts` (57 Zeilen, komplett)
- `packages/backend/src/config.ts` (82 Zeilen, Re-Read)
- `packages/backend/probe.mjs` (47 Zeilen) — **enthält Live-Minter-Key in Klartext, gehört zu Bereich 2**
- `git log --oneline -50 | grep -iE "rpc|fix|provider|fallback|alchemy|sync|chunk"` (27 Treffer — Schmerz-Historie)

**Wichtiger Hinweis zur Aufgabenbeschreibung:**

Zwei der vorausgesetzten Files existieren NICHT im Repo:

- `docs/audit/v2/02-bereich-2-key-management.md` — Bereich 2 noch nicht durchgeführt.
- `docs/audit/04-bereich-3-rpc-resilience.md` — V1 hatte keinen RPC-Audit.

Konsequenz: Bereich 3 V2 ist Greenfield, kein V1-Mapping nötig.

**Severity-Verteilung Bereich 3:**

🔴 Blocker: 0
🟠 Major: 4

- F3.1 Cross-Provider Block-Number-Mismatch → permanente Event-Lücke im Cache (provider vs. eventProvider liefern unterschiedliche `getBlockNumber()`-Antworten, runSync persistiert provider-View aber queryFilterChunked nutzt eventProvider-View).
- F3.2 Cold-Sync-Crash-Loop bei `CONTRACT_DEPLOY_BLOCK=0` (Default in `.env.production.example`) + 45s-Watchdog ohne inkrementelle Persistierung. ~30 Mio Blöcke Backlog wird IMMER vom Watchdog gekillt, niemals persistiert. Endlose Crash-Loop.
- F3.3 Kein Circuit-Breaker bei alle-RPCs-throttled. DoS-Self-Amplifikation 1:16 (1 inbound × 4 sub-providers × 4 retries). Klassen-Run-Szenario realistisch und ungeprüft.
- F3.4 `validateChainId` ist Default-No-Op (`EXPECTED_CHAIN_ID` nicht in Example) + Race mit `app.listen` + `process.exit(1)` während Requests laufen. Sepolia/Mainnet-Verwechslung wird nicht abgefangen.

🟡 Minor: 5

- F3.5 Stale-Block-Reads → Minter-Gas-Drain ($350/Jahr Schätzung) + UX-Bug + 30s-Window für Ex-Admin-Operationen.
- F3.6 Single-Provider-Fallthrough deaktiviert FallbackProvider-Schutz wenn nur 1 URL effektiv.
- F3.7 `getBlockTimestamps` sequenziell, ohne Retry, mit falschem Provider — verstärkt F3.2.
- F3.8 Free-Tier-Provider-Heuristik nur für Alchemy, ignoriert legacy `alchemyapi.io`, Infura, QuickNode.
- F3.9 RPC-URL-Format-Validation fehlt komplett. Tippfehler werden erst beim ersten Call sichtbar.

⚪ Nit: 2

- F3.10 CSP `connectSrc` listet 14 Provider, Frontend nutzt davon 0 direkt (alles über Backend).
- F3.11 `withRpcRetry`-Pattern-Match auf JSON-RPC-Error-Bodies fragil (matched „rate limit" aber nicht „usage limit", „quota exceeded", „compute units").

**Kern-Erkenntnisse Bereich 3:**

1. **Der RPC-Stack ist gut gewachsen, aber reaktiv.** Die Git-History zeigt: jeder Commit fixt ein konkretes Production-Symptom (`0a381a3` Batching aus, `3c05708` FallbackProvider, `4b39a97` Alchemy-Filter, `2c12f31` Sync-Watchdog). Das hat die akuten Schmerzen gelöst, aber die strukturellen Resilience-Layer fehlen: kein Circuit-Breaker, keine inkrementelle Sync-Persistierung, keine Cross-Provider-Konsistenz, kein fail-fast-Boot.

2. **Die kritischste Klasse ist die Cross-Provider-Inkonsistenz (F3.1) kombiniert mit der nicht-inkrementellen Sync-Persistierung (F3.2).** Zusammen führen sie zu einem System, das unter Production-Stress sowohl Daten verliert (Event-Lücken im Cache) als auch nie aufholen kann (Watchdog killed jeden Sync vor der Persistierung).

3. **Operator-UX im `.env.production.example` ist ein eigener Risikofaktor.** Default `CONTRACT_DEPLOY_BLOCK=0` triggert F3.2. Fehlendes `EXPECTED_CHAIN_ID` schaltet F3.4 ab. Fehlende Erklärung von `EVENT_RPC_URL` führt zu blindem Operator-Verhalten. Ein neuer Wartender hat keine Chance, das richtig zu machen.

4. **`probe.mjs` mit hard-coded Live-Minter-Key (untracked, im Workspace) ist ein 🔴-Kandidat für Bereich 2.** Sofort löschen, plus `pre-commit`-Hook, plus Key rotieren wenn die Datei jemals gestasht oder im Backup landete.

**Empfohlener Fix-Pfad:**

- **Sofort (Code-Edits):** F3.1 + F3.2 + F3.7 + F3.4 — alle vier in einem PR adressierbar, ein paar Stunden Arbeit, hohe Risiko-Reduktion.
- **Mittel-Term (Operator-UX + Resilience):** `.env.production.example` ergänzen, F3.6/F3.8/F3.9 Code-Edits, F3.3 Token-Bucket, F3.5 Idempotenz-Wrapper.
- **Architektur-Diskussion:** Alchemy Growth ($588/Jahr) vs. eigener Erigon-Node vs. Status quo + alle Code-Fixes — Operations-Decision.

**Cross-Cutting-Hinweise für nächste Bereiche:**

- **Bereich 2:** `probe.mjs`-Minter-Key-Leak ist sofortiger 🔴. Plus F3.4 Race-Condition kann Nonce-Store-Inkonsistenz triggern → Bereich 6.
- **Bereich 4:** F3.1 + F3.2 verstärken die Sorge um Cache-Korrektheit massiv. Plus: Backup-Recovery-Pfad ist durch F3.2 broken.
- **Bereich 6:** F3.5 + `markUsed BEFORE awardPoints` → Idempotenz-Frage.
- **Bereich 7:** F3.2 + F3.4 + F3.3 sind alle operative Footguns. Runbook + Monitoring-Anforderungen.

**Nächster Schritt:** Bereich 2 (Backend Key Management) — wegen `probe.mjs`-Finding aus Bereich 3 hochpriorisiert. Output `docs/audit/v2/02-bereich-2-key-management.md`.

---

### 2026-04-18 04:15 — Bereich 4 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/04-bereich-4-stateful-stores.md` — 14 V2-Findings + Empfehlungen + Cross-Cutting-Notes.

**Gelesen (zusätzlich zu Bereich 0/1/3):**

- `packages/backend/src/services/json-file-event-store.ts` (308 Zeilen, Re-Read mit Fokus auf Atomic-Write + Watchdog + Reorg)
- `packages/backend/src/services/admin-labels.ts` (119 Zeilen, komplett)
- `packages/backend/src/services/survey-keys.ts` (191 Zeilen, komplett)
- `packages/backend/src/services/nonce-store.ts` (133 Zeilen, komplett)
- `packages/backend/src/services/event-store.{interface,ts,types}.ts` (alle drei komplett)
- `packages/backend/src/services/survey-cache.ts` (57 Zeilen, komplett)
- `packages/backend/src/routes/claim.ts` (223 Zeilen, komplett — Konsumenten-Pfad für nonce-store + survey-keys)
- `packages/backend/src/routes/surveys.ts` (Z. 75-350 — `createKey`/`rotateKey`/`deleteKey`-Pfade)
- `.github/workflows/deploy.yml` (192 Zeilen, komplett — Deploy-Pfad)
- `scripts/build-deploy-ci.sh` (99 Zeilen, komplett — bestätigt: kein `data/` im Deploy-Folder)
- `docs/v2-migration-runbook.md` (Z. 160-260 — Operator-Workflow, Backup-Lücke bestätigt)
- `.gitignore` (Z. 47: `data/`)
- `packages/backend/data/` (Live-Snapshot der 4 Files: events.json 2.3KB, survey-keys.json 153B, used-nonces.json 108B — Devnet-Stand)
- `git log --oneline -100 | grep -iE "store|nonce|atomic|sync"` → 18 Treffer (Schmerz-Historie)

**Wichtiger Hinweis:**

`docs/audit/05-bereich-4-event-store.md` (V1) existiert NICHT — Bereich 4 ist Greenfield wie Bereich 3. Es gibt keine V1-Findings, die hier obsolet werden.

**Severity-Verteilung Bereich 4:**

🔴 Blocker: 3

- F4.1 `used-nonces.json` Multi-Worker-Race → Replay-Schutz lückenhaft. Ohne File-Lock können zwei Plesk-Worker parallel Nonces marken, Last-Writer-Wins macht einen Nonce verloren. Replay durch zweiten Wallet (Token-Leak-Szenario) wird wieder möglich, obwohl die HMAC-Architektur das eigentlich verhindern soll.
- F4.2 `survey-keys.createKey` Multi-Worker-Race → ausgegebene Keys werden ungültig. Doppel-Submit eines Admins erzeugt zwei zufällige Keys, einer wird von Last-Writer überschrieben. Plus: Worker B's `deleteKey`-Catch löscht den Key des Erfolgs-Workers. 100% Survey-Outage bis manuelle Rotation.
- F4.3 Backup-Strategie fehlt komplett. `survey-keys.json` Verlust = ~2-3 Tage Total-Outage. `used-nonces.json` Verlust = unwiderruflicher Replay-Schutz-Verlust. Kein Cron, kein Off-Site-Pull, kein Restore-Test im Repo.

🟠 Major: 4

- F4.4 `getBlockTimestamps` sequenziell + ohne Retry → Cold-Sync-Crash-Loop verstärkt (kombiniert mit Bereich 3 F3.2). Bei 2.000 unique Blöcken: 200s Sync-Zeit, 45s Watchdog kills jedes Run.
- F4.5 File-Permissions 0644 (Default-umask) für `survey-keys.json`. Auf Shared-Plesk world-readable für andere SSH-User, PHP-Apps, Plesk-Backup-Operator. Plus: möglicher Web-Pfad-Leak via fehlerhafter Plesk-Document-Root-Konfig (Live-Test überfällig). Kein expliziter `.htaccess`-Deny auf `data/`.
- F4.6 Reorg-Robustheit fehlt → Doppel-Punkte im UI nach Base-Reorg. Reines `push` ohne `(txHash, logIndex)`-Dedup. Auf Base selten, aber nicht null. Kombiniert mit RPC-Provider-Switching häufiger.
- F4.7 `lastSyncedBlock > latestBlock` Silent-Mask + falscher `lastSuccessfulSyncAt`. Operator-Diagnose lügt während Cache wegtreibt. Cache-seitiges Symptom von Bereich 3 F3.6 (Stale-Block).

🟡 Minor: 4

- F4.8 Kein `fsync` zwischen `writeFileSync(tmp)` und `renameSync` → Power-Loss / NFS-Risk (0-Byte-File nach Power-Cycle).
- F4.10 `nonce-store.save` Write-Amplification durch unnötiges `sort()` und Full-File-Rewrite pro Claim. ~9 MB Disk-I/O bei 30 parallelen Klassen-Claims.
- F4.11 Schema-Versioning ohne Migration-Pfad. Erste Schema-Bump in 6-12 Monaten erwartet, aktuell silent data loss möglich.
- F4.12 Kein Audit-Log auf Survey-Key-Reads. Forensik nach Vorfall unmöglich. Gestohlener Admin-Key bleibt monatelang unentdeckt.

⚪ Nit: 3

- F4.9 Kein Cleanup von `.tmp`-Restposten beim Boot.
- F4.13 In-Memory `cache` nie invalidiert nach externer File-Änderung.
- F4.14 `surveys.ts` erlaubt `delete` auf Key direkt nach `register` ohne Lock (Subset von F4.2).

**Kern-Erkenntnisse Bereich 4:**

1. **V2 hat den Single-Source-of-Truth verschoben, aber die operativen Garantien hinken hinterher.** Statt eines Smart Contracts mit On-Chain-Secrets sind es jetzt vier Disk-Files, davon zwei security-/operations-kritisch (`survey-keys.json`, `used-nonces.json`). Der Atomic-Write-Pattern (`writeFile + rename`) ist konsequent — aber Concurrency, Backup, Permissions, Audit-Logging fehlen komplett.

2. **Multi-Worker-Race ist die unterschätzte Schwachstelle.** Doc-Kommentar in `nonce-store.ts:110-114` rationalisiert das Race-Window mit „on-chain `AlreadyClaimed` schützt" — übersieht aber, dass `AlreadyClaimed` nur den **selben Wallet** schützt. Token-Leak + Race öffnet den Replay-Vektor, den die HMAC-Architektur eigentlich schließen sollte.

3. **Backup-Lücke ist die unterschätzte operationale Schwachstelle.** Der Verlust von `survey-keys.json` ist 2-3 Tage Total-Outage; `used-nonces.json` ist unwiderruflich. Im `v2-migration-runbook.md` wird Backup nicht erwähnt. Plesk-Cron-Backup ist 1 Tag Aufwand — dramatisches Risk-Reduction-Leverage.

4. **Cold-Sync-Crash-Loop (F4.4) ist die backend-seitige Hälfte von F3.2.** `getBlockTimestamps` sequenziell + 45s Watchdog + nicht-inkrementelle `lastSyncedBlock`-Persistierung = bei jedem Disk-Restore aus älterem Backup permanenter Crash-Loop. Beide Findings müssen zusammen gefixt werden.

5. **Konsistenz-Modell der 4 Stores ist heterogen.** `used-nonces.json` failed hard bei Parse-Error (gut, fail-closed). `survey-keys.json` silent reset mit Error-Log (akzeptabel). `events.json` silent reset (triggert F4.4). `admin-labels.json` silent reset (UX-only). Die Inkonsistenz ist gewollt korrekt designed, aber sollte explizit dokumentiert sein.

**Empfohlener Fix-Pfad:**

- **Sofort (1 Tag):** F4.5 `chmod 0600` + Live-Test ob `data/` web-erreichbar ist. F4.3 Backup-Cron + Off-Site-Pull. **Diese beiden sind die Risiko-Reduktion-Quick-Wins.**
- **Kurzfristig (1-2 Tage):** F4.1 + F4.2 File-Lock via `proper-lockfile`. F4.4 Batching + Retry für `getBlockTimestamps`.
- **Mittel-Term (1 Woche):** F4.6 Reorg-Dedup. F4.7 Logging-Fix. F4.12 Audit-Log auf Key-Reads. F4.10 `sort()` raus.
- **Architektur-Diskussion:** SQLite-Migration für alle 4 Stores (Variante C in F4.1) als Q3-Projekt — eliminiert F4.1, F4.2, F4.6, F4.10 in einem Aufwasch.

**Cross-Cutting-Hinweise für nächste Bereiche:**

- **Bereich 2:** F4.5 (chmod) gilt analog für alle weiteren Secret-Files. F4.12 (Audit-Logging) gehört auch zur Minter-Wallet-Nutzung. Generelles Plesk-Tenant-Threat-Modell fehlt.
- **Bereich 6:** F4.1 ist der **Replay-Tor-Opener** trotz HMAC-Token-Architektur. Bereich 6 muss explizit bestätigen, dass `markUsed` async-locked ist, sonst fällt die ganze HMAC-Sicherheit zusammen.
- **Bereich 7:** F4.3 (Backup) und F4.5 (Permissions) gehören in den Plesk-Setup-Runbook. `.htaccess`-Hardening ist Deployment-Konfiguration. Quartalsweise Restore-Drill als Operations-Pflicht.
- **Bereich 8:** Concurrent-Worker-Test (F4.1-Reproduktion) als CI-Test. Reorg-Test (F4.6) als Hardhat-Integration-Test. Cold-Sync-Test (F4.4 + F3.2) gegen Hardhat-Fork mit großem Block-Backlog.

**Nächster Schritt:** Bereich 2 (Backend Key Management & Minter-Wallet) — `probe.mjs`-Finding aus Bereich 3 + F4.5 chmod-Pattern aus Bereich 4 sind beide Bereich-2-Vorboten. Output `docs/audit/v2/02-bereich-2-key-management.md`.

---

### 2026-04-18 06:00 — Bereich 5 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/05-bereich-5-frontend-wallet.md` — 14 V2-Findings + Empfehlungen + Cross-Cutting-Notes.

**Gelesen (zusätzlich zu Bereich 0/1/3/4):**

- `packages/frontend/src/hooks/use-wallet.ts` (149 Zeilen, komplett — Wallet-Lifecycle, MetaMask-Integration, Sign-Wrapper)
- `packages/frontend/src/lib/wallet.ts` (208 Zeilen, komplett — Low-Level-Operations, downloadKeyFile, signMessageMetaMask)
- `packages/frontend/src/components/points/wallet-setup.tsx` (122 Zeilen, komplett)
- `packages/frontend/src/components/points/wallet-card.tsx` (245 Zeilen, komplett — Reveal/Download/Delete-UX)
- `packages/frontend/src/components/points/wallet-dialogs.tsx` (308 Zeilen, komplett — alle 4 Wallet-Dialogs)
- `packages/frontend/src/components/points/claim-history.tsx` (112 Zeilen, komplett)
- `packages/frontend/src/components/points/points-explorer.tsx` (137 Zeilen, komplett)
- `packages/frontend/src/components/admin/template-download-dialog.tsx` (121 Zeilen, komplett — HMAC-Texte verifiziert nicht mehr drin)
- `packages/frontend/src/components/admin/regenerate-template-dialog.tsx` (70 Zeilen, komplett — kein Raw-Key-Leak)
- `packages/frontend/src/components/admin/role-management.tsx` (331 Zeilen, komplett — Admin-Label-Rendering, console.error-Leak)
- `packages/frontend/src/components/admin/submission-management.tsx` (285 Zeilen, komplett)
- `packages/frontend/src/components/admin/admin-auth-gate.tsx` (103 Zeilen, komplett)
- `packages/frontend/src/components/admin/survey-table.tsx` (342 Zeilen, komplett — Survey-Title-Rendering)
- `packages/frontend/src/components/docs/article-renderer.tsx` (167 Zeilen, komplett — Section-Rendering, kein dangerouslySetInnerHTML)
- `packages/frontend/src/pages/claim.tsx` (256 Zeilen, komplett — URL-Param-Rendering, Tab-Reload-Verhalten)
- `packages/frontend/src/pages/points.tsx` (210 Zeilen, komplett — Wallet-Erstellungs-Flow)
- `packages/frontend/src/pages/admin.tsx` (285 Zeilen, komplett — Auth-Loop bei MetaMask-Rejection identifiziert)
- `packages/frontend/src/pages/impressum.tsx` (85 Zeilen, komplett — `c.href`-Rendering aus i18n)
- `packages/frontend/index.html` (120 Zeilen, komplett — kein meta-CSP-Fallback)
- `packages/frontend/src/main.tsx` (24 Zeilen, komplett — Lang-Init via JS, nicht inline)
- `packages/frontend/src/lib/i18n.ts` (53 Zeilen, komplett — `escapeValue: false`)
- `packages/frontend/src/lib/config.ts` (24 Zeilen, komplett)
- `packages/frontend/src/hooks/use-blockchain.ts` (102 Zeilen, komplett — Cached-Provider-Singleton)
- `packages/frontend/src/locales/de.json` (Header gescannt — kein HTML in Strings)
- `packages/frontend/src/types/ethereum.d.ts` (11 Zeilen, komplett)
- `packages/backend/src/server.ts` (155 Zeilen, Re-Read mit Fokus auf CSP-Direktiven)
- `scripts/build-deploy-ci.sh` (99 Zeilen, Re-Read mit Fokus auf Plesk-Layout + .htaccess)
- `git log --oneline -100 | grep -iE "csp|xss|metamask|wallet|sign|frontend|inline|cookie|localstorage|popup"` (25 Treffer — Schmerz-Historie)
- Repo-weiter Grep auf `dangerouslySetInnerHTML|innerHTML|outerHTML|document\.write|eval\(|Function\(` → **0 Treffer** in `packages/frontend/src/` ✅
- Repo-weiter Grep auf `target="_blank"` (7 Treffer) vs. `rel="noopener noreferrer"` (7 Treffer) → 7/7 korrekt ✅

**Wichtiger Hinweis:**

`docs/audit/06-bereich-5-frontend-wallet.md` (V1) existiert NICHT — Bereich 5 ist Greenfield wie Bereich 3 und 4. Es gibt keine V1-Findings, die hier obsolet werden.

**Severity-Verteilung Bereich 5:**

🔴 Blocker: 4

- F5.1 Klartext-Privatekey-Export ohne Keystore-V3-Verschlüsselung. Studi-Backups landen ungeschützt in iCloud/OneDrive/Mail-Postfächern. ~60 kompromittierbare Wallets über 2 Jahre projiziert.
- F5.2 Admin-Auth Infinite-MetaMask-Popup-Loop bei Rejection in `admin.tsx:100-104`. Effekt-Dependencies haben keinen `authFailed`-Guard, MetaMask-Reject re-triggert sofort. **Recently shipped via commit `e71e25b`**, nicht von Tests gefangen.
- F5.3 CSP greift potentiell nicht für Static-SPA-Auslieferung auf Plesk. Helmet-Middleware wird durch Apache-Static-Serve umgangen, `.htaccess` setzt keinen `Content-Security-Policy`-Header. Verifikation via `curl -I` mandatorisch und im Audit nicht möglich.
- F5.4 Safari iOS ITP purge-t Wallet nach 7 Tagen Inaktivität. ~600+ verlorene Wallets über 2 Jahre projiziert (~30 % iOS-Anteil × ~50 % Inaktivitäts-Wahrscheinlichkeit). Kein FAQ, kein Recovery-Hinweis im Claim-Flow, kein iOS-spezifischer Banner.

🟠 Major: 4

- F5.5 Fehlende `frame-ancestors`-CSP-Direktive → Clickjacking auf `/admin` und `/claim` möglich. `X-Frame-Options: DENY` (Helmet-Default) ist deprecated und unzuverlässig.
- F5.6 Fehlende `object-src 'none'` / `base-uri 'self'` / `form-action 'self'`-Direktiven. Defense-in-Depth-Lücken bei zukünftigem partiellem XSS.
- F5.7 localStorage-Permanenz im Standard-UI-Flow nicht kommuniziert. `dialogCheck`-Strings betonen Sicherheit, nicht Persistenz-Risiken. Kein Auto-Backup-Reminder nach Wallet-Erstellung.
- F5.8 `connect-src` listet 14 RPC-Provider (Alchemy, Infura, Ankr, etc.) — Frontend nutzt davon 0 direkt. 13 Exfil-Pfade Risiko für 0 Nutzen.

🟡 Minor: 4

- F5.9 i18next `escapeValue: false` ohne ESLint-`react/no-danger`-Schutz. Foot-Gun für zukünftige `dangerouslySetInnerHTML`-Stellen + Übersetzungs-PR-Verschmutzung.
- F5.10 Kein CSP `report-uri` / `report-to` — blind im Produktionsbetrieb, keine CSP-Violation-Detection.
- F5.11 `console.error` mit Backend-Errors leakt interne Pfade/Versionen in Browser-DevTools.
- F5.12 Keine `Permissions-Policy` / `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`-Header.

⚪ Nit: 2

- F5.13 `cachedProvider` Singleton hält Connections offen wenn Contract-Construction wirft.
- F5.14 `cachedContract` invalidiert nicht bei Adress-/RPC-URL-Wechsel zur Laufzeit (Foot-Gun für Multi-Chain-Erweiterung).

**Kern-Erkenntnisse Bereich 5:**

1. **Das Frontend ist konzeptionell sauber implementiert.** 0 `dangerouslySetInnerHTML`, 0 `innerHTML`, 0 `eval`/`Function`, alle User-Inputs via React-Children auto-escaped, alle externen Links mit `rel="noopener noreferrer"`. Survey-Titles und Admin-Labels werden sauber gerendert. Die offensichtlichen XSS-Vektoren sind geschlossen. **Aber das ist eine Momentaufnahme — die strukturellen Schutz-Layer (ESLint, CSP-Reporting, Strict CSP) fehlen alle, und der nächste Feature-PR kann das brechen.**

2. **Die kritische Schwäche ist die Wallet-Lifecycle-UX, nicht der Code.** F5.1 (Klartext-Download), F5.4 (iOS-ITP-Purge), und F5.7 (Permanenz-Kommunikation) sind alle Studi-Realität-Lücken. Über 2 Jahre × tausende Studis = hunderte verlorene Wallets + ~60 kompromittierbare Backup-Files. Die HMAC-Architektur und Smart-Contract-Sicherheit sind irrelevant, wenn das User-facing-Wallet-Modell nicht mit Realität skaliert.

3. **F5.3 (CSP-Plesk-Bypass) ist die unterschätzte Architektur-Schwäche.** Express+Helmet sieht „auf dem Papier" sauber aus, aber das Plesk-Deploy-Layout (Dokumentenstamm = `packages/backend/public/`) lässt Apache statisch ausliefern. Die `.htaccess` setzt keinen CSP-Header — wenn Apache bei Static-Files Passenger umgeht (Standard-Plesk-Verhalten), ist die gesamte CSP-Defense für die SPA-Auslieferung weg. Live-Verifikation via `curl -I https://vpstunden.hsbi.de/` ist mandatorisch und steht aus.

4. **F5.2 (Admin-Auth-Loop) ist ein recently-shipped Regressions-Bug.** Der Fix-Commit `e71e25b "fix(frontend): unblock admin dashboard and stop auto-login after logout"` löst `loggedOut`-Flag-Problem, übersieht aber den Rejection-Pfad. React-Effekt-Dependencies-Pattern ist fragil ohne `authFailed`-Guard. Symptom: Admin lehnt MetaMask-Sign-Anfrage ab → Loop von MetaMask-Popups bis Browser-Tab-Close. **Kein Test catched das.**

5. **Die CSP-Defense-Lücken (F5.5, F5.6, F5.10, F5.12) sind ein zusammenhängendes Cluster.** Helmet wird mit Minimal-Config gestartet, kritische moderne Direktiven (`frame-ancestors`, `object-src`, `base-uri`, `form-action`, `report-uri`, COOP/COEP, Permissions-Policy) fehlen alle. Ein einziger PR mit 10-15 Code-Zeilen schließt das gesamte Cluster.

**Empfohlener Fix-Pfad:**

- **Sofort (1 Tag, vor nächstem Klassen-Run):**
  - F5.2 Admin-Auth-Loop: 5-Zeilen-Fix mit `authFailed`-State.
  - F5.3 CSP via `.htaccess` setzen + Live-Test.
  - F5.5+F5.6 Frame-Ancestors / Object-Src / Base-Uri / Form-Action ergänzen.
- **Kurzfristig (1 Woche):**
  - F5.1 Keystore-V3-Download mit Passwort.
  - F5.4 iOS-Safari-Banner + FAQ + Claim-Flow-Import-Pfad.
  - F5.7 Re-Worded Persistenz-Warnungen + Auto-Backup-Reminder.
  - F5.8 `connect-src` reduzieren.
- **Mittel-Term (2 Wochen):**
  - F5.9-F5.12 ESLint-Regel + i18n-Hardening + CSP-Reporting + Permissions-Policy.
- **Architektur-Diskussion:**
  - WebAuthn/Passkey-basierte Wallet-Derivation als langfristige Lösung für F5.4.

**Cross-Cutting-Hinweise für nächste Bereiche:**

- **Bereich 2:** F5.3 (Plesk-Static-Serve-Bypass) ist das gleiche Plesk-Tenant-Threat-Modell wie F4.5 (chmod) und der `probe.mjs`-Hardcoded-Key-Leak. Alle drei gehören in einen einzigen Plesk-Hardening-PR plus Tenant-Threat-Modell-ADR. Permissions-Policy/COOP-Header gelten auch für Admin-Endpoints.
- **Bereich 6:** F5.2 (Admin-Auth-Loop) ist eine Sign-Flow-UX-Schwäche, die strukturell den Trust-Boundary zwischen Frontend-State und MetaMask-State falsch modelliert. Bereich 6 muss explizit testen, dass Sign-Rejection (`User denied`) keinen Auto-Retry-Loop triggert. Plus: F5.4 (iOS-ITP) bedeutet, dass „selbst-Sign mit lokalem Wallet" ein unsicherer Auth-Mechanismus für >7-Tage-Inaktivität ist.
- **Bereich 7:** F5.3 (CSP-Bypass), F5.10 (CSP-Reporting-Endpoint) und F5.12 (Permissions-Policy) gehören in den Plesk-Setup-Runbook. `.htaccess`-Hardening ist Deployment-Konfiguration. Live-Header-Test (`curl -I`) als Post-Deploy-Smoke-Test.
- **Bereich 8:** F5.2 (Admin-Auth-Loop-Test mit MetaMask-Mock), F5.9 (`react/no-danger` als Pre-Commit + CI), F5.10 (CSP-Header-Smoke-Test), F5.13 (Provider-Construction-Failure-Test).
- **Bereich 1:** F5.1 (Klartext-Privatekey-Download) hat Cross-Reference zu F1.1 (Minter hat ADMIN_ROLE) — wenn ein Studi-Wallet-Key kompromittiert wird und dieser zufällig auch Admin ist, eskaliert das von „1 Wallet weg" zu „Survey-Lifecycle-Vollkontrolle".

**Nächster Schritt:** Bereich 2 (Backend Key Management & Minter-Wallet) — sammelt jetzt **vier** Vorboten ein:

1. `probe.mjs`-Hardcoded-Live-Mainnet-Minter-Key (aus Bereich 3).
2. F4.5 chmod-Pattern auf `survey-keys.json` (aus Bereich 4).
3. F5.3 Plesk-Static-Serve-CSP-Bypass-Risiko (aus Bereich 5).
4. F5.12 Permissions-Policy / COOP für Admin-Endpoints (aus Bereich 5).

Plus: das generelle Plesk-Tenant-Threat-Modell, das in drei Bereichen (3, 4, 5) offen geblieben ist. Output `docs/audit/v2/02-bereich-2-key-management.md`.

---

### 2026-04-18 07:30 — Bereich 6 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/06-bereich-6-auth-replay.md` — 12 Findings (3 🔴 / 4 🟠 / 3 🟡 / 2 ⚪) auf Auth-Middleware, HMAC-Claim-Pfad und Frontend-Sign-Flows. Plus dreistufiger Fix-Pfad (Sofort-/Pre-Production-/Operative-Reife) und Cross-Cutting-Notes für Bereiche 2, 3, 4, 5, 7, 8.

**Gelesen:**

- Backend (komplett): `middleware/auth.ts` (101 Z., komplett), `middleware/rateLimit.ts` (51 Z.), `middleware/requestLogger.ts` (11 Z.), `middleware/errorHandler.ts`, `services/hmac.ts` (129 Z.), `services/nonce-store.ts` (132 Z.), `services/survey-keys.ts` (190 Z.), `services/blockchain.ts` (Re-Read auf `isAdmin`, Z. 386-388), `routes/admin.ts` (191 Z.), `routes/claim.ts` (222 Z.), `routes/surveys.ts` (349 Z.), `routes/wallets.ts` (95 Z.), `routes/status.ts` (58 Z.), `routes/index.ts` (20 Z.), `server.ts` (155 Z.), `config.ts` (81 Z.).
- Frontend (komplett): `hooks/use-wallet.ts` (149 Z.), `hooks/use-api.ts` (352 Z.), `pages/admin.tsx` (Z. 80-358), `pages/claim.tsx` (Z. 40-103), `components/admin/role-management.tsx` (Z. 50-122), `components/admin/system-status.tsx` (60 Z.), `components/admin/submission-management.tsx`.
- Repo-weiter Grep auf alle `signMessage`-Aufrufe im Frontend → 11 Stellen identifiziert (`admin.tsx`: 6, `role-management.tsx`: 4, `submission-management.tsx`: 1, `claim.tsx`: 1).
- `git log --oneline -100 | grep -iE "auth|sign|replay|nonce|message|hmac|admin"` → 20 relevante Commits, vor allem Timestamp-Validation-Fixes.
- Verifikation: `docs/audit/08-bereich-7-auth.md` existiert NICHT — Bereich 6 ist **Greenfield** wie 3, 4, 5.

**Severity-Verteilung Bereich 6:**

🔴 Blocker: 3

- F6.1 Server-Side-Nonce fehlt komplett — `auth.ts:11-96` validiert nur (Sig, Timestamp ≤ 5 min, isAdmin). Eine geleakte Sig ist 5 Minuten lang ein Bearer-Token, beliebig oft an beliebigen Admin-Endpoints replay-bar.
- F6.2 Cross-Operation-Replay — `auth.ts:45-46` parsed aus der Message NUR den Timestamp. Frontend-Operation-Wort (`Admin login`, `Add admin`, `Remove admin`) wird verworfen. Eine `Admin login`-Sig autorisiert `POST /admin/add` mit angreifer-kontrolliertem Body.
- F6.3 Claim-Sig bindet weder Nonce noch surveyId noch Operation — `claim.ts:84-131` cross-checked nur `recoveredAddress === walletAddress`. Eine in einer ANDEREN DApp geleakte Studi-Sig (Phishing, NFT-Drop-Demo) plus Schulter-Surf auf den Claim-Link = front-runnable-er Claim-Klau.

🟠 Major: 4

- F6.4 `pino-http` ohne `redact` → `x-admin-signature` und `x-admin-message`-Headers werden unredacted in Plesk-Logs geschrieben. Plus 5-Min-Replay-Fenster = jede 5 Minuten frisch-replayfähige Sigs in den Logs. Symmetrisch zu Bereich 4 F4.5 (chmod-Pattern).
- F6.5 `isAdmin()`-Hot-Path on-chain pro Request, kein Cache, kein Stale-Fallback. RPC-Outage = Admin-Total-Lockout (500 INTERNAL_ERROR). 100 RPC-Calls/Auth-Heavy-Session = unnötiger Compute-Unit-Druck auf Free-Tier.
- F6.6 Rate-Limit-Defaults trügerisch (Doku sagt 5/min, Code sagt 100/min — `rateLimit.ts:21` vs `config.ts:46-49`). IP-basiert problematisch auf NAT'd HSBI-WLAN. Kein dedizierter `adminAuthFailureLimiter`.
- F6.7 Admin-Sig im React-State 5 Min lang im Component-Tree exfiltrierbar (React-DevTools, Browser-Extension, Pair-Programming). Als Prop an `<SystemStatus>` durchgereicht. Sig wird wie ein State-Detail behandelt, ist aber ein Bearer-Token.

🟡 Minor: 3

- F6.8 `markUsed` BEFORE `awardPoints` in `claim.ts:193-207` — sicherheitskorrekt fail-closed, aber Worker-Crash zwischen den Stufen verbrennt Nonce ohne Recovery-Endpoint. Schätzung: 1-3 Vorfälle/Jahr.
- F6.9 Doku-zu-Code-Diskrepanz beim Claim-Message-Format — `claim.ts:16-18`-JSDoc sagt `claim:<surveyId>:<nonce>:<unixSeconds>`, `claim.tsx:60` sendet `Claim:${surveyId}:${wallet.address}:${timestamp}`. Backend akzeptiert beides. Externe Integratoren laufen gegen die falsche Spec.
- F6.10 HMAC-Key-Rotation hard cutoff in `survey-keys.ts:159-169` ohne Pre-Flight-Warning. Worst-Case: 30 Studis im Hörsaal mit offener SoSci-Survey, Admin rotiert Key → 30 broken Claims.

⚪ Nit: 2

- F6.11 `maxMessageAgeMs` default 300 000 ms (5 min) zu lang. Best-Practice ohne Server-Side-Nonce: 60-120 s.
- F6.12 Kein Auth-Audit-Log — keine Spur, wer wann was signiert hat. Forensik unmöglich, Onboarding/Offboarding-Tracking fehlt, Compliance-Lücke.

**Hypothesen-Bewertung:**

- ✅ H6.2 (HMAC `crypto.timingSafeEqual` in `hmac.ts:77`) — sauber implementiert, kein Finding.
- 🔴 H6.1, H6.3 — bestätigt.
- 🔴 H6.4 (Frontend↔Backend-Format-Konsistenz) — bestätigt, weil Backend permissiv ignoriert.
- 🟠 H6.5, H6.6, H6.7 — bestätigt.
- 🟡 H6.8, H6.9 — bestätigt mit UX-Kontext.

**Kern-Erkenntnisse Bereich 6:**

1. **Das Auth-Modell ist strukturell defekt.** F6.1 + F6.2 + F6.3 zusammen bilden ein dreistufiges Replay-Loch: keine Nonce, keine Operation-Bindung, keine Body-Bindung. Die Frontend-Sign-Disziplin (per-Operation unterschiedliche Messages) ist eine reine Theateraufführung — das Backend liest sie nicht. Dies ist KEIN „Implementierungs-Bug, der einen Patch braucht", sondern ein fehlender Architektur-Block (Server-Side-Challenge-Response). Der Fix muss als ADR-0005 dokumentiert werden.

2. **Die HMAC-Schicht selbst ist sauber.** `hmac.ts` nutzt `crypto.timingSafeEqual` korrekt (`hmac.ts:77`), `nonce-store.ts` ist atomar fail-closed, Token-Format ist sauber binär. Die Sig-Schicht darüber ist die Schwäche, nicht der HMAC.

3. **F6.4 + Bereich 4 F4.5 + Bereich 2 (Plesk-Klartext-Key) bilden ein Plesk-Tenant-Threat-Cluster.** Wer Read-Zugriff auf das Plesk-Filesystem hat, sieht sowohl `data/survey-keys.json` (HMAC-Keys), `.env` (Minter-Key), als auch `/var/log/passenger/*/access.log` (Live-Sigs). Drei Vektoren, gleiche Wurzel. Bereich 7 muss das einmal als Plesk-Hardening-Runbook lösen.

4. **F6.5 ist Brücke zu Bereich 3.** Cache + Stale-Fallback brauchen denselben `withRpcRetry`-Pfad, plus 503-statt-500-Verhalten bei RPC-Outage. Ergibt sich harmonisch mit Bereich-3-Findings.

5. **F6.7 ist Brücke zu Bereich 5.** Sig im React-State + `i18next.escapeValue:false` (F5.9) = ein einziger zukünftiger XSS-Bug exfiltriert die Sig direkt. Beide Findings teilen denselben Root-Cause: Frontend behandelt sicherheitsrelevante Werte wie UI-State.

6. **Empfohlener Sofort-Fix vor jedem Klassen-Run:** F6.4 (pino-Redact, 30 min), F6.11 (5min→60s, 5 min), F6.6 (Rate-Limit-Defaults korrigieren, 15 min). Senkt das Risiko-Niveau messbar ohne Architektur-Änderung.

7. **Strukturelle Pflicht vor Production:** F6.1+F6.2+F6.3 als Block lösen — Server-Side-Nonce + canonical-Message + Operation-Binding + Body-Hash. Aufwand 4-5 Personentage. Output: ADR-0005 Auth-Modell-V2.

**Cross-Cutting-Hinweise für nächste Bereiche:**

- **Bereich 2 (Backend Key Management):** F6.4-Sig-Leak auf Plesk-Logs ist Eskalations-Surface. Audit-Log (F6.12) muss auch Minter-Key-Rotation erfassen.
- **Bereich 3 (RPC):** F6.5-Cache muss konsistent mit `FallbackProvider`-Verhalten und `withRpcRetry`-Semantik aus Bereich 3 sein. `isAdmin`-Hot-Path verstärkt Compute-Unit-Druck.
- **Bereich 4 (Stateful Stores):** F6.4-Plesk-Tenant-Read auf Logs symmetrisch zu F4.5 (chmod). F6.12-Audit-Log braucht Backup-Integration aus Bereich-4-Backup-Plan. F6.8-Recovery-Endpoint berührt `nonce-store.ts`, gemeinsam mit Concurrency-Fix testen.
- **Bereich 5 (Frontend):** F6.7-React-State-Sig + F5.9 i18next = direkter XSS-Beute-Pfad, falls jemals ein XSS gefunden wird. F6.7-Fix mit Per-Operation-Sigs eliminiert gleichzeitig F5.2-Admin-Auth-Loop (kein Auto-Auth-useEffect mehr).
- **Bereich 7 (Deployment):** F6.4 + F6.12 brauchen Plesk-Log-Path-Konfiguration. F6.10-Pre-Flight-Check ins Operator-Runbook.
- **Bereich 8 (Tests & CI):** Auth-Test-Suite muss Cross-Operation-Replay-Test, Server-Side-Nonce-Single-Use-Test, Body-Hash-Tampering-Test, RPC-Outage-mit-Cache-Test enthalten.

**Nächster Schritt:** Bereich 2 (Backend Key Management & Minter-Wallet) — sammelt jetzt **fünf** Vorboten ein:

1. `probe.mjs`-Hardcoded-Live-Mainnet-Minter-Key (aus Bereich 3).
2. F4.5 chmod-Pattern auf `survey-keys.json` (aus Bereich 4).
3. F5.3 Plesk-Static-Serve-CSP-Bypass-Risiko (aus Bereich 5).
4. F5.12 Permissions-Policy / COOP für Admin-Endpoints (aus Bereich 5).
5. F6.4 Plesk-Log-Sig-Leak + F6.12 Audit-Log-Anforderung (aus Bereich 6).

Plus: das Plesk-Tenant-Threat-Modell ist jetzt aus VIER Bereichen (3, 4, 5, 6) bestätigt — Bereich 2 muss es als zentrales Threat-Asset etablieren. Output `docs/audit/v2/02-bereich-2-key-management.md`.

---

### 2026-04-18 09:00 — Bereich 2 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/02-bereich-2-key-management.md` — 10 V2-Findings + 2 Documented Owner Decisions.

**Gelesen (zusätzlich zu Bereichen 0/1/3-6):**

- `packages/backend/src/services/blockchain.ts` (567 Zeilen, KOMPLETT)
- `packages/backend/src/config.ts` (81 Zeilen, KOMPLETT)
- `packages/backend/src/lib/rpcRetry.ts` (96 Zeilen, KOMPLETT)
- `packages/backend/src/lib/logger.ts` (9 Zeilen, KOMPLETT)
- `packages/backend/src/middleware/errorHandler.ts` (242 Zeilen, KOMPLETT)
- `packages/backend/src/routes/admin.ts` (191 Zeilen, KOMPLETT)
- `packages/contracts/scripts/deploy-v2.ts` (586 Zeilen, KOMPLETT — Header-Kommentare zu Minter=ADMIN-Trade-off)
- `.env.production.example` (26 Zeilen, KOMPLETT)
- `docs/deployment.md` (266 Zeilen, KOMPLETT)
- `docs/security.md` (122 Zeilen, KOMPLETT — fünf Inkonsistenzen identifiziert)
- `docs/v2-migration-runbook.md` (Recovery-Suche: 0 Treffer)
- `packages/backend/probe.mjs` (47 Zeilen — LIVE-Mainnet-Minter-Key gefunden)

**Git-History-Verifikation:**

- `git log --all --source --oneline -S "<minter-key-hex>"` → 0 Treffer auf allen Branches. probe.mjs war NIE committed. Aber: lokal seit Wochen vorhanden, Bombe wartend.

**Severity-Verteilung Bereich 2:**

🔴 Blocker: 2

- F2.1 — `packages/backend/probe.mjs:7` enthält Live-Mainnet-Minter-Key im Klartext. Untracked, aber Leak-Pfade (`git add .`, rsync, Backup-Sync, Editor-Cloud-Sync) aufgezeigt. Sofortiger Fix: `rm`. Optional: Key rotieren.
- F2.2 — Kein Recovery-Plan für Minter-Compromise. `docs/v2-migration-runbook.md` enthält 0 Treffer auf `compromise|recover|emergency`. `docs/security.md:60-66` ist eine Drei-Zeilen-Lüge ("revoke MINTER_ROLE" — reicht nicht, weil Minter auch ADMIN_ROLE hat). Korrekte 6-Schritt-Sequenz dokumentiert.

🟠 Major: 4

- F2.3 — Kein `maxFeePerGas`-Hard-Cap; Base-Spike kann Wallet in 1-2 Tx leeren. `TX_OVERRIDES`-Pattern als Fix.
- F2.4 — `MIN_BALANCE_WEI = 50_000n * 1_000_000n` = 16 000× zu niedrig. Plus: kein automatisches Alerting. Plesk-Cron + BaseScan-Watchlist als Fix.
- F2.5 — `lib/logger.ts` ohne `redact`. Cluster mit Bereich 6 F6.4. Bei Boot-Crash mit ungültigem Key (siehe F2.7) → Klartext-Key im Plesk-Log.
- F2.6 — `docs/security.md` an mindestens 5 Stellen falsch (Minter-Rolle, Compromise-Impact, UPGRADER_ROLE-Existenz, Rate-Limit-Default, Plesk-Snapshot-Behauptung). Voraussetzung für die Akzeptanz der Owner-Decisions.

🟡 Minor: 3

- F2.7 — `MINTER_PRIVATE_KEY` ohne Format-Validierung. Tippfehler crasht Boot mit Klartext-Key im Stack. `validatePrivateKey`-Helper als Fix.
- F2.8 — `NonceManager` in-memory + kein Mapping für `NONCE_EXPIRED`/`REPLACEMENT_UNDERPRICED`. `parseProviderError` erweitern + `managedSigner.reset()` bei Fehler.
- F2.9 — ETH-Refill-Prozess undokumentiert. `docs/runbooks/eth-refill-procedure.md` als Fix.

⚪ Nit: 1

- F2.10 — `.env.production.example` + `deployment.md` listen `.env`-Datei und Plesk-Panel als gleichwertige Optionen. Doku auf "nur Plesk-Panel" konsolidieren (Owner-Decision OD-2.B).

**Documented Owner Decisions (kein Finding, aber Doku-Pflicht):**

- OD-2.A — Minter hält ADMIN_ROLE zusätzlich zu MINTER_ROLE. Akzeptiert. Voraussetzung: F2.2 (Recovery-Runbook) und F2.6 (security.md korrigieren) müssen umgesetzt werden, sonst ist die Akzeptanz operativ nicht durchführbar und nicht informiert-zustimmbar für Stakeholder.
- OD-2.B — Klartext-`MINTER_PRIVATE_KEY` in der Plesk-Node.js-Panel-ENV-Konfiguration. Akzeptiert (HSBI-Hosting-Realität, KMS/Vault nicht greifbar). Voraussetzung: F2.1 (`probe.mjs` löschen), F2.5 (Logger-Redact), F2.7 (Boot-Validierung), F2.10 (Doku-Konsolidierung) müssen umgesetzt werden — die Plesk-Akzeptanz schützt nicht vor zusätzlichen Klartext-Wohnorten **außerhalb** von Plesk und nicht vor Tippfehler-induzierten Klartext-Leaks im Log.

**Severity-Tally global aktualisiert:** 🔴 13 / 🟠 24 / 🟡 23 / ⚪ 12.

**3 wichtigste Erkenntnisse:**

1. **Owner-Decisions sind durchführbar — aber teurer als sie aussehen.** Beide akzeptierten Trade-offs (Minter=Admin, Plesk-Klartext-ENV) sind operativ tragfähig **nur** wenn der Recovery-Plan steht, die Doku stimmt, und die Logger keine Klartext-Keys leaken. Zur Zeit erfüllt der Code keine dieser drei Voraussetzungen. Die "Akzeptanz" eines Risikos ist nicht "ignorieren" — sie ist "explizit dokumentiert und durch passive Mitigations abgesichert".

2. **`probe.mjs` ist die ungewollte Dritte Owner-Decision.** Plesk-Klartext-ENV ist akzeptiert, weil sie die einzige praktikable Lösung in der HSBI-Realität ist. `probe.mjs` ist Klartext-Key in einer **lokalen** Datei, die genau diese Realität nicht braucht. Es ist eine Bombe, die in den nächsten 2 Jahren über mindestens 5 verschiedene Pfade hochgehen kann (Git-Add, Backup-Sync, Bildschirm-Share, Editor-Cloud, rsync). Sofort entschärfen kostet 5 Sekunden.

3. **Operative Reflexe sind das billigste Risiko-Investment.** F2.3 (Gas-Cap, 1 h), F2.4 (Balance-Monitor + Plesk-Cron, 2 h), F2.5 (Logger-Redact, 15 min), F2.7 (Format-Validierung, 30 min), F2.8 (Error-Mapping, 1 h) — zusammen ~5 h, aber sie eliminieren die häufigsten Klassen-Run-Failure-Modes und machen die Logs forensik-fähig. Plus F2.2 (Recovery-Runbook, 1-2 PT) und F2.6 (security.md, 2-3 h) als Pflicht für die Owner-Decision-Akzeptanz.

**Cross-Cutting-Hinweise für Bereiche 7+8:**

- **Bereich 7 (Deployment, Hosting):** F2.2-Recovery-Runbook, F2.6-security.md, F2.9-Refill-Plan, F2.10-Doku-Konsolidierung gehören in einen "Operator Runbook"-Index. F2.4-Plesk-Cron für E-Mail-Alarm braucht Plesk-spezifische Konfiguration. OD-2.B-Akzeptanz hängt davon ab, dass HSBI-Plesk-Tenant-Modell stabil bleibt — Bereich 7 sollte das im Operational-Readiness-Check explizit prüfen.
- **Bereich 8 (Tests & CI):** F2.7-Validierung, F2.5-Redact, F2.3-Gas-Cap, F2.8-Error-Mapping brauchen je einen Test. Plus: ein CI-Step der `git grep` nach 64-hex-Pattern in untrackeden Dateien wirft (verhindert künftige `probe.mjs`-Wiederholung).

**Nächster Schritt:** Bereich 7 (Deployment, Hosting & Operational Readiness) — sammelt jetzt sechs Vorboten ein:

1. F2.2 Recovery-Runbook + `SurveyPointsV2RecoveryStub.sol`
2. F2.4 Plesk-Cron + BaseScan-Watchlist
3. F2.6 security.md komplett refactoren
4. F2.9 ETH-Refill-Runbook
5. F2.10 `.env`-Datei-Option streichen
6. Plus: Cluster aus Bereichen 4/5/6 zum Plesk-Hardening-Runbook (chmod, CSP, Log-Redact, Tenant-Read-Modell)

Output `docs/audit/v2/07-bereich-7-deployment.md`.

---

### 2026-04-18 11:00 — Bereich 7 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/07-bereich-7-deployment-ops.md` — 12 Findings + dedizierte Section "Empfohlenes Monitoring-Setup" (UptimeRobot/Healthchecks.io/GHA-Cron/Plesk-Cron).
- `docs/runbooks/README.md` — Index + Konstanten-Tabelle + Eskalations-Tree + halbjährliche Reviews.
- `docs/runbooks/incident-response.md` — 10-Schritt-Solo-Sunday-Checkliste mit Symptom-Matrix, Health-Diag-Lesehilfe, Log-Pattern-Tabelle.
- `docs/runbooks/eth-refill.md` — Coinbase-Pfad + L1-Bridge-Backup + Notfall-Modus + Backup-Wallet-Konzept.
- `docs/runbooks/key-rotation.md` — vollständige 10-Schritt-Sequenz für Minter-Compromise (Schaden-Limit → neue Wallet → Rollen-Tx → Rekonfig → Revoke), `cast`- und BaseScan-Pfade parallel, Forensik-Checkliste.
- `docs/runbooks/disaster-recovery.md` — Backup-Restore aus GitHub-Releases + Plesk-Tenant-Re-Setup + Cold-Sync + Restore-Test-Pflicht + "Wir-haben-keinen-Backup"-Notfallplan.
- `docs/runbooks/deploy-rollback.md` — `last-known-good`-Tag-Pfad + Methode-A/B/C, Forensik-Tabelle für häufige Deploy-Failure-Ursachen.
- `docs/runbooks/sosci-onboarding.md` — Lehrende:r-Wallet-Setup + Admin-Erteilung + Survey-Anlage + PHP-Snippet-Roll-Out + Test-Run + Lifecycle (Wallet-Verlust, Ausscheiden).

**Gelesen (zusätzlich zu Bereichen 0-6):**

- `.github/workflows/deploy.yml` (192 Zeilen, ZEILE FÜR ZEILE)
- `.github/workflows/ci.yml` (197 Zeilen, komplett)
- `scripts/build-deploy-ci.sh` (99 Zeilen)
- `packages/backend/src/routes/health.ts` (168 Zeilen, alle 3 Endpoints)
- `docs/deployment.md` (266 Zeilen)
- `docs/architecture.md` (305 Zeilen)
- `docs/v2-migration-runbook.md` (258 Zeilen)
- `docs/security.md` (122 Zeilen — bereits in Bereich 2 als 8-fach-Lüge markiert)
- `docs/sosci-integration.md` (152 Zeilen)
- `docs/adr/README.md` + `0001`-`0004`
- `README.md` (215 Zeilen)
- `.nvmrc` (1 Zeile, `20`)
- `docs/runbooks/` Verzeichnis-Existenz-Check (= **leeres Verzeichnis bestätigt**, Greenfield-Audit)
- `docs/audit/07-bereich-6-deployment-ops.md` Existenz-Check (= **fehlt**, Greenfield-Audit)

**Severity-Verteilung Bereich 7:**

🔴 Blocker: 2 (F7.1 Kein externes Monitoring; F7.2 `docs/runbooks/`-Verzeichnis existiert nicht — beide adressiert in dieser Iteration durch Monitoring-Setup-Section + 6 Runbook-Files)

🟠 Major: 4 (F7.3 Kein `data/`-Backup → GHA-Backup-Workflow geliefert; F7.4 Kein Post-Deploy-Health-Check + Auto-Rollback → konkretes YAML-Snippet; F7.5 TLS-Pinning silent fallback → hard-fail-by-default Patch; F7.6 `app.js`-`dotenv`-Konflikt mit OD-2.B → defensive `app.js`-Refuse-Pattern)

🟡 Minor: 4 (F7.7 Bus-Factor + Owner-Identitäten-Doku; F7.8 `cancel-in-progress: true` = halb-deployed; F7.9 `.deploy-meta`-Skip-Optimization silent FTP-Read-Fail; F7.10 Plesk-Log-Pfad nirgendwo dokumentiert)

⚪ Nit: 2 (F7.11 `docs/deployment.md` veraltet (Docker/pm2/build-deploy.sh nicht mehr im Repo); F7.12 `workflow_dispatch` ohne Approval-Gate)

Kumulierte Tally nach Bereich 7: **15 / 28 / 27 / 14 = 84 Findings + 2 Owner Decisions**.

**Top-3 Operations-Schmerz vor Bereich 7:**

1. **Kein Monitoring + Kein Solo-Sunday-Runbook.** Die einzige Ausfall-Detektion war Studi-E-Mail an Lehrenden. Service konnte 12 h tot sein, ohne dass jemand es bemerkt. Hirschfeld am Sonntag 23 Uhr fand im Repo keine ausführbare Anleitung.
2. **`data/*.json`-Backup-Konzept war eine im Audit dokumentierte Lüge.** `security.md` behauptete "Plesk filesystem snapshots" — tatsächlich kein Backup-Skript, kein GHA-Workflow, keine Plesk-Snapshot-Konfig im Repo. Plesk-Server-Tod = `survey-keys.json` permanent verloren = alle aktiven Surveys tot.
3. **Bus-Factor = 1 (Joris) und das Repo wusste es nicht.** Plesk-URL/-Login, Coinbase-Konto-Owner, DEFAULT_ADMIN-Wallet-Identität, BaseScan-API-Key-Lokation: nichts dokumentiert. 3 Wochen Joris-Abwesenheit = Hirschfeld-Lähmung.

**Erkenntnisse aus Bereich 7:**

1. **Code ist solide, Operations existiert nicht.** Das war der konsistente Befund über alle Bereiche, aber besonders deutlich in Bereich 7. Die Engineering-Investitionen (TLS-Pinning, Skip-`node_modules`-Optimization, atomic-Stores, FallbackProvider, HMAC-Migration) zeigen ein Repo mit Senior-Engineering-Aufmerksamkeit. Daneben: null Monitoring, null Runbooks, kein Backup. Das Bias ist nachvollziehbar (Code-bauen ist sichtbar, Operations-Setup ist unsichtbar bis es brennt), aber für ein 2-Jahre-Hochschul-Deployment ist es das **größte** Risiko.

2. **Die Runbooks sind zu 80 % bereits implizit im Repo verteilt — aber falsch sortiert.** `v2-migration-runbook.md` enthält ETH-Refill-Schritte, `deployment.md` enthält Health-URL, `security.md` enthält Compromise-Implikationen, `architecture.md` enthält Rollen-Modell. Was fehlt, ist die **Bündelung** in operativ-ausführbare Files, die ein Nicht-Senior-Engineer **ohne** Cross-File-Lese-Pflicht abarbeiten kann. Diese Iteration leistet das.

3. **Phusion Passenger ist eine Operations-Black-Box, die der Owner explizit machen muss.** F7.10 (Log-Pfad), F2.5/F6.4 (Logger-Redact mit Plesk-Default-`logrotate`-Inkompatibilität), F4.2 (Multi-Worker-Lock), F4.5 (File-Permissions): jedes davon hängt an Plesk-spezifischen Konventionen, die der Owner einmal **am System verifizieren und im Repo dokumentieren** muss. Ohne diese Owner-Recherche-Session bleibt der Operations-Pfad spekulativ. **Empfehlung an Owner:** 1×60-min-Session am Plesk-Tenant: Log-Pfad finden, `logrotate`-Config lesen, File-Permissions auf `data/*.json` setzen, Passenger-Worker-Anzahl ermitteln, `operators-private.md` befüllen. Output dieser Session schließt 4 von 12 Bereich-7-Findings.

4. **Cluster-Effekt mit Bereichen 2/4/5/6 ist groß.** 6 Findings aus Vor-Bereichen werden in Bereich 7 operativ ausgeführt (Recovery-Runbook für Minter-Compromise, Plesk-Cron für Balance-Watch, security.md-Refactor, GHA-Backup-Workflow, chmod-Verifikations-Step im Incident-Runbook, Pre-Flight-Health-Check). Die Synthese in Bereich 9 sollte das nicht doppelt zählen, aber als **Implementierungs-Reihenfolge** behandeln: Bereich 7 ist der Operations-Sammelpunkt für die Code-Findings aus 2/4/5/6.

5. **`workflow_dispatch` `force_full`-Trigger** und `concurrency: cancel-in-progress: true` sind beides Footguns, die in einem 2-Personen-Team niedrige Wahrscheinlichkeit haben — aber sie werden gefährlich, sobald Maintainer-Wechsel anstehen. F7.12 + F7.8 sind günstige Polishing-Maßnahmen für die "wir-übergeben-an-Hirschfeld"-Phase.

**Cross-Cutting-Empfehlungen für Bereich 8 (Tests & CI):**

- Post-Deploy-Health-Check muss einen End-to-End-Test haben (kaputte `dist/server.js` deployen → Pipeline detektiert).
- Backup-Workflow braucht monatlichen Restore-Test als CI-Job.
- `app.js`-Defensive-Refuse braucht Test (legacy `.env` → Backend wirft mit klarer Message).
- CI-Schritt: `grep` für 64-hex Klartext-Keys in nicht-gitignored Files (Cluster mit F2.1-Vermeidung).

**Empfehlung an Owner für Phase 1 (vor nächstem Klassen-Run, ~1 h Aufwand):**

1. UptimeRobot-Account anlegen, 5 Monitore konfigurieren (Schritte siehe `07-bereich-7-deployment-ops.md` Section "Empfohlenes Monitoring-Setup", Variante A).
2. `docs/runbooks/README.md` Konstanten-Tabelle befüllen (30 min Plesk-Verifikations-Session).
3. Plesk-Cron für Balance-Watch einrichten (15 min, sobald F2.4-Backend-Logging deployed).

Das schließt 80 % der operativen Lücken. Die restlichen Phasen 2-4 brauchen 1-2 Personentage und können staged ausgerollt werden.

**Nächster Schritt:** Bereich 8 (Tests & CI). Output `docs/audit/v2/08-bereich-8-tests-ci.md`.

---

### 2026-04-18 12:30 — Bereich 8 abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/08-bereich-8-tests-ci.md` — 12 Findings + Cross-Reference-Tabelle (84 Findings ↔ Test-Lücken) + 36-Item-Test-Backlog in 5 priorisierten Sprints + realistische HSBI-Coverage-Schwellen.

**Gelesen (zusätzlich zu Bereichen 0–7):**

- `.github/workflows/ci.yml` (197 Zeilen, line-by-line, zweite Re-Lese-Runde)
- `packages/backend/vitest.config.ts` (10 Zeilen)
- `packages/backend/vitest.config.integration.ts` (11 Zeilen)
- `packages/frontend/vitest.config.ts` (39 Zeilen — einzige Coverage-Schwellen im Repo)
- `.lighthouserc.json` (20 Zeilen)
- `commitlint.config.ts` (1 Zeile, `extends conventional`)
- `.husky/pre-commit` + `.husky/commit-msg`
- `package.json` lint-staged-Block
- Alle 27 Test-Files (5.158 Zeilen):
  - Contracts: `SurveyPointsV2.test.ts` (407, 38 it-Blöcke), `SurveyPoints.test.ts` (V1, 563, ~50 it-Blöcke)
  - Backend: `admin.test.ts`, `claim.test.ts`, `surveys.test.ts`, `error-handler.test.ts`, `health.test.ts`, `hmac.test.ts`, `nonce-store.test.ts`, `points.test.ts`, `rate-limit.test.ts`, `status.test.ts`, `survey-keys.test.ts`, `template.test.ts`, `wallets.test.ts`, `setup.ts` (Mock-Factory)
  - Backend Integration: `hardhat.test.ts` (200, 8 it-Blöcke), `setup.ts` (cleanup-Logik)
  - Frontend: `claim.test.tsx`, `routing.test.tsx`, `home.test.tsx`, `wallet.test.ts`, `use-wallet.test.ts`, `use-blockchain.test.ts`, `use-api.test.ts`, `config.test.ts`, `setup.ts`
- `codecov.yml` Existenz-Check (= **fehlt im Repo**, keine Per-Component-Schwellen)
- Source-Greps: `queryFilterChunked`, `getEffectiveRpcUrls`, `isAlchemyFreeUrl`, `withRpcRetry` (alle nirgendwo direkt getestet, nur als `vi.fn()` in `setup.ts:50`)

**Severity-Verteilung Bereich 8:**

🔴 Blocker: 3

- F8.1 Coverage-Schwellen-Theatre (außer Frontend) — Codecov mit `fail_ci_if_error: false`, kein `vitest.config.ts coverage`-Block in Backend, kein `.solcover.js` in Contracts. Drops sind folgenlos.
- F8.2 Production-Rate-Limiter ungetestet — `rate-limit.test.ts` instantiiert eine eigene Express-App und testet `express-rate-limit` als Library, nicht den Production-Limiter aus `src/index.ts`.
- F8.3 11 kritische Pfade aus Bereich 1–7 komplett ungetestet (`queryFilterChunked`, `getEffectiveRpcUrls`, `isAlchemyFreeUrl`, `withRpcRetry`, `assertSufficientBalance`, NonceManager, `json-file-event-store.ts`, `admin-labels.ts` atomic write, `config.ts` boot-validation, `auth.ts` middleware-Edge-Cases, `/health/diag`).

🟠 Major: 3

- F8.4 Frontend-Coverage `40/35/30/40` Production-untauglich; AdminPage-Sign-Flows + RoleManagement + Template/AdminLabel-Dialoge + PointsPage-Real-Flow alle 0-getestet.
- F8.5 i18n-Mock `t: (key) => key` verschleiert fehlende Übersetzungen vollständig — Mock-Output gleich Test-Assertion = Tautologie.
- F8.6 Integration-Test-Suite zu dünn (8 Tests, alle Happy-Path) — kein Reorg, kein RPC-Failover, kein Cold-Sync, kein Multi-Worker, kein `nonce too low`-Race.

🟡 Minor: 3

- F8.7 Mock-Setup `test/setup.ts:39` mit hardcoded `getMinterAddress`/`getContractAddress`/`getFeeData` macht Boot-Failures + Gas-Strategie unprüfbar.
- F8.8 `/health/diag` ungetestet — Endpoint, auf den UptimeRobot/Healthchecks aus Bereich 7 zeigen würde.
- F8.9 V1-Test-File `SurveyPoints.test.ts` (563 Zeilen, ~50 Tests) läuft bei jedem CI-Run für obsoleten Mainnet-Frozen-Contract (~30 s CI-Zeit/Run).

⚪ Nit: 3

- F8.10 Kein expliziter `tsc --noEmit`-CI-Step (TypeScript-Check kommt nur indirekt durchs `pnpm build`).
- F8.11 Lighthouse CI crawlt nur `/`, ignoriert AdminPage/ClaimPage/PointsPage.
- F8.12 `eslint --fix` im Pre-Commit-Hook ist destructive (auto-fix kann Code-Semantik in Edge-Cases ändern).

Kumulierte Tally nach Bereich 8: **18 / 31 / 30 / 17 = 96 Findings + 2 Owner Decisions**.

**Top-3 Test-Schmerz vor Bereich 8:**

1. **Coverage-Theatre.** Außer Frontend (mit niedrig-anliegenden 40 %-Schwellen) hat das Repo **keine enforced Coverage-Schwelle**. Codecov-Uploads in CI haben `fail_ci_if_error: false` — Drops sind folgenlos. Das macht jeden Test-Vorschlag aus den Bereichen 1–7 zu einer Empfehlung ohne Mechanismus, der über 2 Jahre überlebt.
2. **`rate-limit.test.ts` testet eine eigens erstellte Express-App, nicht den Production-Limiter.** Wenn der Production-Limiter komplett aus `index.ts` entfernt wird, bleibt CI grün. Brute-Force-Schutz für `/admin/login` (Bereich 6 F6.6) ist damit „getestet" aber **nicht verifiziert**.
3. **27 Findings aus Bereichen 1–7 sind explizit als „Severity-Verstärker = ungetestet" markiert.** Die Konsequenz: jeder dieser Bugs kann nach einem Refactor unbemerkt re-introduziert werden. Beispiele: `queryFilterChunked` Off-by-one (F3.4), Cross-Operation-Replay (F6.3), Reorg-Robustheit (F4.4), Boot-Validation (F2.7), TLS-Pinning hard-fail (F7.5).

**Erkenntnisse aus Bereich 8:**

1. **Tests sind oberflächlich präsent, mechanisch abwesend.** 27 Test-Files, 5.158 Zeilen, ~250 it-Blöcke — quantitativ beeindruckend. Qualitativ: die kritischen Pfade sind mit `vi.fn()`-Stubs belegt (alle Mocks in `test/setup.ts:20–97`), echte Bug-Detection findet nur in den Edge-Routes statt. Mock-Hygiene ist invertiert: kritisches gemockt, Trivia echt getestet.

2. **„Cross-Reference-Tabelle" liefert die operativ wichtigste Sicht des gesamten Audit-Bereichs.** 52 von 84 Findings wären durch Tests fangbar. 9 davon haben heute Tests (✅/⚠️). 43 sind komplett ungetestet. Die Cross-Reference macht für jedes künftige PR offensichtlich, ob es einen Bereich-X-Finding addressiert ohne den entsprechenden Test einzuführen — und damit eine Regression-Prävention für die nächsten 2 Jahre.

3. **Mock-Setup `test/setup.ts:39` mit hardcoded `getMinterAddress` ist ein Anti-Pattern, das alle nachfolgenden Tests vergiftet.** Kein Test prüft, ob die echte Funktion bei fehlendem Key crasht (F2.7), ob die Adresse je in Logs erscheint (F2.6), ob eine Config-Mismatch-Production-Adresse Tests überraschen würde. Refactor zu Per-Test-Override würde diese Klassen von Bugs sofort sichtbar machen.

4. **Frontend-Test-Strategie ist „rendert es?"-Smoke-Test** für 8 von 9 Pages. ClaimPage als einziger Page mit echtem Flow-Test (218 Zeilen). AdminPage, PointsPage, alle Admin-Komponenten (RoleManagement, TemplateDownloadDialog, AdminLabelDialog) sind 0-getestet in ihrer Sign-Flow-Logik. Bereich 5 (XSS) und Bereich 6 (Auth) profitieren null von Frontend-Tests.

5. **i18n-Mock ist die heimtückischste Erfindung der gesamten Test-Suite.** `t: (key) => key` macht **jeden** Test der i18n-Strings prüft tautologisch — Mock-Output gleich Test-Assertion. Eine fehlende Übersetzung in `de.json` produziert in Tests den Key-String, in Production den Key-String — und kein Test sieht es. 2 Jahre lang können Übersetzungen erodieren ohne dass je ein Test fehlschlägt.

6. **Integration-Test-Suite ist Happy-Path-only.** 8 Tests, alle gegen frische Hardhat-Chain mit deterministischem Seed. Reorg-Simulation, RPC-Failover, Cold-Sync, Multi-Worker-Konkurrenz, `nonce too low`-Race: **null Tests**. Die wirklich production-typischen Failure-Modes (Bereich 3 + 4) sind komplett unentdeckt.

7. **CI-Pipeline-Hygiene ist solide** (Husky pre-commit + commit-msg, lint-staged, prettier+eslint, conventional commits, separate Jobs für Lint/Contracts/Backend/Frontend/Lighthouse, Hardhat-Node-Lifecycle in Backend-Job sauber). Kein Theatre. Aber: kein expliziter `tsc --noEmit` (kommt nur indirekt durchs `build`), Lighthouse nur Home-Page, kein 64-hex-Klartext-Key-Scan (verhindert keine `probe.mjs`-Wiederholung).

**Cross-Cutting-Synthese-Beitrag (für Bereich 9):**

- **Test-Mechanismus als Erfolgskriterium** für jeden Bereich-X-Fix: nicht „Bug gefixt", sondern „Bug gefixt UND Regression-Test vorhanden". Synthese sollte das als Akzeptanzkriterium aufnehmen.
- **27 Test-Lücken mit Severity-Verstärker** sind die nicht-aufgehobenen Hypotheken aus Bereichen 1–7. Reihenfolge der Resolution = Reihenfolge der Test-Backlog-Sprints in `08-bereich-8-tests-ci.md`.
- **Coverage-Schwellen-Aktivierung (F8.1)** ist der einzige Fix, der mechanisch über 2 Jahre absichert. Synthese muss F8.1 als Phase-1-Pflicht-Item führen.
- **Bus-Factor-Verstärker:** Hirschfeld in 18 Monaten kann ohne Tests nicht erkennen, ob sein Refactor eine Bereich-X-Regression einführt. Tests sind die einzige durchhaltbare Knowledge-Übergabe-Form.

**Empfehlung an Owner für Phase 1 (vor nächstem Klassen-Run, ~1 h Aufwand):**

1. **T8.1** — CI-Step für 64-hex-Klartext-Key-Scan (5 Zeilen `.github/workflows/ci.yml`). Verhindert nächste `probe.mjs`-Wiederholung und kostet 0 s CI-Zeit.
2. **T8.36** — Coverage-Schwellen aktivieren in Backend (`vitest.config.ts` 8 Zeilen + Codecov `fail_ci_if_error: true`). 30 min Owner-Zeit. Ab dann kein PR mehr mit Coverage-Drop.
3. **T8.13/F8.5** — i18n-Parity-Test (`packages/frontend/test/i18n.test.ts`, 30 Zeilen). 30 min, fängt jede künftige fehlende Übersetzung sofort.

Das schließt die drei größten Mechanismus-Lücken. Die restlichen 33 Test-Backlog-Items sind staged in Sprints 2–5 verteilbar (~5 Personentage gesamt, reduziert Test-Lücke von 83 % auf ~30 %).

**Zwischenstand vor Synthese:**

- **96 Findings** kumuliert (18 🔴 / 32 🟠 / 30 🟡 / 16 ⚪) + 2 Owner Decisions.
- **27 Test-Lücken** als Severity-Verstärker identifiziert — entscheidet Reihenfolge der Phase-2/3-Resolution.
- **6 Phasen-1-Items** über alle Bereiche (jetzt + 3 Bereich-7-Items + 3 Bereich-8-Items): UptimeRobot-Setup, Plesk-Konstanten-Befüllung, Plesk-Cron-Balance, 64-hex-Key-Scan-CI, Coverage-Schwellen-aktivieren, i18n-Parity-Test.

**Nächster Schritt:** Synthese & Go/No-Go. Output `docs/audit/v2/09-synthese-go-no-go.md` mit:

- Aggregierte Findings-Liste sortiert nach Phase (1 / 2 / 3 / 4 / Wartung).
- Konkrete Go/No-Go-Empfehlung für „Klassen-Run im Sommersemester 2026".
- Owner-Roadmap mit Personentage-Schätzung pro Phase.
- Akzeptanz-Kriterien für „Bereich X gilt als geschlossen" (Code-Fix + Test + Doku).
- 6-monatlicher Re-Audit-Trigger-Liste.

---

### 2026-04-18 13:00 — Bereich 9 (Synthese & Go/No-Go) abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/09-synthese-go-no-go.md` — finale Aggregation aller 96 Findings + 2 Owner Decisions, 4-Phasen-Roadmap, Akzeptanz-Kriterien, 6-Monats-Re-Audit-Trigger, 6 Cross-Cutting-Pattern, 4-Wochen-Owner-Aktionsliste, finale Go/No-Go-Empfehlung.

**Inhalt der Synthese:**

- **Phase 1 (~5–7 PT):** 14 Findings (alle 16 Code-Blocker minus 2 von Test-Cluster, plus 2 Operations-Items) — harte Voraussetzung für nächsten Klassen-Run.
- **Phase 2 (~12–15 PT staged):** 23 Findings (verbleibende Blocker + 12 Top-Major) — Voraussetzung für 2-Jahre-Stabilität, ausführbar 4–6 Wochen.
- **Phase 3 (~10–12 PT):** 20 Findings (verbleibende Major + strategische Minor) — Voraussetzung für Übergabe an Hirschfeld.
- **Phase 4 (~30–40 h verteilt über 2 Jahre):** 26 verbleibende Minor + 13 Nit als laufende Wartung.

**Severity-Tally final konsolidiert:**

🔴 Blocker: 18 (16 Code + 2 Ops) / 🟠 Major: 31 / 🟡 Minor: 30 / ⚪ Nit: 17 = **96 Findings + 2 Documented Owner Decisions**.

Aufschlüsselung nach Bereich:

- Bereich 1: 1 🔴 (= F1.1 = OD-äquivalent, „nicht mehr relevant, war so gewollt") / 4 🟠 / 4 🟡 / 2 ⚪
- Bereich 2: 2 🔴 / 4 🟠 / 3 🟡 / 1 ⚪ + 2 OD
- Bereich 3: 0 🔴 / 4 🟠 / 5 🟡 / 2 ⚪
- Bereich 4: 3 🔴 / 4 🟠 / 5 🟡 / 2 ⚪
- Bereich 5: 4 🔴 / 4 🟠 / 4 🟡 / 2 ⚪
- Bereich 6: 3 🔴 / 4 🟠 / 3 🟡 / 2 ⚪
- Bereich 7: 2 🔴 / 4 🟠 / 4 🟡 / 2 ⚪
- Bereich 8: 3 🔴 / 3 🟠 / 3 🟡 / 3 ⚪

**Go/No-Go-Empfehlungen:**

| Szenario                                        | Empfehlung                                             |
| ----------------------------------------------- | ------------------------------------------------------ |
| Status quo, sofortiger Klassen-Run SoSe 2026    | 🟠 NO-GO mit Workaround (Klein-Run ≤10 Studis möglich) |
| Klassen-Run nach Phase 1 (~1 PW)                | 🟢 GO                                                  |
| Produktiv-Betrieb 2 Jahre + 4 Klassen-Runs/Jahr | 🟠 GO mit Phase 1+2+3 (~3 PW staged)                   |
| Übergabe an Hirschfeld als Solo-Maintainer      | 🔴 NICHT vor Phase 1+2+3 + Owner-Onboarding            |

**6 wiederkehrende Cross-Cutting-Pattern:**

1. „Operations existiert nicht" — Senior-Engineering-Bias auf sichtbare Code-Investitionen, unsichtbare Ops-Lücken (Backup, Monitoring, Runbooks).
2. „Test-Theater" — quantitativ präsent, qualitativ ohne Bug-Detection-Funktion. Mock-Hygiene invertiert.
3. „Auth ist ein 5-Min-Bearer-Token" — alle 3 Sig-Pfade leiden am gleichen Replay-Pattern.
4. „Doku = Marketing" — Doku-Refactors hinkten Code-Refactors hinterher (`security.md`, `deployment.md`, ADR-0004).
5. „Multi-Worker auf Plesk ist eine Black Box" — Owner-Recherche-Pflicht zu Worker-Anzahl entscheidet F4.1/F4.2-Strategie.
6. „Ein Refactor weiter und der Bug ist zurück" — ohne Coverage-Schwellen kein Mechanismus, der Maintainer-Wechsel überlebt.

**Owner-Roadmap nächste 4 Wochen:**

- **Woche 1 (4 h Owner):** F2.1 (probe.mjs purge + Minter-Rotation), F7.1 (UptimeRobot), T8.1 (CI-Key-Scan), F8.1 (Coverage-Schwellen).
- **Woche 2 (1 PT):** F6.1+F6.2+F6.3 (Auth-Refactor-PR), F8.13 (i18n-Test).
- **Woche 3 (1 PT):** F5.1+F5.2+F5.3+F5.4 (Frontend-Cluster), F2.2+F7.2 (Owner-Recherche-Session am Plesk-Tenant).
- **Woche 4 (4 h):** F8.2 (Production-Rate-Limiter-Test), F4.3 (Backup-Workflow), GitHub-Issues abklappern.

Nach Woche 4: Phase 1 abgeschlossen → Klassen-Run kann go.

**Zentrale Erkenntnis:**

Das System ist ein architektonisch durchdachter Re-Build (V1→V2) mit hochwertiger Engineering-Substanz, operationaler Kindheit und einer Test-Suite, die Bug-Detection nicht leistet. Phase-1 ist die niedrigschwellige Hochskalierung von „funktioniert im Beobachtungsmodus" auf „kann öffentlich laufen". Phase-2+3 ist die Hochskalierung auf „läuft 2 Jahre selbständig". Beides ist ohne KMS, ohne Vault, ohne Kubernetes, ohne Datadog erreichbar — passend zu HSBI-Realität (Plesk + Free-Tier + Solo-Owner).

**Audit V2 abgeschlossen.** Final-Output:

- 1× Audit-Plan (`00-audit-plan-v2.md`)
- 8× Bereich-Audit-Reports (`01-08-*.md`)
- 1× Synthese (`09-synthesis-go-no-go.md` — Master-Findings + Verdicts)
- 1× Master-Log (`AUDIT-LOG.md`)
- 7× Runbooks unter `docs/runbooks/`
- 96 Findings + 2 Owner Decisions + 36-Item-Test-Backlog + 4-Phasen-Roadmap

Insgesamt **~5.000 Zeilen Audit-Material** geliefert.

---

### 2026-04-19 — Re-Synthese-Pass (Bereich 9b) abgeschlossen

**Files erzeugt:**

- `docs/audit/v2/09-synthesis-go-no-go.md` — zweiter Synthese-Pass mit anderer Linse:
  - **Dedupe:** 96 Findings → 18 Master-Findings (M1–M18) mit Cross-Refs.
  - **Re-Priorisierung:** nach Blast-Radius × Wahrscheinlichkeit × Reparatur-Kosten; Severity neu zugewiesen wo Kontext es ändert (z. B. M2 Auth-Replay: 🔴 für 2-Jahre, 🟠 für 3-Tage-Testrun mit Owner-Beobachtung).
  - **Zwei separate Verdicts:** Studi-Testrun (Tage, beobachtet) vs. 2-Jahre-Produktiv (unbeobachtet).
  - **24-Stunden-Fix-Sequenz:** 15 Items à 5 min – 4 h, total 9–10 h effektive Code-Zeit, in Reihenfolge Bombe → Detection → UX → Härtung.
  - **Akzeptierte Risiken:** 9 explizit nicht-empfohlene Fixes mit Begründung (OD-2.A, OD-2.B, F1.4-Variante-A/B, F4.11, F6.8, F8.9, F7.12, F5.13/14, F3.10).
  - **Long-Term-Backlog:** 18 Items geordnet nach Risiko-Reduktion-pro-Aufwand, Effort in PT, mit Trigger-Dates Q3/2026 → Q1/2027.
  - **Bus-Factor-Test re-evaluiert:** 🔴 SCHEITERT HEUTE (Hirschfeld kommt nicht über Schritt 2 "Plesk-Log lesen" hinaus, weil Plesk-URL leer); konkret 6 fehlende Repo-Items benannt mit 1 PT Heilungs-Aufwand.
  - **V3-Re-Deployment-Pflicht-Triggers:** 5 explizit benannte Bedingungen (F1.2-Vorfall, F1.4-Heilung, On-Chain-Auth, Storage-Slot-Mangel, RecoveryStub).
  - **Verdict-Inkompatibilitäten explizit:** "GO Testrun + NO-GO 2-Jahre" ist der wahrscheinliche Stand nach 24-h-Sequenz; Phase 2 (12–15 PT bis Q3/2026) ist die Bedingung für beide-GO.

**Konkrete Schluss-Zeile:**

> `[0] BLOCKERS, [6] MAJORS verbleibend nach 24h-Fix-Sequenz für Studi-Testrun.`
> `[7] BLOCKERS, [6] MAJORS verbleibend nach 24h-Fix-Sequenz für 2-Jahre-Produktivbetrieb.`
>
> **GO/NO-GO Studi-Testrun:** 🟢 GO nach 24-h-Sequenz.
> **GO/NO-GO 2-Jahre:** 🔴 NO-GO nach 24-h-Sequenz allein; 🟢 GO nach Phase 2 + Bus-Factor-Setup bis Q3/2026.

**Joris-spezifische Empfehlung (zentrale Erkenntnis):**

Der Wunsch "heute fertig + 2 Jahre läuft es" ist nur partiell vereinbar.

- **HEUTE 1 Tag (10–12 h):** Studi-Testrun ✅, 2-Jahre 🔴.
- **HEUTE 3 Tage (~30 h):** Studi-Testrun ✅ + 80 % der 2-Jahre-Pflicht ✅ (M3 Backup, M14 V2.1-Upgrade, M8 iOS-Banner, M11 Bus-Factor). Verbleibend: M2 Auth-Refactor (5 PT) + M15 Test-Sprint (5 PT) — beide brauchen Konzentration und sind besser in zwei späteren Spät-Sprints im Mai/Juni.
- **HEUTE 1 Tag + 2 Wochen Spät-Sprints (3 PW total):** Vollständige 2-Jahre-Sicherheit ✅✅.
- **NUR 24-h-Sequenz, dann nichts mehr:** Erster echter Vorfall realistisch in 6–9 Monaten.

**Audit V2 final abgeschlossen.** Stand 2026-04-19. Master-Findings, Verdicts (Testrun vs. 2-Jahre) und 24-h-Fix-Sequenz in `09-synthesis-go-no-go.md`.
