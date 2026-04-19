# Bereich 9 — Synthese & Go/No-Go

**Auditor:** Senior Auditor (extern, finaler Pass).
**Datum:** 2026-04-18.
**Scope:** Aggregation aller 96 Findings + 2 Owner Decisions aus Bereichen 1–8. Roadmap, Go/No-Go-Empfehlung, Akzeptanz-Kriterien, 6-Monats-Re-Audit-Trigger.

---

## TL;DR — Go/No-Go-Empfehlung

| Szenario                                                 | Empfehlung                                              | Begründung                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status quo, sofortiger Klassen-Run im SoSe 2026**      | **🟠 NO-GO mit Workaround**                             | 4 Blocker sind aktiv exploitable (F2.1 Live-Key, F5.1–F5.4 Frontend, F6.1–F6.3 Auth-Replay). 1 Klassen-Run mit 30 Studis funktioniert technisch, aber ein bösartiger Studi oder ein Sig-Leak von einer anderen DApp kompromittiert das System. Plus: 0 Monitoring (F7.1), 0 Runbooks (F7.2 — jetzt teil-erledigt). |
| **Klassen-Run nach Phase-1-Fixes (~1 Personenwoche)**    | **🟢 GO**                                               | 6 Block-Findings + 5 hochpriorisierte Major-Findings adressiert. Restrisiko ist vertretbar für die Klassengröße + Prototypen-Charakter des Systems.                                                                                                                                                                |
| **Produktiv-Betrieb über 2 Jahre + 4 Klassen-Runs/Jahr** | **🟠 GO mit Phase-1+2+3 (~3 Personenwochen verteilt)**  | Ohne enforced Coverage-Schwellen (F8.1) und ohne Ops-Cluster-Resolution (F7-Cluster) erodiert die Codequalität über 2 Jahre. Bus-Factor=1 (Joris) ist nicht durchhaltbar ohne F7.7-Owner-Doku.                                                                                                                     |
| **Übergabe an Hirschfeld als Solo-Maintainer**           | **🔴 NICHT vor Phase 1+2+3 + Owner-Onboarding-Session** | Hirschfeld kann ohne Runbooks (jetzt da) und ohne `operators-private.md`-Befüllung (Owner-Recherche-Pflicht, F7.10) nicht autonom Incidents lösen.                                                                                                                                                                 |

**Konkrete Empfehlung:** Phase 1 (1 Personenwoche, ~5–7 Tage) ist die **harte Voraussetzung** für jeden produktiven Einsatz. Phase 2+3 (~2 weitere Personenwochen, staged) sind die **Voraussetzung für 2-Jahre-Stabilität**. Synthese gibt diese Roadmap unten konkret aus.

---

## Severity-Tally final

🔴 **Blocker:** 18 (16 Code-Findings + 2 Operations-Findings)
🟠 **Major:** 31
🟡 **Minor:** 30
⚪ **Nit:** 17
**Gesamt:** 96 Findings

Plus:

- **2 Documented Owner Decisions** (OD-2.A Minter-ADMIN_ROLE, OD-2.B Plaintext-Plesk-ENV; F1.1 äquivalent zu OD-2.A → in Bereich 1 als „nicht mehr relevant, war so gewollt" markiert; nicht doppelt gezählt).
- **6 Cluster-Anker** aus Bereichen 2/4/5/6 in Bereich 7 zur operativen Ausführung.
- **27 Test-Lücken als Severity-Verstärker** (Bereich 8): Findings, die einen Test bekommen müssen, sonst re-introduzierbar.
- **36 Test-Backlog-Items** (Bereich 8) priorisiert nach „fängt einen bekannten Bereich-X-Finding".

---

## Aggregierte Findings — sortiert nach Phase

### Phase 1: HARTE Voraussetzung für nächsten Klassen-Run (~5–7 Personentage)

Diese 14 Findings adressieren **alle Blocker, die nicht durch akzeptierte Owner Decisions abgedeckt sind**, plus zwei Operations-Items, die mit minimalem Aufwand maximale Risiko-Reduktion bringen.

| #   | ID   | Titel                                                                                                                                                                                | Severity          | Aufwand   | Cluster     |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------- | ----------- |
| 1   | F2.1 | `probe.mjs` mit Live-Mainnet-Minter-PK lokal löschen + git-history-purge + Plesk-Tenant-Audit + Minter-Rotation                                                                      | 🔴                | 4 h       | Stand-alone |
| 2   | F2.2 | `docs/runbooks/key-rotation.md` ✓ erledigt; **Minter-Compromise-Plan im README verlinken** + neue/alte Wallet im `runbooks/README.md` Konstanten-Tabelle festhalten                  | 🔴                | 30 min    | Phase 1     |
| 3   | F5.1 | Klartext-PK-Export → ethers Keystore-V3 mit Studi-Passwort-Prompt                                                                                                                    | 🔴                | 1 PT      | Frontend    |
| 4   | F5.2 | Admin-Auth Infinite-MetaMask-Popup-Loop: `userRejected`-Catch + Toast + State-Reset                                                                                                  | 🔴                | 4 h       | Frontend    |
| 5   | F5.3 | CSP für Static-SPA: Plesk `.htaccess` mit `Header set Content-Security-Policy ...` (entweder Backend `helmet`-Header durchroutet oder per `.htaccess`)                               | 🔴                | 4 h       | Frontend    |
| 6   | F5.4 | Safari iOS ITP: Pre-Sign Reminder „Wallet-File herunterladen", Onboarding-Hinweis in `claim.tsx`, Recovery-Doku im UI                                                                | 🔴                | 1 PT      | Frontend    |
| 7   | F6.1 | Server-Side-Nonce für Admin-Auth: `/api/v1/admin/nonce` (issue + 1× consume), `usedAdminNonces`-Store                                                                                | 🔴                | 1 PT      | Auth        |
| 8   | F6.2 | Cross-Operation-Replay verhindern: jede Sig muss `operation` + `targetSurveyId/targetWallet` mit-signen, Backend prüft je Endpoint                                                   | 🔴                | 1 PT      | Auth        |
| 9   | F6.3 | Claim-Sig binden: Studi muss Survey + Nonce explizit signen statt nur generischen Wallet-Login → eliminiert Cross-DApp-Sig-Leak                                                      | 🔴                | 1 PT      | Auth        |
| 10  | F7.1 | UptimeRobot 5 Monitore (Variante A aus `07-bereich-7-deployment-ops.md`) + Mail an Hirschfeld                                                                                        | 🔴                | 30 min    | Ops         |
| 11  | F7.2 | Runbooks ✓ erstellt; **Konstanten-Tabelle im `runbooks/README.md` Owner-Recherche-Session befüllen** (Plesk-URL, BaseScan-Watchlist, Coinbase-Owner, DEFAULT_ADMIN-Wallet-Identität) | 🔴                | 1 h Owner | Ops         |
| 12  | F8.1 | Coverage-Schwellen aktivieren: Backend `vitest.config.ts coverage`-Block + `.solcover.js` + Codecov `fail_ci_if_error: true`                                                         | 🔴                | 30 min    | Test        |
| 13  | F8.2 | `rate-limit.test.ts` löschen + neuer Production-Limiter-Integration-Test gegen `createApp()`                                                                                         | 🔴                | 4 h       | Test        |
| 14  | T8.1 | CI-Step: 64-hex-Klartext-Key-Scan in untrackeden Files (verhindert künftige `probe.mjs`-Wiederholung)                                                                                | (Verstärker F2.1) | 30 min    | Test        |

**Aufwand Phase 1:** ~5–7 Personentage. Reihenfolge: 1, 14, 11, 12 (alle ≤1 h, sofort starten) → 10, 2 (Operations) → 7, 8, 9 (Auth-Cluster gemeinsam) → 5, 3, 4, 6 (Frontend-Cluster) → 13 (Test).

**Ergebnis:** 14 von 18 Blockern adressiert. F8.3 (kritische Code-Pfade ungetestet) wird in Phase 2/3 staged abgearbeitet. F4.1/F4.2 (Multi-Worker-Race) brauchen Owner-Recherche zur Plesk-Worker-Anzahl (F7.10) → hängt an Phase 1 Item 11.

---

### Phase 2: VOR V3-Upgrade oder vor Maintainer-Wechsel (~5–7 Personentage)

Adressiert die verbleibenden 4 Blocker + die 12 hochwertigsten Major-Findings.

| #   | ID   | Titel                                                                                                                                                                         | Severity  | Aufwand                             |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------- |
| 1   | F4.1 | `used-nonces.json` Multi-Worker-Race: `proper-lockfile` oder Plesk-Single-Worker-Pinning (Owner-Entscheidung nach F7.10-Recherche)                                            | 🔴        | 1 PT                                |
| 2   | F4.2 | `survey-keys.createKey` Multi-Worker-Race: gleiche Strategie wie F4.1                                                                                                         | 🔴        | 0,5 PT (gleicher Mechanismus)       |
| 3   | F4.3 | Backup-Strategie für 4 JSON-Stores: GHA-Workflow `backup.yml` mit täglichem `actions/upload-artifact` oder Encrypted-Release-Asset                                            | 🔴        | 1 PT                                |
| 4   | F8.3 | 11 kritische Code-Pfade Tests schreiben (Sprint-1 + Sprint-3 + Sprint-4 aus Bereich 8)                                                                                        | 🔴        | 3 PT                                |
| 5   | F1.2 | `LastAdmin()`-Schutz via `revokeRole`/`renounceRole` umgangen — UUPS-Upgrade: `_grantRole`/`_revokeRole`/`_setRoleAdmin` per Override gegen letzte Admin schützen             | 🟠        | 1 PT                                |
| 6   | F1.4 | HMAC-Key-Distribution an SoSci-Operator: SoSci-Snippet auf serverseitige Verifikation umstellen, Backend ruft SoSci-API statt PHP-Snippet zu shippen                          | 🟠        | 2 PT (Owner-Entscheidung notwendig) |
| 7   | F2.3 | `maxFeePerGas`-Hard-Cap (z. B. `MAX_FEE_PER_GAS_GWEI=0.5`) im Backend, `awardPoints` rejected Tx wenn überschritten + Plesk-Cron-Mail                                         | 🟠        | 4 h                                 |
| 8   | F3.1 | Cross-Provider Block-Number-Mismatch: `lastSyncedBlock` mit Provider-ID koppeln; bei Provider-Wechsel `min(lastSyncedBlock, newProviderLatestBlock)` re-syncen                | 🟠        | 1 PT                                |
| 9   | F3.2 | Cold-Sync `CONTRACT_DEPLOY_BLOCK=0`: Default auf echten Mainnet-Deploy-Block (~25.123.456 oder aktuell), `boot-time-cap=15min` mit `lastSyncedBlock`-Persist nach jedem Chunk | 🟠        | 4 h                                 |
| 10  | F3.3 | Circuit-Breaker bei alle-RPCs-throttled: `withRpcRetry` verfolgt Failure-Rate, > N% → 60-s-Pause statt endless retry                                                          | 🟠        | 4 h                                 |
| 11  | F4.6 | Reorg-Robustheit `events.json`: bei jedem `runSync` letzten N Blöcke (z. B. 12) re-querieren und `txHash`-deduplizieren                                                       | 🟠        | 1 PT                                |
| 12  | F4.7 | `lastSyncedBlock > latestBlock` mit Warning-Log + `lastSuccessfulSyncAt` nicht updaten + Health-Check setzt status=DEGRADED                                                   | 🟠        | 4 h                                 |
| 13  | F6.4 | pino-http Body-Redact für `adminSignature` + `adminMessage` + `claimToken` + `nonce`                                                                                          | 🟠        | 2 h                                 |
| 14  | F6.5 | `isAdmin()` Hot-Path: 60-s-TTL-Cache mit RPC-Failure-Fallback auf Cache (statt Lockout); Cache-Entry pro Wallet                                                               | 🟠        | 4 h                                 |
| 15  | F6.6 | Rate-Limit-Defaults harmonisieren: Doku auf Code anpassen, `RATE_LIMIT_MAX` per Endpoint, NAT-Exception via Wallet-basiertem Limit für `/claim`                               | 🟠        | 4 h                                 |
| 16  | F6.7 | Frontend Admin-Sig nicht im React-State persistieren über Operation hinaus: nach erfolgreicher Server-Verifikation State immediate clearen                                    | 🟠        | 2 h                                 |
| 17  | F7.3 | `data/*.json`-Backup-Workflow ✓ in F4.3 enthalten — kombinieren                                                                                                               | (cluster) | (siehe F4.3)                        |
| 18  | F7.4 | Post-Deploy-Health-Check + Auto-Rollback in `deploy.yml` (siehe `07-bereich-7-deployment-ops.md` YAML-Snippet)                                                                | 🟠        | 4 h                                 |
| 19  | F7.5 | TLS-Pinning hard-fail-by-default: `TLS_VERIFY_FAIL_OPEN=false` als Default                                                                                                    | 🟠        | 1 h                                 |
| 20  | F7.6 | `app.js`-Defensive-Refuse: bei `.env`-Datei + Plesk-ENV → process.exit(1) mit klarer Message                                                                                  | 🟠        | 2 h                                 |
| 21  | F8.4 | Frontend-Coverage staged auf 65/55/60/65 + AdminPage-Sign-Flow-Tests + RoleManagement-Tests (Sprint 2 aus Bereich 8)                                                          | 🟠        | 2 PT                                |
| 22  | F8.5 | i18n-Parity-Test + i18n-Coverage-Test (Sprint 2 T8.13)                                                                                                                        | 🟠        | 4 h                                 |
| 23  | F8.6 | Integration-Suite ausbauen: Reorg, Failover, Cold-Sync, `nonce too low`, Multi-Worker (Sprint 4 aus Bereich 8)                                                                | 🟠        | 2 PT                                |

**Aufwand Phase 2:** ~12–15 Personentage, staged über 4–6 Wochen. Reihenfolge: F4.3 + F4.1+F4.2 (Daten-Integrität zuerst), dann F1.2 + F2.3 (Smart-Contract + Gas-Cap, schmerzhaft im Worst-Case), dann F3-Cluster (RPC-Robustheit), dann F6-Cluster (Auth-Polishing), dann F7 + F8 parallel.

---

### Phase 3: VOR ÜBERGABE oder vor 2. Klassen-Jahr (~5–7 Personentage)

Adressiert die verbleibenden Major-Findings + die strategisch wichtigen Minor-Findings.

| #   | ID    | Titel                                                                                                                        | Severity | Aufwand                   |
| --- | ----- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------- |
| 1   | F1.3  | Doku-Inkonsistenzen Smart-Contract: `docs/smart-contract.md` + ADR-0004 mit Code-Stand abgleichen                            | 🟠       | 4 h                       |
| 2   | F1.5  | OpenZeppelin-Storage-Manifest unter ungewöhnlichem Filename: in Standard-Location umbenennen oder ADR mit Begründung         | 🟠       | 2 h                       |
| 3   | F2.4  | `MIN_BALANCE_WEI`-Dimensionierung + Plesk-Cron-Alerting (Empfehlungen aus Bereich 2)                                         | 🟠       | 4 h                       |
| 4   | F2.5  | Logger-Redact für Boot-Crash-Stack-Traces                                                                                    | 🟠       | 2 h                       |
| 5   | F2.6  | `docs/security.md` komplett refactoren (5 falsche Aussagen)                                                                  | 🟠       | 4 h                       |
| 6   | F5.5  | `frame-ancestors`-CSP-Direktive                                                                                              | 🟠       | 1 h (combiniert mit F5.6) |
| 7   | F5.6  | `object-src`/`base-uri`/`form-action`-CSP-Direktiven                                                                         | 🟠       | 1 h                       |
| 8   | F5.7  | localStorage-Permanenz im UI kommunizieren (Onboarding-Hinweis)                                                              | 🟠       | 4 h                       |
| 9   | F5.8  | `connect-src`-CSP auf tatsächlich genutzte RPCs reduzieren                                                                   | 🟠       | 2 h                       |
| 10  | F6.10 | HMAC-Key-Rotation: Pre-Flight-Warning + 24-h-Dual-Key-Phase                                                                  | 🟠       | 4 h                       |
| 11  | F7.7  | Bus-Factor: `operators-private.md` (Plesk-Owner, Coinbase-Owner, BaseScan-Key-Owner, DEFAULT_ADMIN-Wallet-Identität) anlegen | 🟡       | 1 h Owner                 |
| 12  | F7.10 | Plesk-Log-Pfad-Owner-Recherche-Session (1×60 min am Plesk-Tenant)                                                            | 🟡       | 1 h Owner                 |
| 13  | F2.7  | `MINTER_PRIVATE_KEY` Format-Validation + Boot-Test (Bereich 8 T8.2)                                                          | 🟡       | 2 h                       |
| 14  | F2.8  | `nonce too low`/`replacement transaction underpriced` Mapping                                                                | 🟡       | 4 h                       |
| 15  | F4.4  | `getBlockTimestamps` parallelisieren + Retry-Wrapper                                                                         | 🟠       | 4 h                       |
| 16  | F4.5  | `survey-keys.json` chmod 0600 + Verifikations-Step im Incident-Runbook                                                       | 🟠       | 1 h                       |
| 17  | F6.8  | `markUsed` BEFORE `awardPoints` → Recovery-Endpoint für Worker-Crash-Fall                                                    | 🟡       | 1 PT                      |
| 18  | F6.9  | Doku-zu-Code-Diskrepanz im Claim-Message-Format korrigieren                                                                  | 🟡       | 2 h                       |
| 19  | F8.7  | Mock-Hygiene: `test/setup.ts` Per-Test-Override-Pattern statt globaler Mocks                                                 | 🟡       | 1 PT                      |
| 20  | F8.8  | `/health/diag`-Tests (Sprint 5 T8.30)                                                                                        | 🟡       | 2 h                       |

**Aufwand Phase 3:** ~10–12 Personentage. Reihenfolge: Doku-Cluster (F1.3, F1.5, F2.6) zuerst (Hirschfeld-Übergabe), dann Operations-Owner-Recherche (F7.7, F7.10) parallel, dann Code-Cluster.

---

### Phase 4: WARTUNG & POLISHING (über 2 Jahre verteilt, ~5 Personentage)

Verbleibende Minor + Nit-Findings. Niedrige Dringlichkeit, hohe kumulative Wirkung über Zeit.

**Minor (verbleibend):**
F2.9, F2.10, F3.5, F3.6, F3.7, F3.8, F3.9, F4.8–F4.12, F5.9–F5.12, F6.11, F6.12, F7.8, F7.9, F8.9.

**Nit (verbleibend):**
F1.10, F1.11, F3.10, F3.11, F4.13, F4.14, F5.13, F5.14, F7.11, F7.12, F8.10, F8.11, F8.12.

**Aufwand-Schätzung pro Item:** im Schnitt 2 h. Total ~30–40 h, verteilbar über 2 Jahre als „PR-Polish" alongside Feature-Arbeit.

**Empfehlung:** Diese Findings nicht als Sprint planen — beim nächsten Touch des betroffenen Code-Pfads gleich mit-erledigen. GitHub-Issues mit Label `polish` erstellen, monatliche „1-h-Polish-Session" als Routine.

---

## Akzeptanz-Kriterien — wann gilt ein Finding als „geschlossen"?

Jeder Fix muss alle drei Kriterien erfüllen:

1. **Code-Fix** committed und in Production deployed.
2. **Test** vorhanden, der die Regression verhindert (für testbare Findings — siehe Bereich 8 Cross-Reference).
3. **Doku** aktualisiert (README, runbooks, ADR oder docs/\* — je nach Finding-Charakter).

**Konkret pro Severity:**

| Severity   | Code-Fix | Test                                                          | Doku                      |
| ---------- | -------- | ------------------------------------------------------------- | ------------------------- |
| 🔴 Blocker | Pflicht  | Pflicht (oder explizite Begründung warum nicht testbar im PR) | Pflicht (mind. CHANGELOG) |
| 🟠 Major   | Pflicht  | Stark empfohlen                                               | Empfohlen                 |
| 🟡 Minor   | Pflicht  | Optional                                                      | Optional                  |
| ⚪ Nit     | Pflicht  | Nicht erforderlich                                            | Nicht erforderlich        |

**Audit-Tracking:** Jeder Fix in PR-Beschreibung mit `Closes audit/v2/F<X>.<Y>` markieren. Bereich 8 F8.1 (enforced Coverage-Schwellen) macht das mechanisch durchhaltbar.

---

## 6-monatlicher Re-Audit-Trigger

Wann ist ein neuer Audit-Pass fällig — auch ohne explizite Anforderung?

### Hard-Trigger (sofort Re-Audit-Bereich starten)

- **Smart-Contract-V3-Upgrade** → kompletter Bereich 1 + 6 + 8 erneut.
- **Wechsel des DEFAULT_ADMIN_ROLE-Holders** (Personalwechsel HSBI) → Bereich 1 + 2 + 7.
- **Plesk-Tenant-Wechsel oder HSBI-Hosting-Wechsel** → Bereich 2 + 4 + 7 komplett.
- **Neuer RPC-Provider** (z. B. Wechsel von Public zu Alchemy paid) → Bereich 3.
- **HMAC-Schema-Änderung** (z. B. EIP-712 statt String) → Bereich 6 + 8.
- **Frontend-Major-Refactor** (z. B. neue Wallet-Library, React-Major-Update) → Bereich 5 + 8.

### Soft-Trigger (Bereich-Audit beim nächsten Quartals-Review)

- **>20 Commits an `packages/backend/src/services/` seit letztem Audit** → Bereich 2 + 4.
- **>10 Commits an `packages/frontend/src/pages/` oder `components/admin/`** → Bereich 5.
- **CI-Failure-Rate >5 % über 30 Tage** → Bereich 8.
- **Coverage-Drop >5 Prozentpunkte** → Bereich 8.
- **Erste Production-Incident-Post-Mortem** → ganzer Bereich, in dem Incident lag, plus Bereich 7.
- **Owner-Personalwechsel oder Übergabe an Hirschfeld** → kompletter Re-Audit, fokussiert Bereich 7 + Operator-Doku.

### Routine-Re-Audit (alle 6 Monate, ~2 Personentage)

- Alle 4 JSON-Stores auf Größe + Restore-Test prüfen (F4.3).
- `git log --since=6.months --grep=fix` durchsehen → welche Fixes adressierten Audit-Findings, welche neue?
- Coverage-Trend prüfen (F8.1).
- Runbook-Inhalt mit Code-Stand abgleichen (Konstanten in `runbooks/README.md` aktuell?).
- BaseScan: ETH-Refill-History + Minter-Tx-Anzahl ansehen (Anomalien?).
- Plesk-Logs der letzten 6 Monate auf Pattern checken (gehäufte Errors?).

---

## Wiederkehrende Muster über alle Bereiche (Cross-Cutting-Synthese)

### Muster 1: „Operations existiert nicht"

**Bereiche:** 2, 4, 7 (kumulativ).

Engineering ist solide, Operations ist Greenfield. Backup, Monitoring, Runbooks, Owner-Doku, Recovery-Pfade — alle existierten beim Audit-Start nicht. Bereich 7 hat 6 Runbooks + Monitoring-Setup-Beschreibung geliefert; F7.10-Owner-Recherche-Session (1 h Plesk-Verifikation) schließt die letzten operativen Lücken.

**Strukturelle Ursache:** Senior-Engineering-Bias auf sichtbare Code-Investitionen. „Atomic-File-Stores", „TLS-Pinning", „FallbackProvider" wurden gebaut. „Backup-Cron", „UptimeRobot", „operators-private.md" wurden nicht gebaut, weil sie unsichtbar sind bis es brennt.

**Fix-Strategie:** Bereich 7-Runbooks sind die erste Hälfte. Owner muss die zweite Hälfte (Recherche-Session, Phase 1 Item 11) selbst leisten — ein extern beauftragbares Audit kann das nicht ersetzen.

### Muster 2: „Test-Theater"

**Bereiche:** 8 (zentral) + alle anderen (kumulativ als „Severity-Verstärker").

Tests sind quantitativ präsent (5.158 Zeilen, ~250 it-Blöcke), qualitativ fehlt die Bug-Detection-Funktion. Mock-Hygiene ist invertiert: kritische Pfade (Boot-Validation, NonceManager, `queryFilterChunked`, Auth-Middleware) sind in `setup.ts:20–97` global gemockt; Trivia-Routes haben echte Tests. Coverage-Schwellen sind nur im Frontend gesetzt und dort niedrig (40/35/30/40). Codecov-Uploads sind alle `fail_ci_if_error: false`.

27 Findings aus Bereichen 1–7 wurden explizit als „ungetestet = Severity-Verstärker" markiert. Sie sind die Bug-Bait-Liste der nächsten 2 Jahre.

**Fix-Strategie:** F8.1 (Coverage-Schwellen aktivieren) ist der **einzige** Mechanismus, der über Maintainer-Wechsel hält. F8.3 (11 kritische Pfade testen) ist Phase 2. Sprint-Backlog (36 Items) in `08-bereich-8-tests-ci.md` ist konkret durchsortiert.

### Muster 3: „Auth ist ein 5-Min-Bearer-Token"

**Bereich:** 6 (zentral).

Alle drei Sig-basierten Auth-Pfade (Admin, Claim, Survey-Operations) leiden am gleichen Pattern: Sig wird einmal generiert, ist 5 min lang ein-und-derselbe Bearer-Token, kein Server-Side-Nonce, keine Operation-Bindung, keine Cross-Operation-Trennung. Eine geleakte Sig (z. B. via `pino-http`-Logging F6.4) erlaubt jede Aktion bis zur Window-Expiration.

**Fix-Strategie:** F6.1 + F6.2 + F6.3 (Phase 1 Items 7–9) müssen **gemeinsam** gefixt werden — partielle Lösung lässt Replay-Vektor offen. Backend-Pattern: `usedAdminNonces`-Store (analog `used-nonces.json`), Operation-Prefix in Message, EIP-712-Migration in V3 vorbereiten.

### Muster 4: „Doku = Marketing"

**Bereiche:** 1, 2, 6, 7 (kumulativ).

Mehrere Doku-Files (`docs/security.md`, `docs/deployment.md`, ADR-0004, `docs/smart-contract.md`) enthalten Aussagen, die zur Audit-Zeit nicht stimmten. F2.6 markierte 5 falsche Aussagen in `security.md` allein. F7.11 markierte `deployment.md` als veraltet (Docker/pm2-Referenzen). F1.3 markierte `smart-contract.md`-Inkonsistenzen.

**Strukturelle Ursache:** Doku ist beim Code-Bauen entstanden, danach nicht mit Code mit-evolviert. Refactors (V1→V2, RPC-Reorder, HMAC-Migration) haben Doku-Files leichtgewichtig „angepasst" statt vollständig synchronisiert.

**Fix-Strategie:** F1.3 + F2.6 + F6.9 + F7.11 als „Doku-Refresh-Sprint" zusammen, ~1 PT. Plus: GitHub-Issue-Template `docs-update-required` für jeden zukünftigen Code-Refactor.

### Muster 5: „Multi-Worker auf Plesk ist eine Black Box"

**Bereiche:** 4, 7.

Phusion Passenger spawnt potentiell mehrere Worker-Prozesse pro Backend. Alle 4 stateful Stores (`events.json`, `used-nonces.json`, `survey-keys.json`, `admin-labels.json`) haben in-process-Locks, **kein** cross-process-Lock. Multi-Worker = File-Korruption oder verlorene Writes möglich.

**Owner-Entscheidung pending (F7.10 + F4.1 + F4.2):** Plesk-Tenant auf 1 Worker pinnen (verliert Throughput, gewinnt Konsistenz) ODER `proper-lockfile` einbauen (gewinnt Konsistenz, kostet Performance).

**Fix-Strategie:** Owner-Recherche-Session (Phase 1 Item 11) klärt, wie viele Worker tatsächlich laufen. Wenn 1: F4.1/F4.2 sind De-Facto-OK (Doku-Pflicht). Wenn >1: `proper-lockfile`-Patch in Phase 2.

### Muster 6: „Ein Refactor weiter und der Bug ist zurück"

**Bereiche:** 8 (zentral).

83 % der testbaren Findings haben heute keinen Test, der sie fängt. Ohne Tests ist jeder Fix temporär — die nächsten 2 Jahre und ~50 PRs werden mehrere Refactors haben. Ohne Coverage-Schwellen + ohne Regression-Tests können behobene Bugs unbemerkt re-introduziert werden.

**Fix-Strategie:** Bereich-8-Sprint-1 Tests (T8.1, T8.36, T8.13) **gleichzeitig** mit Phase 1. Nicht später. Coverage-Schwellen-Aktivierung ist der einzige Mechanismus, der über Maintainer-Wechsel hält.

---

## Owner-Aktionsliste — nächste 4 Wochen

### Woche 1 (4 h Owner-Zeit)

1. **F2.1** lokal: `probe.mjs` löschen, `git filter-repo` für history-purge, force-push (NACH Backup, Side-Effect für andere Maintainer planen).
2. **F2.1** Mainnet: Minter-Wallet rotieren — neue Wallet generieren, ETH-balance transferren, MINTER_ROLE auf neue Wallet (alte revoken), Plesk-ENV updaten, `runbooks/README.md` Konstanten-Tabelle anpassen, BaseScan-Watchlist updaten.
3. **F7.1** UptimeRobot-Account: 5 Monitore aus `07-bereich-7-deployment-ops.md` Variante A.
4. **T8.1** CI-Step für 64-hex-Klartext-Key-Scan committen.
5. **F8.1** Coverage-Schwellen aktivieren (Backend `vitest.config.ts` + Codecov `fail_ci_if_error: true`).

### Woche 2 (1 Personentag Engineering)

6. **F6.1 + F6.2 + F6.3** als ein gemeinsamer Auth-Refactor-PR (Server-Side-Nonce + Operation-Binding + Claim-Sig-Binding).
7. **F8.13** i18n-Parity-Test.

### Woche 3 (1 Personentag Engineering)

8. **F5.1 + F5.2 + F5.3 + F5.4** als Frontend-Cluster-PR (Keystore-V3, MetaMask-Loop-Fix, CSP-`.htaccess`, Safari-ITP-Hinweis).
9. **F2.2 + F7.2** Owner-Recherche-Session am Plesk-Tenant (60 min): `runbooks/README.md` Konstanten-Tabelle befüllen, Plesk-Log-Pfad finden, File-Permissions verifizieren, Worker-Anzahl klären.

### Woche 4 (4 h Polishing)

10. **F8.2** Production-Rate-Limiter-Test.
11. PR-Beschreibungen mit `Closes audit/v2/F<X>` taggen, Audit-Findings als GitHub-Issues abklappern.
12. **F4.3** Backup-Workflow `backup.yml` (Cron daily, encrypted-release-asset).

**Nach Woche 4:** Phase 1 abgeschlossen. **Klassen-Run kann go.** Phase 2+3 staged über die folgenden 6–10 Wochen.

---

## Final Statement

**Status nach Audit V2 (alle 8 Bereiche):**

- 96 Findings dokumentiert (18 🔴 / 31 🟠 / 30 🟡 / 17 ⚪) + 2 Owner Decisions.
- 4-Phasen-Roadmap: Phase 1 (~1 PW) hart, Phase 2+3 (~3 PW staged) für 2-Jahre-Stabilität, Phase 4 (~5 PT verteilt) als laufende Wartung.
- 6 Runbooks geliefert (`incident-response`, `eth-refill`, `key-rotation`, `disaster-recovery`, `deploy-rollback`, `sosci-onboarding` + Index).
- 36-Item-Test-Backlog mit Cross-Reference zu jedem Bereich-X-Finding.
- Realistische HSBI-Coverage-Schwellen statt „aim for 100 %": Contracts 95/90/95/95, Backend 75/70/75/75, Frontend 65/55/60/65.

**Go/No-Go für nächsten Klassen-Run im SoSe 2026:**

- **Heute, ohne Phase 1:** **🟠 NO-GO mit Workaround.** Klein-Run möglich (≤10 Studis, in einer Sitzung beobachtet, Lehrender persönlich anwesend), aber öffentlich-aussetzbarer Klassen-Run birgt Auth-Replay-Risiko.
- **Nach Phase 1 (~1 PW):** **🟢 GO.** Verbleibende Risiken sind operativ adressierbar via UptimeRobot + Runbooks.

**Übergabe an Hirschfeld als Solo-Maintainer:**

- **Vor Phase 1+2+3 + Owner-Onboarding-Session:** **🔴 NICHT empfohlen.** Bus-Factor=1 ohne Operations-Doku ist über 2 Jahre fragil.
- **Nach Phase 1+2+3 + 1×Owner-Recherche-Session + 1×Hirschfeld-Walkthrough-Session:** **🟢 GO.** Repo enthält dann alles, was ein Solo-Maintainer am Sonntag-23-Uhr braucht.

**Letzter Satz:**

Das System ist ein architektonisch durchdachter Re-Build (V1→V2) mit hochwertiger Engineering-Substanz, operationaler Kindheit und einer Test-Suite, die Bug-Detection nicht leistet. Phase-1-Roadmap (~1 Personenwoche) ist die niedrigschwellige Hochskalierung von „funktioniert im Beobachtungsmodus" auf „kann öffentlich laufen". Phase-2+3 (~3 weitere Personenwochen) sind die Hochskalierung auf „läuft 2 Jahre selbständig". Beides ist ohne KMS, ohne Vault, ohne Kubernetes, ohne Datadog erreichbar — passend zu HSBI-Realität (Plesk + Free-Tier + Solo-Owner).

Audit V2 abgeschlossen. Owner-Roadmap in 4 Wochen ausführbar.
