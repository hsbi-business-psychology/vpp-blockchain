# VPP Operations Runbooks

Dieser Ordner enthält **ausführbare Anleitungen** für alle operativen Standard-Situationen. Sie sind so geschrieben, dass eine Person ohne Senior-Engineer-Wissen sie Schritt-für-Schritt abarbeiten kann (Solo am Sonntagabend, Owner nicht erreichbar).

## Adoption für eigene Instanz (andere Unis / Institutionen)

Die Runbooks sind **provider-agnostisch** geschrieben und nutzen Platzhalter, die du einmalig in `docs/operators-private.md` setzt (siehe [`operators-private.md.example`](../operators-private.md.example) als Vorlage; die echte Datei ist in `.gitignore` und enthält Secrets/Passwörter).

| Platzhalter                  | Bedeutung                                                                        | Beispiel                                         |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `<VPP_INSTANCE>`             | Domain deiner VPP-Installation (Frontend + Backend hinter `/api/v1`)             | `vpp.example.edu`                                |
| `<HOSTING_PANEL_HOST>`       | Hostname des Hosting-Panels (Plesk, cPanel, Coolify, …)                          | `hosting.example.edu`                            |
| `<HOSTING_PANEL_PORT>`       | Port des Hosting-Panels                                                          | `8443`                                           |
| `<HOSTING_PROVIDER_SUPPORT>` | Eskalationskontakt für Infrastruktur (interne IT, externer Hoster, MSP)          | `it-support@example.edu` / `support@hetzner.com` |
| `<INSTITUTION_DPO>`          | Datenschutzbeauftragte:r der Institution                                         | `dsb@example.edu`                                |
| `<OWNER_EMAIL>`              | Operator-E-Mail für Alerts (`probe.mjs`, Plesk-Cron)                             | `vpp-ops@example.edu`                            |
| `<PROXY_ADDRESS>`            | UUPS-Proxy-Adresse des V2-Smart-Contracts                                        | `0x8b8E…4cAa`                                    |
| `<PLESK_USER>`               | SSH-User auf dem Hosting-Server (Plesk: typischerweise der Domain-Owner-Account) | `vpp-prod`                                       |

### Zu Hosting-Provider-Spezifika

Die Beispiele in den Runbooks zeigen **Plesk** (das Setup der Referenz-Instanz). Für andere Provider gilt:

| Plesk-Schritt                                                            | cPanel                            | Plain VPS (systemd)                           | Docker / Coolify                  |
| ------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------- | --------------------------------- |
| Plesk-Panel → Domains → `<VPP_INSTANCE>` → Node.js → Restart Application | "Setup Node.js App" → Restart     | `sudo systemctl restart vpp-backend`          | `docker restart vpp-backend`      |
| Custom Environment Variables                                             | Application Environment Variables | `/etc/systemd/system/vpp-backend.service` env | `docker run -e …` / `compose.yml` |
| `touch tmp/restart.txt`                                                  | (cPanel: Restart-Button)          | `systemctl reload`                            | `docker kill -s HUP`              |
| Plesk-Cron (Tools → Scheduled Tasks)                                     | Cron Jobs                         | `crontab -e` für den App-User                 | Sidecar-Container oder Host-Cron  |
| Plesk-Tools → Audit Log                                                  | "Last Login" + WHM-Log            | `journalctl -u vpp-backend`                   | `docker logs vpp-backend`         |

Wenn du keinen Plesk-Hoster hast, übersetze einfach **mental** beim Lesen — die fachliche Aktion (Restart, ENV-Var setzen, Log abfragen) bleibt gleich.

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

| Stufe                   | Wann                                                        | Wer                                                              | Wie kontaktieren                   |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| **1. Self-Service**     | Standard-Vorfall (Backend down, Wallet leer, Cert-Issue)    | Operator (du)                                                    | Folge dem passenden Runbook oben   |
| **2. Owner**            | Runbook-Schritte erschöpft, Service immer noch down >30 min | siehe `docs/operators-private.md` (sofern angelegt)              | WhatsApp/Phone (sofern hinterlegt) |
| **3. Hosting-Provider** | Panel-Account-Lockout, Domain-/DNS-Issue, Hardware-Defekt   | `<HOSTING_PROVIDER_SUPPORT>` (siehe `docs/operators-private.md`) | siehe `docs/operators-private.md`  |
| **4. Datenschutz**      | Verdacht auf Daten-Manipulation / Schlüssel-Compromise      | `<INSTITUTION_DPO>` (siehe `docs/operators-private.md`)          | siehe `docs/operators-private.md`  |

## Standing Operating Reflexes

Vor jedem Klassen-Run (≥ 1 h vorher) prüfen:

- [ ] `https://<VPP_INSTANCE>/api/v1/health/ready` → HTTP 200 + `lastSyncedBlock` < 60 s alt
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

## Wichtige Konstanten (Plesk-Instanz `<VPP_INSTANCE>`)

> **Hinweis:** Werte mit `<EINTRAGEN>` müssen nach Plesk-Verifikation einmal gesetzt werden. Owner sollte das nach Lesen aller Runbooks in einer 30-min-Session erledigen.

| Konstante                  | Wert                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| Panel-URL (Plesk/cPanel/…) | `<EINTRAGEN, z.B. https://hosting.example.edu:8443/>`             |
| App-Pfad auf Plesk         | `/httpdocs/` (Anwendungsstamm)                                    |
| Backend-Pfad               | `/httpdocs/packages/backend/`                                     |
| Restart-Trigger            | `touch /httpdocs/packages/backend/tmp/restart.txt`                |
| Passenger-Log-Pfad         | `<EINTRAGEN nach F7.10-Recherche>`                                |
| Health-URL `/live`         | https://<VPP_INSTANCE>/api/v1/health/live                         |
| Health-URL `/ready`        | https://<VPP_INSTANCE>/api/v1/health/ready                        |
| Health-URL `/diag`         | https://<VPP_INSTANCE>/api/v1/health/diag                         |
| Frontend-URL               | https://<VPP_INSTANCE>/                                           |
| Proxy-Contract (V2)        | `<EINTRAGEN, z.B. 0x8b8E...>`                                     |
| BaseScan-Proxy-Link        | https://basescan.org/address/`<PROXY_ADDRESS>`                    |
| Minter-Wallet-Adresse      | `<EINTRAGEN>`                                                     |
| DEFAULT_ADMIN-Wallet       | `<EINTRAGEN>` (wer-hält-was: siehe `operators-private.md`)        |
| BaseScan-API-Key-Lokation  | `<EINTRAGEN, z.B. 1Password "VPP Operations">`                    |
| GHA-Deploy-Workflow        | `.github/workflows/deploy.yml` (push:main oder workflow_dispatch) |
| Last-Known-Good-Tag        | `last-known-good` (siehe `deploy-rollback.md`)                    |

## Audit-Status

Die in diesen Runbooks dokumentierten Verfahren basieren auf den Findings aus `docs/audit/v2/`. Insbesondere:

- **Minter-Compromise-Recovery**: F2.2 (Bereich 2)
- **ETH-Refill**: F2.9 (Bereich 2)
- **Key-Rotation**: F2.2 (Bereich 2), Owner-Decision OD-2.A
- **Backup/Restore**: F4.8 (Bereich 4) + F7.3 (Bereich 7)
- **Incident-Response**: F7.1 + F7.2 (Bereich 7)
- **Deploy-Rollback**: F7.4 (Bereich 7)
