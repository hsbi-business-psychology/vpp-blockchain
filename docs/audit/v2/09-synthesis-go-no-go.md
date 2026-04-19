# Bereich 9 — Synthesis & Go/No-Go (zweiter Pass)

**Auditor:** Senior Engineering Manager (extern, dritter Lese-Durchgang über alle 8 Deep-Dives)
**Datum:** 2026-04-19
**Scope:** Re-Synthese der Findings aus `01-bereich-1` bis `08-bereich-8` mit dem Ziel, zwei klar getrennte Verdicts zu produzieren — **Studi-Testrun (Tage)** und **2-Jahre-Produktivbetrieb (unbeobachtet)** — plus eine ausführbare 24-Stunden-Fix-Sequenz.

> Diese Datei ist die finale Synthese: sie **dedupliziert** die 96 Findings auf 18 Master-Items, **re-priorisiert** sie nach Blast-Radius × Wahrscheinlichkeit × Reparatur-Kosten und gibt zwei Verdicts mit explizit benannten Inkompatibilitäten.

---

## Executive Summary

Das System ist ein architektonisch sauberer V1→V2-Re-Build mit hochwertiger Code-Substanz, aber operationaler Kindheit: 96 Findings dedupen sich auf 18 Master-Items, davon **9 Architektur-Cluster** (struktureller Defekt, der nur durch koordinierten Refactor weggeht) und **9 Operations-/Polish-Cluster** (additiv adressierbar). Für einen **3-tägigen, beobachteten Studi-Testrun** mit ≤30 Studis sind 7 Master-Items Hard-Blocker — alle in einer 8–10-Stunden-Fix-Sequenz adressierbar; nach dieser Sequenz bleiben 2 Architektur-Risiken offen, die durch Beobachtung im Test-Run kompensierbar sind. Für **2 Jahre unbeobachteten Produktiv-Betrieb** sind zusätzliche 4 Architektur-Cluster (Auth-Replay, Multi-Worker-Race, Backup, Cold-Sync-Crash) **unverhandelbar** und brauchen ~12–15 Personentage staged über 4–6 Wochen — das sind Joris' Investitionen für 2 Jahre Ruhe, die er HEUTE nicht alle leisten kann. Eine **V3-Re-Deployment-Pflicht** entsteht spätestens, wenn entweder F1.2 (`LastAdmin`-via-`revokeRole`-Bypass) ein realer Vorfall wird, F1.4 (HMAC-Distribution) architektonisch geheilt werden soll, oder ein State-Feld benötigt wird, das nicht in `__gap[40]` passt — realistischer Horizont 12–18 Monate. Der Bus-Factor-Test (Hirschfeld 3 Wochen solo, 2-h-Patch ohne Joris) **scheitert heute**, geheilt mit 1 h Owner-Recherche-Session + 1 h Onboarding-Dokumentation. Verdicts sind **kompatibel mit klarem Stage-Plan**: GO Testrun nach 24-h-Sequenz, GO 2-Jahre nach Phase-2-Abschluss bis Q3/2026 — sind sie **inkompatibel**, wenn Joris heute "Testrun fertig + 2 Jahre weglaufen lassen + nichts mehr machen" verspricht. Die ehrliche Einordnung: **HEUTE Testrun-fertig kostet ~10 h, 2-Jahre-Ruhe kostet ~3 PW staged — beides ist erreichbar, aber nicht in einem Tag.**

---

## Master-Findings (dedupliziert, kategorisiert, mit Cross-Refs)

Findings sind **nach Blast-Radius × Wahrscheinlichkeit** sortiert (höchste zuerst). Die alten Bereich-Severities werden, wo Kontext es ändert, neu zugewiesen — diese Re-Klassifikation ist explizit markiert.

### Kategorie A — Sofortige Bombe (Live-Key, kein Architektur-Aufwand)

#### M1 — Live-Mainnet-Minter-PK in `probe.mjs` (Klartext, untracked, lokal)

**Original:** F2.1 (🔴) · **Re-Severity:** 🔴 Blocker (unverändert) · **Aufwand:** 5 min purge, optional 4 h Rotation
**Cross-Refs:** OD-2.B (Plesk-Klartext-Akzeptanz schützt nicht vor zusätzlichen Klartext-Wohnorten), F8/T8.1 (CI-Key-Scan verhindert Wiederholung)
**Blast-Radius:** Total-On-Chain-Take-Over (Minter+ADMIN_ROLE in OD-2.A) · **Wahrscheinlichkeit (2 Jahre):** ~1 (5 Leak-Pfade, jeder einzelne mit P>10⁻³ pro Operation)
**Owner-Begründung:** Standalone, kein Architektur-Risiko — pure Hygiene-Versäumnis.

---

### Kategorie B — Auth-Architektur (struktureller Replay-Defekt, ein Block)

#### M2 — Auth-Modell ist 5-Min-Bearer-Token (kein Server-Side-Nonce, keine Operation-Bindung, kein Body-Hash)

**Originals:** F6.1 + F6.2 + F6.3 (alle 🔴) · **Re-Severity:** 🔴 Blocker für 2-Jahre, 🟠 Major für 3-Tage-Testrun (siehe Begründung) · **Aufwand:** 4–5 PT als ein PR
**Cross-Refs:** F6.7 (Sig im React-State, gleiches Root-Cause), F6.11 (5-min-Window verstärkt), F5.2 (Auth-Loop verschärft, weil Sig-Re-Use Auto-Retry rechtfertigt), ADR-0005 fehlt
**Blast-Radius:** Cross-Operation-Take-Over via einer geleakten Sig (Plesk-Log-Read, Phishing in anderer DApp, React-DevTools, Browser-Extension) · **Wahrscheinlichkeit (3-Tage-Testrun, beobachtet):** niedrig — kein Plesk-Log-Read, keine fremden DApps, Sig-Window 5 min · **Wahrscheinlichkeit (2 Jahre, unbeobachtet):** geht gegen 1 (jede neue DApp die Studis besuchen, jede Plesk-Log-Rotation, jedes Pair-Programming)
**Re-Klassifikation-Begründung:** Im 3-Tage-Test-Run mit Owner-Anwesenheit ist die Wahrscheinlichkeit eines Sig-Leaks niedrig genug, dass eine **dokumentierte Risiko-Akzeptanz** vertretbar ist. In 2 Jahren unbeobachtet ist die Akzeptanz fahrlässig.
**V3-Trigger:** Wenn Server-Side-Nonce on-chain abgebildet werden soll (Variante mit `mapping(address => uint256) nonces` im Contract), ist das ein UUPS-Upgrade — nicht zwingend, weil die Off-Chain-Variante reicht; aber eine On-Chain-Implementation würde Plesk-Tenant-Read-Risiko eliminieren.

---

### Kategorie C — Daten-Verlust- und Konsistenz-Cluster (Ops-Critical für 2 Jahre)

#### M3 — Backup-Strategie für `data/*.json` fehlt komplett

**Originals:** F4.3 (🔴) + F7.3 (🟠 in Bereich 7, doppelt-zählend) · **Re-Severity:** 🔴 Blocker für 2-Jahre, 🟠 Major für Testrun · **Aufwand:** 1 PT (GHA-Backup-Workflow) + 30 min Restore-Test
**Cross-Refs:** F2.6 (security.md-Plesk-Snapshot-Lüge), F4.7+F4.13 (Cache-Konsistenz), `disaster-recovery.md` (Runbook bereits geliefert, aber Backup-Daten fehlen)
**Blast-Radius:** `survey-keys.json`-Verlust = 100 % Total-Outage 2–3 Tage (alle aktiven Surveys tot bis Manuelle Re-Generation aller Keys an alle SoSci-Operatoren); `used-nonces.json`-Verlust = unwiderruflicher Replay-Schutz weg (Doppel-Claim mit Token-Re-Use bis zum Ende der Survey-Lifetime möglich) · **Wahrscheinlichkeit (3-Tage-Testrun):** ~10⁻³ (kein Plesk-Restart geplant) · **Wahrscheinlichkeit (2 Jahre):** ~0,3 (Plesk-Disk-Crash, fehlerhafter Restore, Tenant-Migration; HSBI-IT-historisch: ja, passiert)

#### M4 — Multi-Worker-Race auf `data/*.json` Disk-Stores

**Originals:** F4.1 + F4.2 (beide 🔴) + F4.14 (⚪, Subset) · **Re-Severity:** 🔴 Blocker für 2-Jahre falls Plesk ≥2 Workers, 🟡 Minor falls Plesk = 1 Worker · **Aufwand:** 1 PT (`proper-lockfile`) ODER 5 min (Plesk-Single-Worker-Pin via `passenger_max_instances 1`)
**Cross-Refs:** F4.5 (chmod, gleiche Plesk-Threat-Surface), F4.10 (Write-Amplification verstärkt Race-Window), F7.10 (Owner-Recherche-Pflicht zu Worker-Anzahl)
**Blast-Radius:** F4.1: Replay-Schutz lückenhaft (Token-Leak + Race öffnet HMAC-Architektur, die das eigentlich verhindern soll) · F4.2: 100 % Survey-Outage bis manuelle Key-Rotation (zwei Worker schreiben parallel, Last-Write-Wins, einer der Studis hat dann den falschen Key)
**Owner-Recherche-Pflicht:** Wenn Plesk-Default `passenger_min_instances=1` und Klassen-Run-Last ≤30 RPS bleibt, ist der Race praktisch ausgeschlossen — dann ist M4 ein 🟡-Minor und Single-Worker-Pinning der billigste Fix. Ohne Recherche bleibt es 🔴, weil Plesk-Default unbekannt.

#### M5 — Cold-Sync-Crash-Loop bei Backup-Restore oder `CONTRACT_DEPLOY_BLOCK=0`

**Originals:** F3.2 (🟠) + F3.7 (🟡, sequenziell) + F4.4 (🟠, gleicher Pfad aus Bereich 4) · **Re-Severity:** 🟠 Major für 2-Jahre, 🟡 Minor für Testrun (kein Restart geplant) · **Aufwand:** 4 h
**Cross-Refs:** F3.1 (Cross-Provider-Mismatch verstärkt das Problem), F4.3 (ohne Backup tritt M5 nie ein, mit Backup ist M5 sofort relevant), `disaster-recovery.md` (Runbook erwähnt das, aber Code-Fix fehlt)
**Blast-Radius:** Backend bootet endlos, Plesk-Passenger restart-loop, Service tot bis manueller Eingriff · **Trigger:** jeder Disk-Restore aus Backup ODER Plesk-Tenant-Migration ODER versehentliches `CONTRACT_DEPLOY_BLOCK=0`-Reset im Plesk-Panel
**V3-Trigger:** keiner — reines Backend-Code-Issue

#### M6 — Cross-Provider Block-Number-Mismatch

**Originals:** F3.1 (🟠) + F3.6 (🟡) · **Re-Severity:** 🟠 Major (unverändert) · **Aufwand:** 1 PT
**Cross-Refs:** F4.6 (Reorg-Robustheit, gleicher `events.json`-Korruptionspfad), F4.7 (`lastSyncedBlock > latestBlock` Silent-Mask)
**Blast-Radius:** permanente Event-Lücke im Cache (provider vs. eventProvider liefern unterschiedliche `getBlockNumber()`-Antworten) · Konkrete Folge: Frontend zeigt N Punkte, BaseScan zeigt N+revokierte = Vertrauensbruch beim ersten Support-Ticket

---

### Kategorie D — Frontend-Wallet-Lifecycle (Studi-Realität)

#### M7 — Klartext-Privatekey-Export ohne Keystore-V3-Verschlüsselung

**Original:** F5.1 (🔴) · **Re-Severity:** 🔴 Blocker für 2-Jahre, 🟡 Minor für 3-Tage-Testrun · **Aufwand:** 1 PT
**Cross-Refs:** F5.7 (Permanenz-UX), F5.4 (iOS-ITP)
**Blast-Radius:** ~60 kompromittierbare Studi-Wallets über 2 Jahre (Cloud-Sync, Mail-Postfach, gestohlene Devices ohne Disk-Encryption) · **Re-Klassifikation:** Im 3-Tage-Run claimt der Studi sofort und löscht die Wallet danach — Cloud-Sync-Window ≤3 Tage, Wahrscheinlichkeit eines Leaks vernachlässigbar.

#### M8 — Safari-iOS-ITP purged Wallet nach 7 Tagen Inaktivität

**Original:** F5.4 (🔴) · **Re-Severity:** 🔴 Blocker für 2-Jahre, ⚪ Nit für 3-Tage-Testrun · **Aufwand:** 1 PT (FAQ + Banner + Recovery-Pfad in Claim-Page)
**Cross-Refs:** F5.7 (Permanenz-UX-Cluster), `sosci-onboarding.md` (Lehrenden-Workflow)
**Blast-Radius:** ~600+ verlorene Wallets über 2 Jahre (30 % iOS × 50 % Inaktivitäts-Wahrscheinlichkeit × 4000 Wallet-Lebenszyklen) · **Re-Klassifikation:** 7-Tage-Window ist im 3-Tage-Run komplett ausgeschlossen.

#### M9 — Admin-Auth Infinite-MetaMask-Popup-Loop bei Rejection

**Original:** F5.2 (🔴) · **Re-Severity:** 🔴 Blocker (unverändert für beide Szenarien — UX-Komplettausfall) · **Aufwand:** 4 h
**Cross-Refs:** F6.7 (Sig-im-State-Pattern), F8.4 (Test-Lücke ist Grund warum es shipped wurde)
**Blast-Radius:** Owner/Admin-Lockout aus Admin-Dashboard bis Browser-Tab-Close · **Wahrscheinlichkeit:** ~1 pro Owner-Session, weil ein einziges versehentliches "Cancel" reicht

---

### Kategorie E — Frontend-XSS-Defense (CSP-Cluster, Defense-in-Depth)

#### M10 — CSP-Lückenkomplex (Plesk-Static-Bypass + fehlende Modern-Direktiven)

**Originals:** F5.3 (🔴) + F5.5 + F5.6 + F5.10 + F5.12 (alle 🟠/🟡) · **Re-Severity:** 🟠 Major für beide Szenarien (kein bekannter XSS heute, aber Defense-in-Depth-Lücke) · **Aufwand:** 4 h
**Cross-Refs:** F5.9 (i18n `escapeValue:false` ohne ESLint), F5.8 (`connect-src` 14 ungenutzte Provider), F5.11 (`console.error` leakt Backend-Pfade)
**Blast-Radius:** Wenn jemals ein XSS gefunden wird (PR mit `dangerouslySetInnerHTML`, übersetzte Strings mit HTML), keine Defense-Schicht da — direkter Zugriff auf alle in localStorage gespeicherten Wallet-Keys + Admin-Sigs · **Live-Verifikation der CSP-Plesk-Bypass-Hypothese ausstehend** (`curl -I https://vpstunden.hsbi.de/` als 5-Min-Smoke-Test)

---

### Kategorie F — Operations-Cluster (Monitoring, Runbooks, Bus-Factor)

#### M11 — Operations-Vakuum: kein externes Monitoring + Runbook-Konstanten leer

**Originals:** F7.1 (🔴, externes Monitoring fehlt) + F7.2 (🔴, Runbooks fehlen — jetzt da, aber Konstanten leer) + F7.7 (🟡, Bus-Factor) + F7.10 (🟡, Plesk-Log-Pfad) · **Re-Severity:** 🔴 Blocker für beide Szenarien · **Aufwand:** 30 min UptimeRobot + 1 h Owner-Plesk-Recherche-Session
**Cross-Refs:** F2.4 (Balance-Alerting in den gleichen Plesk-Cron), F2.9 (ETH-Refill-Doku — Runbook bereits da), `docs/runbooks/README.md` (Konstanten-Tabelle leer mit `<EINTRAGEN>`)
**Blast-Radius:** Service kann 12 h tot sein ohne Detection, einzige Detection ist Studi-E-Mail an Lehrenden · **Bus-Factor-Verstärker:** Hirschfeld findet im Repo keine Plesk-URL, keinen DEFAULT_ADMIN-Wallet-Hinweis, keine Coinbase-Owner-Info → Patch-Pfad blockiert (siehe Bus-Factor-Test unten)

#### M12 — Gas-Drain-Vektor (kein `maxFeePerGas`-Cap + nutzlos dimensionierter `MIN_BALANCE_WEI` + kein Alerting)

**Originals:** F2.3 (🟠) + F2.4 (🟠) · **Re-Severity:** 🔴 Blocker für 3-Tage-Testrun, 🟠 Major für 2-Jahre · **Aufwand:** 2 h
**Cross-Refs:** F2.9 (ETH-Refill — Runbook da), `eth-refill.md`
**Blast-Radius:** Eine NFT-Spike-Welle auf Base (mehrfach 2024–2025 dokumentiert) während Klassen-Run = Wallet in 1–2 Tx leer, restliche 28 Studis sehen 503 INSUFFICIENT_FUNDS. Keine Detection außer Slack-Nachrichten · **Re-Klassifikation:** Für 3-Tage-Testrun ist ein Spike-Hit besonders schmerzhaft, weil Owner Reaktionsfenster ≤10 min braucht und keine BaseScan-Watchlist konfiguriert ist.

#### M13 — Plesk-Tenant-Read-Cluster (Logger-Redact, File-Permissions, Log-Hygiene)

**Originals:** F2.5 (🟠) + F4.5 (🟠) + F6.4 (🟠) · **Re-Severity:** 🟠 Major für beide Szenarien (gleiche Wurzel: HSBI-Plesk-Tenant-Modell) · **Aufwand:** 30 min (alle drei in einem PR)
**Cross-Refs:** OD-2.B (Plesk-Klartext-Akzeptanz erfordert genau diese Mitigation als Pflicht), F2.7 (Format-Validierung verhindert Klartext-Key-im-Stack-Trace)
**Blast-Radius:** Wer Plesk-Filesystem-Read hat, sieht Minter-Key (Plesk-Panel-ENV) **plus** HMAC-Keys (`survey-keys.json`) **plus** Live-Sigs in Access-Logs · **Owner-Decision:** OD-2.B akzeptiert das Plesk-Modell; aber genau diese Akzeptanz macht Logger-Redact + chmod 0600 + Header-Redact zur Pflicht.

#### M14 — Recovery-Pfad-Lücke (Minter-Compromise + Doku-Lügen + LastAdmin-Bypass)

**Originals:** F2.2 (🔴) + F2.6 (🟠) + F1.2 (🟠, LastAdmin via revokeRole) · **Re-Severity:** 🟠 Major für Testrun (Owner anwesend), 🔴 Blocker für 2-Jahre · **Aufwand:** 1–2 PT (Runbook ✓ erstellt, security.md-Refactor 2–3 h, F1.2-UUPS-Upgrade 1 PT)
**Cross-Refs:** OD-2.A (Minter-mit-ADMIN_ROLE-Akzeptanz erfordert Recovery-Plan als Pflicht), `key-rotation.md` (Runbook bereits da, Konstanten leer)
**Blast-Radius:** Ohne Recovery-Plan + bei kompromittiertem Minter = ad-hoc-Improvisation während Stress = Wahrscheinlichkeit für falschen Schritt 50 %+ · **F1.2-Trigger:** ein einziger BaseScan-Klick auf `revokeRole` statt `removeAdmin` durch den letzten Admin = kompletter Lockout = nur per UUPS-Upgrade lösbar (1–2 Tage Re-Implementation + Test + Deploy)

---

### Kategorie G — Test-Coverage-Mechanismus (Maintainer-Wechsel-Schutz)

#### M15 — Test-Theatre: keine enforced Coverage + Production-Rate-Limiter ungetestet + 27 kritische Pfade ungetestet

**Originals:** F8.1 + F8.2 + F8.3 (alle 🔴) + F8.4 + F8.6 + F8.7 (alle 🟠) · **Re-Severity:** 🟠 Major für 3-Tage-Testrun, 🔴 Blocker für 2-Jahre · **Aufwand:** Phase-1-Subset 1 PT (Coverage-Schwellen aktivieren + Rate-Limiter-Test + 64-hex-CI-Step), Phase-2-Rest 5 PT (alle 27 Test-Lücken)
**Cross-Refs:** F8.5 (i18n-Mock-Tautologie, Cluster mit M16), `08-bereich-8-tests-ci.md` (36-Item-Test-Backlog priorisiert)
**Blast-Radius (3-Tage):** Wenn ein letzter Refactor-Commit eine Regression eingeführt hat, fängt es niemand · **Blast-Radius (2 Jahre):** Hirschfeld in 18 Monaten kann ohne Tests nicht erkennen, ob sein Refactor eine Bereich-X-Regression einführt — Test-Mechanismus ist die einzige durchhaltbare Knowledge-Übergabe-Form

---

### Kategorie H — V2.1-Smart-Contract-Polish (UUPS-Upgrade-Bündel)

#### M16 — Smart-Contract-Polish-Bündel für V2.1

**Originals:** F1.2 (🟠, LastAdmin — siehe auch M14) + F1.3 (🟠, Doku-Inkonsistenzen — siehe auch M19) + F1.5 (🟠, OZ-Manifest-Filename) + F1.6 (🟡) + F1.7 (🟡) + F1.9 (🟡) + F1.10 (⚪) + F1.11 (⚪) · **Re-Severity:** 🟠 Major für 2-Jahre, 🟡 Minor für 3-Tage-Testrun · **Aufwand:** 1 PT für UUPS-Upgrade + Tests + Doku
**Cross-Refs:** ADR-0004 (V2-Architektur), `scripts/upgrade-v2.ts` fehlt (F1.3)
**Blast-Radius:** F1.5 ist die einzige unbekannte Größe — wenn das OZ-Storage-Manifest-Filename-Plugin-Mismatch besteht, läuft jeder zukünftige UUPS-Upgrade ohne Storage-Layout-Validierung → Korruption aller Mappings beim ersten neuen State-Var · **V2.1-Pflicht-Trigger:** vor dem nächsten Upgrade muss F1.5 verifiziert sein (15 min Live-Test); F1.2 Fix ist ohne externen Trigger optional, aber nach erstem `revokeRole`-Vorfall zwingend

#### M17 — HMAC-Key-Distribution an SoSci-Operator (Trust-Boundary-Architektur)

**Originals:** F1.4 (🟠) + F4.12 (🟡, kein Audit-Log auf Key-Reads) + F6.10 (🟡, Hard-Cutoff bei Rotation) · **Re-Severity:** 🟠 Major für 2-Jahre (HSBI-Datenschutz-relevant), 🟡 Minor für 3-Tage-Testrun (Owner kennt SoSci-Operator) · **Aufwand:** Variante C+D (Threat-Model dokumentieren + aktive Rotation): 4 h · Variante A (Server-Side-Include): 2 PT · Variante B (Backend-Token-Mint-Endpoint): 3 PT
**Cross-Refs:** ADR-0004 (Threat-Model erwähnt SoSci-Trust-Boundary nicht), `sosci-onboarding.md` (Runbook erwähnt Lifecycle aber nicht Key-Rotation-Standardflow)
**V3-Trigger:** Variante B (Backend-Token-Mint-Endpoint) wäre eine architektonische Verschiebung, die das HMAC-Verteilungs-Modell vereinfacht aber nicht zwingend einen Contract-Upgrade braucht — Off-Chain-Refactor reicht.

---

### Kategorie I — Polish & Doku-Konsolidierung

#### M18 — Operations-Polish-Bündel (NonceManager + Doku-Drift + Refill + Reorg + Misc)

**Originals:** F2.7 + F2.8 + F2.9 + F2.10 + F3.4 + F3.5 + F3.8 + F3.9 + F3.10 + F3.11 + F4.6 + F4.7 + F4.8 + F4.9 + F4.10 + F4.11 + F4.13 + F1.8 + F5.7 + F5.8 + F5.9 + F5.11 + F5.13 + F5.14 + F6.5 + F6.6 + F6.7 + F6.8 + F6.9 + F6.11 + F6.12 + F7.4 + F7.5 + F7.6 + F7.8 + F7.9 + F7.11 + F7.12 + F8.5 + F8.8 + F8.9 + F8.10 + F8.11 + F8.12 (mehrheitlich 🟡/⚪) · **Re-Severity:** 🟡/⚪ (verteilt) · **Aufwand:** 5–10 PT verteilt über 2 Jahre als laufende Wartung
**Cross-Refs:** Alle 8 Bereich-Reports
**Begründung für Bündelung:** keiner dieser Findings ist einzeln Test-Run-relevant; jeder einzelne ist im Kontext von M2/M3/M11/M14 als Cluster-Beigabe abdeckbar; sie als 18. Master-Item zu führen verhindert, dass sie in der Synthese verschwinden, ohne sie einzeln zu litigieren.

---

## Master-Findings — Severity-Tally re-priorisiert

| Master                      | Original-Findings                         | Original-Severities | Re-Severity Testrun                 | Re-Severity 2-Jahre             |
| --------------------------- | ----------------------------------------- | ------------------- | ----------------------------------- | ------------------------------- |
| M1 probe.mjs Live-Key       | F2.1                                      | 🔴                  | 🔴                                  | 🔴                              |
| M2 Auth-Replay-Architektur  | F6.1+F6.2+F6.3                            | 🔴×3                | 🟠 (akzeptierbar mit Beobachtung)   | 🔴 (unverhandelbar)             |
| M3 Backup-Lücke             | F4.3+F7.3                                 | 🔴+🟠               | 🟠 (kein Restart geplant)           | 🔴 (unverhandelbar)             |
| M4 Multi-Worker-Race        | F4.1+F4.2+F4.14                           | 🔴×2+⚪             | 🟡 (1 Worker default) / 🔴 (≥2)     | 🔴 falls keine Pin              |
| M5 Cold-Sync-Crash-Loop     | F3.2+F3.7+F4.4                            | 🟠×3                | 🟡                                  | 🟠                              |
| M6 Cross-Provider-Mismatch  | F3.1+F3.6                                 | 🟠+🟡               | 🟠                                  | 🟠                              |
| M7 Klartext-PK-Export       | F5.1                                      | 🔴                  | 🟡 (3-Tage-Window)                  | 🔴                              |
| M8 iOS-ITP Wallet-Purge     | F5.4                                      | 🔴                  | ⚪ (7-Tage-Window)                  | 🔴                              |
| M9 Admin-Auth-Loop          | F5.2                                      | 🔴                  | 🔴                                  | 🔴                              |
| M10 CSP-Cluster             | F5.3+F5.5+F5.6+F5.10+F5.12                | 🔴+🟠×4             | 🟠                                  | 🟠                              |
| M11 Ops-Vakuum + Bus-Factor | F7.1+F7.2+F7.7+F7.10                      | 🔴×2+🟡×2           | 🔴                                  | 🔴                              |
| M12 Gas-Drain               | F2.3+F2.4                                 | 🟠×2                | 🔴 (Spike-Hit ist Komplett-Run-Aus) | 🟠                              |
| M13 Plesk-Tenant-Read       | F2.5+F4.5+F6.4                            | 🟠×3                | 🟠                                  | 🟠                              |
| M14 Recovery-Pfad-Lücke     | F2.2+F2.6+F1.2                            | 🔴+🟠×2             | 🟠 (Owner anwesend)                 | 🔴                              |
| M15 Test-Theatre            | F8.1+F8.2+F8.3+F8.4+F8.6+F8.7             | 🔴×3+🟠×3           | 🟠 (Subset für CI-Pin)              | 🔴                              |
| M16 V2.1-Polish-Bündel      | F1.2+F1.3+F1.5+F1.6+F1.7+F1.9+F1.10+F1.11 | 🟠×3+🟡×4+⚪×2      | 🟡                                  | 🟠 (vor erstem Upgrade Pflicht) |
| M17 HMAC-SoSci-Trust        | F1.4+F4.12+F6.10                          | 🟠+🟡×2             | 🟡                                  | 🟠                              |
| M18 Polish-Bündel           | 44 weitere Findings                       | mehrheitlich 🟡/⚪  | 🟡                                  | 🟡/⚪                           |

**Konsolidierte Tally re-priorisiert für 3-Tage-Testrun:** 🔴 4 (M1, M9, M11, M12) · 🟠 6 (M2, M3, M6, M10, M13, M14, M15) · 🟡 6 · ⚪ 1
**Konsolidierte Tally re-priorisiert für 2-Jahre:** 🔴 9 (M1, M2, M3, M4, M7, M8, M9, M11, M14, M15) · 🟠 7 (M5, M6, M10, M12, M13, M16, M17) · 🟡 1 (M18) · ⚪ —

Die zentrale Verschiebung: **Auth-Replay (M2) und Backup (M3)** rutschen für den Testrun von 🔴 auf 🟠 (mit Risiko-Akzeptanz), springen aber für 2-Jahre auf 🔴 zurück. **Studi-Wallet-Lifecycle (M7, M8)** ist genau umgekehrt — im Testrun trivial, in 2 Jahren der größte Massenverlust-Treiber.

---

## Verdict 1 — Studi-Testrun (3 Tage, beobachtet, ≤30 Studis)

### Was muss WEG vor dem Testrun

| #   | Master                                                                                       | Aufwand      | Begründung                                               |
| --- | -------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------- |
| 1   | **M1** probe.mjs purgen                                                                      | 5 min        | Bombe sofort entschärfen                                 |
| 2   | **M9** Admin-Auth-Loop fixen                                                                 | 4 h          | Owner kann sonst nicht ins Dashboard nach Sign-Cancel    |
| 3   | **M11** UptimeRobot + Konstanten-Tabelle                                                     | 30 min + 1 h | Sonst Service-Down ohne Detection im Run                 |
| 4   | **M12** Gas-Hard-Cap + MIN_BALANCE_WEI fix + Plesk-Cron                                      | 2 h          | Eine NFT-Spike = ganzer Run hin                          |
| 5   | **M13** Logger-Redact + chmod 0600 + Header-Redact                                           | 30 min       | OD-2.B-Akzeptanz braucht das als Pflicht-Mitigation      |
| 6   | **M15-Subset** Coverage-Schwellen aktivieren + 64-hex-CI-Scan + Production-Rate-Limiter-Test | 1 h          | Verhindert Regression im letzten Vor-Run-Refactor        |
| 7   | **M14-Subset** security.md-Lügen-Refactor (3 wichtigste Punkte) + runbook-Konstanten füllen  | 1 h          | Recovery-Pfad muss greifbar sein wenn Owner mal nicht da |

**Stunden-Summe:** ≈ 9 h (10 h mit Pausen). **Realistisch in 24 h Wall-Clock erreichbar mit Fokus.**

### Was bleibt OFFEN nach 24-h-Sequenz, aber AKZEPTABEL für Testrun

- **M2 Auth-Replay:** Risiko-Akzeptanz dokumentieren — Owner sitzt vor dem Run, beobachtet Plesk-Logs live, Sig-Window 5 min ist zu kurz für realistischen Out-of-Band-Replay durch einen Studi.
- **M3 Backup:** Risiko-Akzeptanz — kein Plesk-Restart geplant, Daten-Verlust-Wahrscheinlichkeit über 3 Tage ≈ 10⁻³.
- **M4 Multi-Worker-Race:** Owner-Recherche-Pflicht zur Plesk-Worker-Anzahl; falls 1 Worker, ist das ein 🟡 ohne weiteren Fix.
- **M5 Cold-Sync:** Risiko-Akzeptanz — Trigger ist Restart, kein Restart geplant.
- **M7 Klartext-PK-Export:** Risiko-Akzeptanz — 3-Tage-Cloud-Sync-Window vernachlässigbar, Owner-Briefing an Studis "nicht in Cloud-Ordnern speichern".
- **M8 iOS-ITP:** komplett irrelevant für 3-Tage-Run.
- **M10 CSP-Lücken:** Risiko-Akzeptanz — kein bekannter XSS, Defense-in-Depth nicht akut.

### Verdict

**🟢 GO Studi-Testrun nach 24-h-Sequenz** — alle 4 Testrun-🔴 sind in einem Arbeitstag schließbar; die verbleibenden 6 🟠 sind durch Owner-Anwesenheit + dokumentierte Risiko-Akzeptanz vertretbar.

**🔴 NO-GO heute, ohne 24-h-Sequenz** — M9 (Admin-Auth-Loop) macht Operator-Reaktionsfähigkeit kaputt, M12 (Gas-Drain) macht ein zufälliger Spike-Hit zum Komplettausfall, M11 (Monitoring) macht Service-Down ohne Detection.

---

## Verdict 2 — 2 Jahre Produktiv (unbeobachtet, 4 Klassen-Runs/Jahr, mehrere SoSci-Operatoren)

### Was ist UNVERHANDELBAR (🟠 → 🔴 wegen 2-Jahre-Wahrscheinlichkeitskumulation)

| #   | Master                                                                                | Aufwand                  | Begründung                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **M2** Auth-Modell mit Server-Side-Nonce + Operation-Bindung + Body-Hash (ADR-0005)   | 4–5 PT                   | Sig-Leak-Wahrscheinlichkeit über 2 Jahre × 4 Runs/Jahr × Plesk-Log-Rotationen × neue DApps der Studis geht gegen 1. Replay-Window 5 min × jedes Endpoint = strukturell unhaltbar.              |
| 2   | **M3** Backup-Workflow GHA + Restore-Test (monatlich CI)                              | 1 PT + laufend           | Über 2 Jahre × Plesk-Tenant-Updates × HSBI-IT-Migrationen ist ein Daten-Verlust quasi sicher. Total-Outage 2–3 Tage und unwiderruflicher Replay-Schutz-Verlust sind nicht 2-jahres-tragfähig.  |
| 3   | **M4** Multi-Worker-Race (Owner-Recherche zuerst, dann Lock ODER Pin)                 | 5 min Pin oder 1 PT Lock | Plesk-Konfiguration kann sich in 2 Jahren ändern. HSBI-IT optimiert mal die `passenger_min_instances`. Dann öffnet sich der Replay-Vektor still.                                               |
| 4   | **M7** Keystore-V3-Export                                                             | 1 PT                     | ~60 kompromittierbare Wallets über 2 Jahre. DSGVO-relevant (Adress-Pseudonym = personenbezogenes Datum nach Erwägungsgrund 26).                                                                |
| 5   | **M8** iOS-ITP Mitigation (FAQ, Banner, Recovery-Pfad)                                | 1 PT                     | ~600+ verlorene Wallets über 2 Jahre. Lehrenden-Reputation hängt daran.                                                                                                                        |
| 6   | **M11** Bus-Factor-Lücke schließen (Owner-Recherche-Session + `operators-private.md`) | 2 h Owner-Zeit           | Hirschfeld muss Critical-Patch in 2 h schaffen können (siehe Bus-Factor-Test).                                                                                                                 |
| 7   | **M14** Recovery-Pfad inkl. F1.2-Fix via UUPS-Upgrade (V2.1)                          | 1 PT                     | F1.2 ist ein 30-Sekunden-Klick im BaseScan-UI, der in 2 Jahren zwangsläufig irgendwann passiert (Vertipper, Refactor, neuer Admin der die Doku falsch liest). Recovery: 1–2 Tage UUPS-Upgrade. |
| 8   | **M15** Vollständiger Test-Coverage-Mechanismus (Phase-2-Test-Sprints)                | 5 PT                     | Mechanismus ist die einzige Art, wie Code-Qualität einen Maintainer-Wechsel überlebt.                                                                                                          |

**Aufwand 2-Jahre-Pflicht (über und neben 24-h-Sequenz):** ~12–15 PT, staged über 4–6 Wochen. Das ist die ehrliche Zahl.

### Was DOKUMENTIERBAR mit Risiko-Akzeptanz (🟠/🟡 für 2 Jahre)

| Master                                  | Empfohlene Akzeptanz-Form                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M5 Cold-Sync**                        | ADR + Runbook-Eintrag: "bei Disk-Restore zuerst `CONTRACT_DEPLOY_BLOCK` auf aktuellen Block setzen, dann Sync starten". Risiko: 1× Owner-Eingriff pro Restore.      |
| **M6 Cross-Provider-Mismatch**          | ADR: "in seltenen Fällen Drift bis zu 30 Sekunden — bei Vertrauensbruch durch Studi-Ticket: Backend-Cache invalidieren via Plesk-Restart". Risiko: <1 Vorfall/Jahr. |
| **M10 CSP-Lücken (Modern-Direktiven)**  | Defense-in-Depth-Lücke, akzeptabel solange `dangerouslySetInnerHTML`/`innerHTML`/`eval` per ESLint-Regel verboten ist.                                              |
| **M13 Plesk-Tenant-Read über Logs**     | OD-2.B-Erweiterung: "Plesk-Tenant-Modell ist außerhalb des Audit-Scopes; Hochschule trägt Verantwortung". Mit Logger-Redact-Pflicht aus 24-h-Sequenz mitigiert.     |
| **M16 V2.1-Polish-Bündel (außer F1.2)** | Akzeptabel bis zum nächsten geplanten Upgrade. Pflicht: F1.5 vor jedem Upgrade verifizieren.                                                                        |
| **M17 HMAC-SoSci-Trust**                | Variante C+D (Threat-Model + aktive Rotation pro Survey-Zyklus). Variante A/B sind Architektur-Investitionen, die HEUTE nicht rentieren.                            |

### Verdict

**🟢 GO 2-Jahre nach Phase 2 (~12–15 PT staged über 4–6 Wochen, abgeschlossen bis Q3/2026)**

**🔴 NO-GO 2-Jahre, wenn HEUTE der Plan ist "24-h-Sequenz fertig, dann nichts mehr machen, einfach laufen lassen"** — M2/M3/M4/M7/M8/M14/M15 sind unverhandelbar, weil über 2 Jahre × kumulative Wahrscheinlichkeit eine gewisse Anzahl Vorfälle praktisch sicher wird.

---

## Verdict-Inkompatibilität — explizit benannt

> **GO Testrun + NO-GO 2-Jahre** ist der wahrscheinliche Status nach der 24-h-Sequenz.
>
> **Damit beide Verdicts GO sind**, muss bis Q3/2026 (4 Monate Frist) Phase 2 (~12–15 PT staged) abgeschlossen sein. Das sind im Einzelnen:
>
> 1. **ADR-0005 Auth-Modell-V2** schreiben + implementieren (M2, ~5 PT, 1 Sprint)
> 2. **Backup-Workflow + monatlicher Restore-Test** (M3, ~1 PT)
> 3. **Multi-Worker-Race-Entscheidung** treffen + implementieren (M4, ~1 PT mit Lock-Variante oder 5 min mit Single-Worker-Pin)
> 4. **Frontend-Wallet-Hardening** Keystore-V3 + iOS-Banner (M7+M8, ~2 PT)
> 5. **F1.2 V2.1-UUPS-Upgrade** (M14-Teil, ~1 PT)
> 6. **Coverage-Schwellen + 27 Test-Lücken Sprint** (M15-Rest, ~5 PT)
> 7. **Owner-Onboarding-Session für Hirschfeld** (M11-Rest, ~2 h Owner)
>
> **Wenn diese 7 Punkte bis Q3/2026 NICHT erledigt sind**, kippt 2-Jahre auf NO-GO. Konkret: jeder Monat unbeobachteter Betrieb nach Q3/2026 ohne diese Items erhöht die Wahrscheinlichkeit eines schwerwiegenden Vorfalls (Daten-Verlust, On-Chain-Compromise, Studi-Wallet-Massen-Verlust) auf >50 %.

### V3-Re-Deployment-Punkt der Unausweichlichkeit

V3 wird unausweichlich, sobald **eines** der folgenden eintritt:

1. **F1.2 wird realer Vorfall** (`revokeRole` durch letzten Admin) — nicht-fixbar ohne Upgrade. Wahrscheinlichkeit über 2 Jahre: ~30 % ohne V2.1-Fix, ~5 % mit V2.1-Fix.
2. **F1.4 architektonisch geheilt** (Variante B: Backend mintet Tokens) — nicht zwingend Contract-Upgrade, aber verschiebt das Trust-Modell so weit, dass eine ADR-Re-Validierung sinnvoll ist; in Praxis löst man das gleichzeitig mit Storage-Layout-Änderungen.
3. **Auth on-chain** (Server-Side-Nonce als `mapping(address => uint256)` im Contract statt im Backend-Disk-Store) — befreit von M4/M13 in einem Schlag, kostet einen Upgrade.
4. **Neues State-Feld nicht in `__gap[40]`** — 40 Slots sind reichlich, aber bei Multi-Token, Survey-Linking, oder On-Chain-Reputation kann es eng werden.
5. **`SurveyPointsV2RecoveryStub.sol`** wird gebaut (M14-Erweiterung) — pre-baked Notfall-Implementation als optionale Pflicht für Bus-Factor-Sicherheit.

**Realistisches V3-Datum:** Q1–Q2/2027, kombiniert mit M2-Auth-Refactor und F1.4-Architektur-Entscheidung. Vorher: V2.1-Upgrade in Q3/2026 für M14-Subset (F1.2).

> **Workaround-Hypothek aus Bereich 1, die in anderen Bereichen nicht hält:** F1.2 (LastAdmin-Bypass) erzwingt einen Bereich-7-Workaround "neue Admins NUR via `addAdmin` granten, NIE manuell via `grantRole`" + Bereich-8-Workaround "Test-Lücke für ADMIN_ROLE-only-Holder schließen" + Bereich-2-Workaround im Recovery-Runbook "wenn revokeRole-Bug ausgelöst wurde, sofort UUPS-Upgrade vorbereiten". Über 2 Jahre × wechselnder Personal × steigender Komplexität halten diese Workarounds nicht — der V2.1-Upgrade ist die eigentliche Lösung. **Termin: Q3/2026, gemeinsam mit M14.**

---

## 24-Stunden-Fix-Sequenz (für HEUTE, in dieser Reihenfolge)

> Reihenfolge nach Dringlichkeit für Test-Run und Anti-Fragility (zuerst die Bombe, dann Detection, dann UX, dann Härtung).

| #   | Item                                                                                                                                                           | Master             | Aufwand   | Wann                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------- | --------------------------- |
| 1   | `rm packages/backend/probe.mjs` (+ optional: Minter-Rotation 4 h, kann Phase-2 sein)                                                                           | M1                 | 5 min     | Sofort, vor allem anderen   |
| 2   | CI: 64-hex-Klartext-Key-Scan in untrackeden Files (`.github/workflows/ci.yml` 5 Zeilen)                                                                        | M15-T8.1           | 30 min    | gemeinsam mit #1            |
| 3   | UptimeRobot 5 Monitore anlegen (`/health/live`, `/health/ready`, `/`, `/admin`, `/claim?s=test`) → Mail an Owner+Hirschfeld                                    | M11                | 30 min    | sofort, läuft parallel      |
| 4   | `runbooks/README.md` Konstanten-Tabelle füllen (Plesk-URL, Minter-Adresse, DEFAULT_ADMIN, BaseScan-API-Key-Lokation, Coinbase-Owner) — Owner-Recherche-Session | M11+M14            | 1 h Owner | sofort, läuft parallel      |
| 5   | `lib/logger.ts` Redact-Konfig + `pino-http` Body-Redact für Header `x-admin-signature`/`-message` (gemeinsamer PR)                                             | M13                | 30 min    | parallel zu #3/#4           |
| 6   | `data/`-Files chmod 0600 + `.htaccess` Deny in `data/`-Ordner                                                                                                  | M13                | 15 min    | parallel                    |
| 7   | `MIN_BALANCE_WEI` korrekt dimensionieren (auf 0,005 ETH) + `balance-monitor.ts` + Plesk-Cron-E-Mail                                                            | M12-Teil           | 1 h       | parallel                    |
| 8   | `TX_OVERRIDES` mit `MAX_FEE_PER_GAS_GWEI=2` als Hard-Cap in allen Write-Pfaden                                                                                 | M12-Teil           | 1 h       | parallel                    |
| 9   | F2.7 `validatePrivateKey` in `config.ts` (verhindert Key-im-Stack-Trace)                                                                                       | M13-Teil           | 30 min    | parallel                    |
| 10  | F5.2 Admin-Auth-Loop: `userRejected`-Catch + `authFailed`-State-Guard in `admin.tsx:100-104`                                                                   | M9                 | 4 h       | KRITISCH, am Stück arbeiten |
| 11  | F2.6 `security.md` 3 wichtigste Lügen korrigieren (Compromise-Impact, MINTER_ROLE-Aussage, Plesk-Snapshot-Behauptung)                                          | M14-Teil           | 1 h       | gegen Ende                  |
| 12  | F6.11 `maxMessageAgeMs` von 5 min auf 60 s reduzieren (`config.ts`)                                                                                            | M2-Teil-Mitigation | 5 min     | gegen Ende                  |
| 13  | F6.6 Rate-Limit-Defaults harmonisieren (Doku ↔ Code, Claim 30/min/IP, API 200/min/IP)                                                                          | M2-Teil-Mitigation | 30 min    | gegen Ende                  |
| 14  | F8.1 Backend `vitest.config.ts` Coverage-Schwellen + Codecov `fail_ci_if_error: true`                                                                          | M15-Teil           | 30 min    | gegen Ende                  |
| 15  | Smoke-Test komplett: deploy → live-CSP-Header `curl -I https://vpstunden.hsbi.de/` prüfen → `/health/diag` lesen → Test-Claim mit eigener Wallet               | Verifikation       | 30 min    | letzter Schritt             |

**Effektive Code-Zeit:** 9 h 25 min. **Wall-Clock mit Pausen + Smoke-Test:** ≈ 10–12 h.

**Reihenfolge-Begründung:** Items 1–4 sind 5–60 min Standalone, parallel erledigbar (Joris an Owner-Recherche, ein zweiter Agent an CI/Monitoring). Items 5–9 sind kleine Code-Edits in einer Sitzung erledigbar, ein PR. Item 10 ist der Brocken, der ungeteilte Aufmerksamkeit braucht (4 h am Stück, sonst Bug). Items 11–14 sind Cool-down. Item 15 ist die nicht-verhandelbare Verifikation, sonst weiß man nicht ob Item 5 wirklich greift.

---

## Akzeptierte Risiken (explizit NICHT zum Fix empfohlen)

> Diese Items sind bewusst nicht in 24-h-Sequenz oder Phase 2 — entweder Aufwand > Nutzen oder Konzept-bedingt.

| Item                                                                | Originals                   | Begründung                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OD-2.A Minter-mit-ADMIN_ROLE**                                    | F1.1, deploy-v2.ts:497-500  | Bewusste Architektur-Entscheidung für Stateless-Relayer-Pattern. Fix wäre separate Admin-Wallet, die alle on-chain Tx selbst signiert — würde die HSBI-Plesk-Realität (kein Hardware-Wallet im Datacenter) sprengen. **Pflicht-Mitigation:** M14 (Recovery-Plan + security.md-Korrektur). |
| **OD-2.B Klartext-Minter-Key in Plesk-Panel-ENV**                   | F2.1-Kontext, deployment.md | KMS/Vault nicht greifbar in HSBI-Plesk-Realität. **Pflicht-Mitigation:** M13 (Logger-Redact + chmod + Header-Redact). Akzeptabel, weil HSBI-Plesk-Operator eigene Sicherheits-Verantwortung trägt.                                                                                        |
| **F1.4 Variante A/B (Server-Side-HMAC oder Backend-Token-Mint)**    | F1.4                        | Variante A bricht Pseudonymität (SoSci ↔ HSBI-Verbindung loggable). Variante B macht das Backend zu Single-Point-of-Pseudonymity-Failure. Variante C+D (Threat-Model + aktive Rotation) ist die rentable Lösung — nicht "fix", aber dokumentierte Akzeptanz.                              |
| **F4.11 Schema-Versioning für JSON-Stores**                         | F4.11                       | Über 2 Jahre erwarten wir 0–1 Schema-Bumps. Ein Migration-Pfad aufzubauen für ein Disk-Store-Format, das wir mittelfristig durch SQLite ersetzen wollen, ist Über-Engineering. Akzeptiert: silent data loss möglich, dokumentiert.                                                        |
| **F6.8 markUsed BEFORE awardPoints (Recovery-Endpoint)**            | F6.8                        | Sicherheitskorrekt fail-closed (Replay-Schutz hat Vorrang vor Studi-Komfort). 1–3 Vorfälle/Jahr × manuelle Owner-Korrektur via `awardPoints`-Direct-Tx ist akzeptabel. Recovery-Endpoint wäre eine zusätzliche Auth-Surface ohne klaren Nutzen.                                           |
| **F8.9 V1-Test-File `SurveyPoints.test.ts` läuft weiter in CI**     | F8.9                        | 30 s CI-Zeit pro Run, aber als Regression-Schutz für eventuelle Backend-Cache-Lese-Pfade auf alten V1-Surveys vertretbar. Löschen wenn V1-Frontend-Surface komplett abgeschaltet ist (Q3/2026).                                                                                           |
| **F7.12 `workflow_dispatch force_full`-Trigger ohne Approval-Gate** | F7.12                       | 2-Personen-Team, Approval-Gate würde Solo-Owner blockieren. Akzeptabel solange Bus-Factor=1; sobald Hirschfeld Push-Rechte bekommt, in `CODEOWNERS` regeln.                                                                                                                               |
| **F5.13/F5.14 Cached Provider/Contract Singleton-Edge-Cases**       | F5.13, F5.14                | Foot-Guns für hypothetische Multi-Chain-Erweiterung — nicht aktuell relevant. Akzeptiert mit Comment im Code.                                                                                                                                                                             |
| **F3.10 CSP `connectSrc` listet 14 Provider**                       | F3.10                       | Frontend nutzt davon 0 direkt, aber die Liste schadet auch nicht (alle whitelisted Origins, kein zusätzliches Angriffs-Surface). Cleanup ist Polishing, nicht Sicherheit.                                                                                                                 |

**Konsequenz für Stakeholder-Kommunikation:** Diese 9 Items werden im AUDIT-LOG.md als "Documented Risk Acceptance" geführt — sie sind nicht "vergessen" oder "geplant", sondern bewusst nicht-gefixt mit oben genannter Begründung. Datenschutz-Beauftragte:r und externe Reviewer:innen können diese Liste als formal akzeptierte Trade-offs lesen.

---

## Long-Term-Backlog (post-Testrun, vor 2-Jahre-Horizont, geordnet)

> Reihenfolge: nach Risiko-Reduktion-pro-Aufwand-Verhältnis. Effort in Personentagen.

| #   | Master / Item                                                                                                      | Aufwand (PT)            | Risiko-Reduktion                               | Trigger                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| 1   | **M3** Backup-Workflow GHA + monatlicher Restore-Test                                                              | 1 + 0,5/Monat           | Eliminiert Total-Outage-Risiko                 | sofort nach Testrun                                        |
| 2   | **M4** Multi-Worker-Recherche + Pin oder Lock                                                                      | 0,1 (Pin) oder 1 (Lock) | Eliminiert Replay-Vektor                       | sofort nach Testrun, Owner-Recherche zuerst                |
| 3   | **M2** Auth-Modell V2 (ADR-0005 + Implementation)                                                                  | 5                       | Eliminiert Cross-Op-Replay-Klasse              | bis Q3/2026                                                |
| 4   | **M14** F1.2 V2.1-UUPS-Upgrade + `upgrade-v2.ts` schreiben                                                         | 1                       | Verhindert LastAdmin-Lockout-Vorfall           | bis Q3/2026; vorher F1.5 OZ-Manifest verifizieren (15 min) |
| 5   | **M7** Keystore-V3-Export                                                                                          | 1                       | ~60 Wallet-Kompromisse über 2 Jahre verhindert | bis Q3/2026                                                |
| 6   | **M8** iOS-ITP Banner + FAQ + Recovery-Pfad                                                                        | 1                       | ~600+ Wallet-Verluste über 2 Jahre verhindert  | bis Q3/2026                                                |
| 7   | **M5** Cold-Sync-Crash-Loop fixen (`getBlockTimestamps` batchen + retry + inkrementelle Persistenz)                | 0,5                     | Eliminiert Restart-Loop nach Backup-Restore    | bis Q4/2026                                                |
| 8   | **M15-Rest** 27 Test-Lücken adressieren (Sprint 2/3/4 aus `08-bereich-8`)                                          | 5                       | Maintainer-Wechsel-Sicherheit                  | bis Q4/2026                                                |
| 9   | **M6** Cross-Provider-Mismatch fixen                                                                               | 1                       | Eliminiert Cache-Drift-Vorfälle                | bis Q4/2026                                                |
| 10  | **M10** CSP-Modern-Direktiven + ESLint-`no-danger`-Regel + i18n-Schema-Lock                                        | 0,5                     | Defense-in-Depth komplett                      | bis Q1/2027                                                |
| 11  | **M16** V2.1 mit F1.2+F1.10+F1.9 (gemeinsamer Upgrade) + Tests + `upgrade-v2.ts`                                   | 1 (kombiniert mit #4)   | Smart-Contract-Polish-Sweep                    | gemeinsam mit #4                                           |
| 12  | **M17** SoSci-Trust-Boundary Variante C+D (Threat-Model in security.md + aktive Rotation in `sosci-onboarding.md`) | 0,5                     | Begrenzt SoSci-Operator-Misuse-Window          | bis Q1/2027                                                |
| 13  | **F4.6** Reorg-Robustheit `events.json` (`txHash`-Dedup)                                                           | 1                       | Verhindert Doppel-Punkte nach Base-Reorg       | bis Q1/2027                                                |
| 14  | **F6.5** `isAdmin`-Cache mit RPC-Failure-Fallback                                                                  | 0,5                     | Admin-Lockout bei RPC-Outage verhindert        | bis Q1/2027                                                |
| 15  | **F7.4** Post-Deploy-Health-Check + Auto-Rollback in `deploy.yml`                                                  | 0,5                     | Deploy-Sicherheit für Maintainer-Wechsel       | bis Q1/2027                                                |
| 16  | **F7.5** TLS-Pinning hard-fail-by-default (`TLS_VERIFY_FAIL_OPEN=false`)                                           | 0,1                     | MITM-Schutz bei Cert-Wechsel                   | bis Q1/2027                                                |
| 17  | **M18** Polish-Bündel (44 Findings, mehrheitlich 🟡/⚪) verteilt                                                   | 5 (laufend)             | Code-Qualität, Doku-Hygiene                    | laufend bis Q4/2027                                        |
| 18  | **V3-Re-Deployment-Vorbereitung** (`SurveyPointsV2RecoveryStub.sol` + V3-Spec-ADR + Migration-Skript)              | 5                       | Bus-Factor-Sicherheit + Architektur-Reife      | bis Q1/2027, gemeinsam mit M2 oder F1.4                    |

**Aufwand Long-Term-Backlog total:** ~25 PT staged über 12–18 Monate. Davon ~12 PT als Phase 2 (Items 1–8) bis Q3/2026 — das ist die 2-Jahre-Verdict-Voraussetzung. Items 9–17 sind Phase 3/4 (Polish + Wartung), Item 18 ist V3-Vorbereitung.

---

## Bus-Factor-Test (re-evaluiert)

**Setup:** Joris ist 3 Wochen offline (Sabbatical, Krankheit, Urlaub). Hirschfeld bekommt um 22:00 Uhr eine UptimeRobot-Mail "VPP `/health/ready` returns 503 since 30 min". Critical-Patch nötig in 2 h.

### Was Hirschfeld TUN MUSS

1. Symptom triagieren via `/health/diag`
2. Backend-Log auf Plesk lesen
3. Wenn Code-Fix nötig: PR + GHA-Deploy
4. Wenn Plesk-Restart-Trick reicht: Plesk-Login + `touch tmp/restart.txt`
5. Wenn ETH leer: Refill via Coinbase
6. Wenn Cert abgelaufen: Plesk-Cert-Renewal
7. Owner informieren via vereinbarten Backup-Channel

### Was er HEUTE im Repo findet (Stand 2026-04-19)

| Schritt                      | Status                                                                                 | Lücke                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Triage via `/health/diag` | ✅ Endpoint existiert, dokumentiert in `runbooks/incident-response.md`                 | —                                                                                                  |
| 2. Plesk-Log lesen           | ❌ Plesk-URL `<EINTRAGEN>` in `runbooks/README.md`; Log-Pfad unbekannt (F7.10)         | Owner-Recherche-Session                                                                            |
| 3. PR + GHA-Deploy           | ❌ Hat Hirschfeld GitHub-Push-Permissions auf `main`? Aktuell nicht dokumentiert       | `CODEOWNERS` + GitHub-Team-Setup                                                                   |
| 4. Plesk-Restart             | ❌ Plesk-Login `<EINTRAGEN>`; falls Joris's 2FA die einzige Quelle ist: ausgeschlossen | `operators-private.md` + Backup-2FA-Codes                                                          |
| 5. ETH-Refill                | ❌ Coinbase-Owner unbekannt; falls Joris's privates Konto: keine Möglichkeit           | Backup-Wallet-Konzept aus `eth-refill.md` (existiert), aber Wallet-Adresse + Funded-Balance fehlen |
| 6. Cert-Renewal              | ❌ Plesk-Login-Voraussetzung wie #4                                                    | siehe #4                                                                                           |
| 7. Owner informieren         | ⚠️ Backup-Channel im Repo nicht definiert                                              | `operators-private.md`                                                                             |

### Verdict Bus-Factor

**🔴 SCHEITERT HEUTE.** Hirschfeld kommt nicht über Schritt 2 hinaus, weil Plesk-URL und Log-Pfad fehlen. Selbst wenn er einen Code-Fix hat, kann er nicht deployen ohne GitHub-Push-Permissions. Selbst wenn deployed, kann er nicht verifizieren ohne Plesk-Login.

### Konkret was fehlt im Repo

1. **`docs/operators-private.md`** (gitignored, in Password-Manager-Vault als Quelle):
   - Plesk-Panel-URL + Login + 2FA-Backup-Codes-Lokation
   - DEFAULT_ADMIN-Wallet-Identität (wer hält den Key, wo)
   - Coinbase-Konto-Owner + Login + 2FA-Backup
   - BaseScan-API-Key-Lokation
   - HSBI-IT-Eskalations-Kontakt + Datenschutz-Beauftragte:r
   - Backup-Channel für Owner-Notify (WhatsApp? Phone?)
2. **`CODEOWNERS`** mit Hirschfeld als Co-Owner für `main`-Branch
3. **GitHub-Team `vpp-maintainers`** mit Push-Rechten und `workflow_dispatch`-Trigger-Permissions
4. **Backup-Wallet** (Hardware-Wallet bei Hirschfeld) mit 0,02 ETH Reserve, dokumentiert in `eth-refill.md`
5. **`runbooks/README.md` Konstanten-Tabelle** vollständig befüllt (Plesk-Log-Pfad, Minter-Adresse, DEFAULT_ADMIN, Proxy-Adresse)
6. **Trial-Run einer Solo-Sunday-Drill** dokumentiert (Hirschfeld macht eine fiktive Critical-Patch-Übung, Owner ist nur via Slack-Read erreichbar; Output: konkrete Lücken die im Drill auffallen)

**Aufwand zur Heilung:** 2 h Owner-Recherche-Session + 1 h `operators-private.md` + 1 h GitHub/CODEOWNERS + 30 min Hardware-Wallet-Setup + 4 h Drill = **~1 Personentag**.

**Mit dieser Investition:** Hirschfeld schafft Critical-Patch in 2 h. Ohne diese Investition: 2-Jahre-Verdict bleibt 🔴 NO-GO, weil Single-Point-of-Failure auf Joris.

---

## Schluss — konkrete Zahlen

Nach Abschluss der **24-Stunden-Fix-Sequenz** (10–12 h Wall-Clock heute):

- **Adressiert:** M1, M9, M11, M12, M13 komplett. M14, M15 als Subset (security.md-3-Lügen, Coverage-Schwellen, 64-hex-CI-Scan, Production-Rate-Limiter-Test offen aber unkritisch). M2 als Mitigation (5-min-Window auf 60 s).
- **Verbleibend für Testrun:** 0 🔴 (alle Testrun-Blocker geschlossen). 6 🟠 (M2-Rest, M3, M6, M10, M14-Rest, M15-Rest) — alle mit dokumentierter Risiko-Akzeptanz vertretbar bei Owner-Anwesenheit.
- **Verbleibend für 2-Jahre:** 7 🔴 (M2 strukturell, M3, M4 falls keine Pin, M7, M8, M14 strukturell, M15 strukturell), 6 🟠 (M5, M6, M10, M13, M16, M17). Bus-Factor-Bedingung 🔴 ungeklärt.

### Konkrete Schluss-Zeile

**`[0] BLOCKERS, [6] MAJORS verbleibend nach 24h-Fix-Sequenz für Studi-Testrun.`**
**`[7] BLOCKERS, [6] MAJORS verbleibend nach 24h-Fix-Sequenz für 2-Jahre-Produktivbetrieb.`**

### Binär

- **GO/NO-GO Studi-Testrun (≤30 Studis, 3 Tage, beobachtet):** 🟢 **GO** nach 24-h-Fix-Sequenz.
- **GO/NO-GO 2-Jahre-Produktivbetrieb (unbeobachtet):** 🔴 **NO-GO** nach 24-h-Fix-Sequenz allein. **🟢 GO**, wenn Phase 2 (~12–15 PT staged über 4–6 Wochen, abgeschlossen bis Q3/2026) zusätzlich umgesetzt wird **und** der Bus-Factor-Test (1 Personentag Owner + Hirschfeld) bestanden ist.

### Joris-spezifische Schluss-Empfehlung

Der Wunsch "heute fertig + 2 Jahre läuft es" ist **nur partiell vereinbar**. Konkret:

- **HEUTE (1 Tag, 10–12 h):** Studi-Testrun ist machbar. ✅
- **HEUTE (3 Tage, 30 h):** Studi-Testrun + Backup-Workflow + F1.2-V2.1-Upgrade + iOS-Banner + Owner-Recherche + Bus-Factor-Setup wären machbar. Das wäre **80 % der 2-Jahre-Pflicht** in 3 Tagen erledigt. Verbleibend: M2 Auth-Refactor (5 PT) und M15-Test-Sprint (5 PT) — beide brauchen ungeteilte Konzentration und sind nicht in 3 Tagen sinnvoll machbar.
- **HEUTE 1 Tag + 2 Wochen Spät-Sprints (3 PW total):** Vollständige 2-Jahre-Sicherheit. Das ist die ehrliche minimale Investition für "danach Ruhe".
- **NUR 24-h-Sequenz, dann nichts mehr:** Testrun läuft, danach erodiert das System messbar — Bereich-2-Recovery-Pfad ist nur halb da, Bereich-4-Backup fehlt, Bereich-6-Auth bleibt 5-Min-Bearer-Token, Bereich-8-Coverage-Mechanismus fehlt. **In 6–9 Monaten ist der erste echte Vorfall realistisch.**

> **Die ehrliche Antwort auf die Frage "3 Tage länger braucht aber dafür 2 Jahre Ruhe":** Ja, das stimmt für den Großteil der Items. 3 Tage statt 1 Tag investiert deckt M3 (Backup), M14 (V2.1-Upgrade), M8 (iOS-Banner), M11 (Bus-Factor) ab — das ist der größte Risiko-Reduktion-pro-Tag-Hebel. Die verbleibenden 2 PW (M2 Auth-Refactor + M15 Test-Sprint) brauchen Konzentration und sind besser in zwei separaten Spät-Sprints im Mai/Juni als heute am Stück. Aber: **3 Tage HEUTE statt 1 Tag bringt definitionsgemäß 80 % der 2-Jahre-Sicherheit**, und das ist der ehrliche Anwesensaufwand für "ich will das jetzt zumachen".
