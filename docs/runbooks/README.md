# VPP Operations Runbooks

Dieser Ordner enthält **ausführbare Anleitungen** für alle operativen Standard-Situationen. Sie sind so geschrieben, dass eine Person ohne Senior-Engineer-Wissen sie Schritt-für-Schritt abarbeiten kann (Solo am Sonntagabend, Owner nicht erreichbar).

## Wann welcher Runbook?

```
"VPP funktioniert nicht / ist langsam / wirft Fehler"
   → incident-response.md

"Backend-Wallet hat zu wenig ETH"
   → eth-refill.md

"MINTER_PRIVATE_KEY könnte kompromittiert sein"
   → key-rotation.md

"Plesk-Server ist tot / data/ ist weg / wir müssen restoren"
   → disaster-recovery.md

"Letzter Deploy ist kaputt, Service down"
   → deploy-rollback.md

"Neue:r Lehrende:r will VPP für eigene Studie nutzen"
   → sosci-onboarding.md
```

## Eskalations-Tree

| Stufe               | Wann                                                        | Wer                                                 | Wie kontaktieren                   |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| **1. Self-Service** | Standard-Vorfall (Backend down, Wallet leer, Cert-Issue)    | Operator (du)                                       | Folge dem passenden Runbook oben   |
| **2. Owner**        | Runbook-Schritte erschöpft, Service immer noch down >30 min | siehe `docs/operators-private.md` (sofern angelegt) | WhatsApp/Phone (sofern hinterlegt) |
| **3. HSBI-IT**      | Plesk-Account-Lockout, Domain-/DNS-Issue, Hardware-Defekt   | siehe `docs/operators-private.md`                   | siehe `docs/operators-private.md`  |
| **4. Datenschutz**  | Verdacht auf Daten-Manipulation / Schlüssel-Compromise      | HSBI-Datenschutzbeauftragte                         | siehe `docs/operators-private.md`  |

## Standing Operating Reflexes

Vor jedem Klassen-Run (≥ 1 h vorher) prüfen:

- [ ] `https://vpstunden.hsbi.de/api/v1/health/ready` → HTTP 200 + `lastSyncedBlock` < 60 s alt
- [ ] BaseScan: Minter-Wallet-Balance ≥ 0,005 ETH (ca. 30 Tx Reserve)
- [ ] BaseScan: keine unerwarteten Tx in den letzten 24 h auf Minter / Proxy / DEFAULT_ADMIN-Wallet
- [ ] Letzter erfolgreicher GHA-Deploy: < 7 Tage alt (sonst evtl. Drift) — siehe Repo Actions-Tab
- [ ] UptimeRobot Status-Page (sofern eingerichtet): alle grün

## Halbjährlicher Review

(Siehe `docs/audit/v2/07-bereich-7-deployment-ops.md` Phase 4)

- [ ] Jeden Runbook einmal trockenlaufen lassen → veraltete Werte finden
- [ ] `docs/operators-private.md` aktualisieren bei Personalwechsel
- [ ] BaseScan-Watchlist-Adressen prüfen (Wallet-Wechsel?)
- [ ] Backup-Restore-Test durchführen (`disaster-recovery.md` auf Test-Instanz)
- [ ] ADR-Vollständigkeit prüfen (neue Owner-Decisions?)
- [ ] Plesk-Cron für Balance-Watch noch aktiv? (Plesk → Tools → Scheduled Tasks)

## Wichtige Konstanten (Plesk-Instanz `vpstunden.hsbi.de`)

> **Hinweis:** Werte mit `<EINTRAGEN>` müssen nach Plesk-Verifikation einmal gesetzt werden. Owner sollte das nach Lesen aller Runbooks in einer 30-min-Session erledigen.

| Konstante                 | Wert                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| Plesk-Panel-URL           | `<EINTRAGEN, z.B. https://hosting.hsbi.de:8443/>`                 |
| App-Pfad auf Plesk        | `/httpdocs/` (Anwendungsstamm)                                    |
| Backend-Pfad              | `/httpdocs/packages/backend/`                                     |
| Restart-Trigger           | `touch /httpdocs/packages/backend/tmp/restart.txt`                |
| Passenger-Log-Pfad        | `<EINTRAGEN nach F7.10-Recherche>`                                |
| Health-URL `/live`        | https://vpstunden.hsbi.de/api/v1/health/live                      |
| Health-URL `/ready`       | https://vpstunden.hsbi.de/api/v1/health/ready                     |
| Health-URL `/diag`        | https://vpstunden.hsbi.de/api/v1/health/diag                      |
| Frontend-URL              | https://vpstunden.hsbi.de/                                        |
| Proxy-Contract (V2)       | `<EINTRAGEN, z.B. 0x8b8E...>`                                     |
| BaseScan-Proxy-Link       | https://basescan.org/address/`<PROXY_ADDRESS>`                    |
| Minter-Wallet-Adresse     | `<EINTRAGEN>`                                                     |
| DEFAULT_ADMIN-Wallet      | `<EINTRAGEN>` (wer-hält-was: siehe `operators-private.md`)        |
| BaseScan-API-Key-Lokation | `<EINTRAGEN, z.B. 1Password "VPP Operations">`                    |
| GHA-Deploy-Workflow       | `.github/workflows/deploy.yml` (push:main oder workflow_dispatch) |
| Last-Known-Good-Tag       | `last-known-good` (siehe `deploy-rollback.md`)                    |

## Audit-Status

Die in diesen Runbooks dokumentierten Verfahren basieren auf den Findings aus `docs/audit/v2/`. Insbesondere:

- **Minter-Compromise-Recovery**: F2.2 (Bereich 2)
- **ETH-Refill**: F2.9 (Bereich 2)
- **Key-Rotation**: F2.2 (Bereich 2), Owner-Decision OD-2.A
- **Backup/Restore**: F4.8 (Bereich 4) + F7.3 (Bereich 7)
- **Incident-Response**: F7.1 + F7.2 (Bereich 7)
- **Deploy-Rollback**: F7.4 (Bereich 7)
