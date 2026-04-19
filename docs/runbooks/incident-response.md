# Incident Response — "VPP funktioniert nicht"

**Wann nutzen:** Studi-Beschwerde, UptimeRobot-Alarm, eigener Verdacht.
**Geschätzte Zeit:** 5-30 min für die häufigen Vorfälle. 1-3 h bei kompliziertem Fall.
**Voraussetzung:** Plesk-Panel-Zugang. Falls nein → siehe `operators-private.md`.

---

## Schritt 0 — Ist es wirklich kaputt?

Bevor du einen Restart auslöst (= 30 s Service-Unterbrechung): **verifiziere**.

```bash
# Aus jedem Browser/Terminal:
curl -sS https://vpstunden.hsbi.de/api/v1/health/ready
```

| Antwort                                                                | Bedeutung                                           | Weiter mit |
| ---------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| HTTP 200, `{"status":"ok",...}`                                        | Backend läuft. Problem ist evtl. clientseitig.      | Schritt 1  |
| HTTP 503, `{"status":"degraded","blockchain":{"connected":false,...}}` | Backend läuft, aber **RPC-Verbindung kaputt**.      | Schritt 5  |
| HTTP 503, `{"status":"degraded","eventStore":{"ready":false,...}}`     | Backend läuft, aber **Event-Sync hängt**.           | Schritt 6  |
| HTTP 502/504 / Timeout                                                 | **Passenger ist tot** oder `dist/server.js` crasht. | Schritt 2  |
| Connection refused / DNS-Fehler                                        | **Plesk/Domain ist down**.                          | Schritt 9  |
| HTML statt JSON (Plesk-Default-Page)                                   | **Node.js-App in Plesk nicht aktiv**.               | Schritt 8  |

---

## Schritt 1 — Client-Side-Symptom-Triage

Wenn `/health/ready` 200 OK liefert, aber Studi/Lehrende:r meldet Probleme:

| Symptom                                      | Wahrscheinliche Ursache                                               | Aktion                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "Wallet wird nicht erkannt" / MetaMask blank | Browser-Cache, Wallet-Extension-Update                                | Studi: Cache leeren, Extension neu installieren                                                           |
| "Claim-Link funktioniert nicht"              | Falscher Link aus SoSci, oder HMAC-Key rotiert                        | siehe Schritt 7                                                                                           |
| "Punkte werden nicht angezeigt"              | Event-Sync-Lag (event store stale)                                    | Warten 60 s, refresh; sonst Schritt 6                                                                     |
| "Seite lädt langsam"                         | RPC-Provider degradiert                                               | Check `/health/diag` (Schritt 5)                                                                          |
| "Ich bekomme einen 503 beim Claimen"         | Wallet-Balance leer ODER RPC-Failover läuft ODER Rate-Limit getroffen | Check Wallet-Balance (`eth-refill.md`); Check `/health/diag`; Check Studi-Anzahl im aktuellen Klassen-Run |

Wenn nichts hier passt → **Logs prüfen** (Schritt 4).

---

## Schritt 2 — Passenger-Restart (Standard-Reflex bei Backend-Hang/Crash)

Phusion Passenger pausiert den Worker zwischen Requests. Manchmal reicht ein Restart.

### Variante A — via Plesk-Panel (langsamer, aber GUI):

1. Login: `<EINTRAGEN: PLESK_PANEL_URL>` (siehe `runbooks/README.md` Konstanten-Tabelle)
2. Domains → `vpstunden.hsbi.de` → **Node.js**
3. Klicke **"Restart App"**
4. Warte 30 s
5. Erneut `curl https://vpstunden.hsbi.de/api/v1/health/ready` → sollte HTTP 200 sein

### Variante B — via SSH (schneller):

```bash
ssh <PLESK_USER>@vpstunden.hsbi.de
touch /httpdocs/packages/backend/tmp/restart.txt
curl -sS https://vpstunden.hsbi.de/api/v1/health/live
```

**Wenn das geholfen hat:** Du bist fertig. Notiere den Vorfall in `docs/incidents/<datum>.md` (siehe Schritt 10).

**Wenn nicht:** Schritt 3 oder 4.

---

## Schritt 3 — `/health/diag` lesen (Deep-Probe)

```bash
curl -sS https://vpstunden.hsbi.de/api/v1/health/diag | jq
```

Prüfe:

```jsonc
{
  "uptime": 12345,                    // Sekunden seit letztem Backend-Start
                                      // → niedrig (<60) = gerade restartet (vielleicht Crash-Loop?)
                                      // → hoch (>1 Tag) = stabil
  "rpc": {
    "configured": 1,
    "configuredProbes": [
      {
        "host": "mainnet.base.org",
        "ok": true,                   // <-- false = primärer RPC down
        "chainId": "0x2105",
        "httpStatus": 200,
        "elapsedMs": 234              // >2000 = lahm; >5000 = wahrscheinlich timeout
      }
    ],
    "fallbacks": 3,
    "fallbackProbes": [...],          // mind. EIN Fallback muss "ok": true sein
    "anyOk": true                     // <-- false = ALLE RPCs down (selten)
  },
  "eventStore": {
    "lastSyncedBlock": 18234567,
    "lastSyncDurationMs": 1230,
    "lastSyncError": null,            // <-- nicht-null = Sync hängt
    "lastSyncedAt": "2026-04-18T..."  // sollte <2 min alt sein
  },
  "contractAddress": "0x...",
  "explorerBaseUrl": "https://basescan.org"
}
```

**Aktion abhängig vom Befund:**

| Befund                                              | Schritt                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `rpc.anyOk: false`                                  | RPC-Provider-Crisis (selten). Warte 5 min und prüfe erneut. Wenn persistent: siehe `disaster-recovery.md` Section "RPC-Outage". |
| Nur primärer RPC `ok: false`, Fallbacks ok          | OK, Backend nutzt Fallback. Kein Eingriff nötig. Notify Owner.                                                                  |
| `eventStore.lastSyncError != null`                  | Bug oder RPC-Issue. Logs prüfen (Schritt 4).                                                                                    |
| `eventStore.lastSyncedAt` > 5 min alt + uptime hoch | Sync-Loop hängt. Restart (Schritt 2).                                                                                           |
| `uptime` < 30 s nach Restart, immer wieder klein    | **Crash-Loop**. Logs (Schritt 4) sind jetzt Pflicht.                                                                            |

---

## Schritt 4 — Logs prüfen

```bash
ssh <PLESK_USER>@vpstunden.hsbi.de

# Backend-Errors:
tail -100 <PASSENGER_LOG_PATH>/error.log
# (PASSENGER_LOG_PATH siehe runbooks/README.md Konstanten — typisch /var/log/passenger/<app-id>/ oder ~/logs/)

# Backend-Access (Request-Pattern):
tail -100 <PASSENGER_LOG_PATH>/access.log

# Live-Beobachtung während Reproduktion:
tail -f <PASSENGER_LOG_PATH>/error.log
```

**Häufige Patterns und Bedeutung:**

| Pattern im Log                                          | Bedeutung                                        | Aktion                                                          |
| ------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `INSUFFICIENT_FUNDS`                                    | Wallet leer                                      | `eth-refill.md`                                                 |
| `nonce too low` / `replacement transaction underpriced` | NonceManager-Drift                               | Restart (Schritt 2)                                             |
| `MINTER_BALANCE_LOW`                                    | Balance unter Schwelle (Cluster mit F2.4)        | `eth-refill.md`                                                 |
| `ECONNREFUSED` / `ETIMEDOUT` zu RPC                     | RPC down                                         | Schritt 3                                                       |
| `Cannot find module './dist/server.js'`                 | Deploy ist kaputt                                | `deploy-rollback.md`                                            |
| `MISSING_ENV` / `Missing required environment variable` | Plesk-ENV-Var fehlt                              | Plesk-Panel → Custom Environment Variables → setzen + Restart   |
| `Invalid private key` / `INVALID_ARGUMENT` Bei Boot     | Tippfehler in `MINTER_PRIVATE_KEY` (Plesk-Panel) | Korrigieren + Restart                                           |
| `EACCES: permission denied, open '.../data/...'`        | File-Permissions kaputt                          | `chmod 600 packages/backend/data/*.json` (siehe Bereich 4 F4.5) |
| `EMFILE: too many open files`                           | Ulimit erschöpft (selten)                        | Plesk Restart (Variante A in Schritt 2)                         |
| `pino-pretty: SyntaxError`                              | Boot-Bug bei NODE_ENV=production                 | Plesk-ENV `NODE_ENV=production` setzen                          |

**Wenn das Log nicht rotiert ist und sehr groß** (`>500 MB`):

```bash
# Letzten 1 MB anschauen:
tail -c 1M <PASSENGER_LOG_PATH>/error.log
```

Plesk macht Default-`logrotate`. Wenn nicht, manuell rotieren:

```bash
# CAUTION: nur wenn Logs > 500 MB UND Disk-Space-Issue
sudo cp <PASSENGER_LOG_PATH>/error.log <PASSENGER_LOG_PATH>/error.log.$(date +%Y%m%d)
sudo : > <PASSENGER_LOG_PATH>/error.log
```

---

## Schritt 5 — RPC-Probleme

`/health/diag` zeigt `rpc.anyOk: false` ODER alle Probes haben hohe `elapsedMs`?

1. **Externer Status:** https://status.base.org → Base hat einen Vorfall? Wenn ja: **Warten**, Studis informieren ("aktuell Netzwerk-Wartung Base, Claims später erneut versuchen"). Keine Code-Aktion.
2. **Konfiguration:** `RPC_URL` in Plesk-Panel-ENV korrekt? Tippfehler?
3. **Alchemy-Quota:** falls Alchemy-Key in `RPC_URL` steht — Alchemy-Dashboard prüfen, ob das Tageslimit gerissen ist (Free-Tier = 300M CU/month).
4. **Public-RPC-Throttling:** wenn nur Public-RPCs konfiguriert sind und ein Klassen-Run läuft, kann das Throttling sein. Klassen-Run koordiniert ablaufen (gleichzeitige Claims über 5 min staffeln statt 30 in 30 s).

---

## Schritt 6 — Event-Store hängt

`/health/diag` zeigt `eventStore.lastSyncError != null` ODER `lastSyncedAt` > 5 min alt?

1. **Restart probieren** (Schritt 2). 80 % der Sync-Hänger lösen sich damit.
2. **Logs auf Sync-Fehler prüfen** (Schritt 4): `grep -i 'sync\|reorg\|getLogs' <PASSENGER_LOG_PATH>/error.log | tail -50`
3. **Wenn `chunk size too large` / Alchemy 10-Block-Cap-Verletzung:** Bug. Issue im Repo öffnen, Owner pingen.
4. **Wenn persistent stale (>30 min) ohne Logs:** events.json korrupt? Siehe `disaster-recovery.md` Section "Event-Store-Restore".

---

## Schritt 7 — HMAC-/Claim-URL-Probleme

Studi sagt "Claim-Link funktioniert nicht" / "INVALID_HMAC".

1. **Survey aktiv?** `curl https://vpstunden.hsbi.de/api/v1/surveys/<id>` → Antwort prüfen, `active: true`?
2. **Studi sieht alte Mail/SoSci-Snippet?** Prüfen, ob die Survey kürzlich rotiert wurde (Admin → Survey-Details → "Key rotiert am..."-Anzeige).
3. **Falls rotiert:** Studis brauchen das **neue** SoSci-Snippet. Lehrende:r informieren, dass alte Claims nicht mehr funktionieren.
4. **Falls Studi behauptet "ist die erste Mail":** Logs auf Backend prüfen (`grep 'INVALID_HMAC\|claim' <PASSENGER_LOG_PATH>/error.log`). Wahrscheinlich Konfigurations-Drift zwischen SoSci-PHP-Snippet und `survey-keys.json`.

---

## Schritt 8 — Plesk-Node.js-App ist deaktiviert

`curl /api/v1/health/live` liefert HTML statt JSON?

1. Plesk-Panel → Domains → `vpstunden.hsbi.de` → **Node.js**
2. Status sollte **"Node.js Application is enabled"** sein. Wenn nicht: **"Enable Node.js"** klicken.
3. Falls "Enable" failed: NPM-Install-Errors prüfen (Plesk-Panel zeigt's an). Häufigste Ursache: `package.json`-Drift nach manuellem Eingriff. → `deploy-rollback.md`.

---

## Schritt 9 — Plesk/Domain selbst ist down

`curl https://vpstunden.hsbi.de/` liefert "Connection refused" / DNS-Fehler?

1. **DNS-Check:** `dig vpstunden.hsbi.de +short` → IP-Antwort?
2. **TLS-Check:** `curl -sSv https://vpstunden.hsbi.de/ 2>&1 | head -20` → Cert-Issue?
3. **Plesk-Panel selbst erreichbar?** Versuche `https://hosting.hsbi.de:8443/`.
4. **Wenn Plesk-Panel auch down:** **Eskalation an HSBI-IT** (siehe `operators-private.md`).

---

## Schritt 10 — Forensik + Doku

Auch wenn der Vorfall gelöst ist: **kurzes Post-Mortem schreiben**.

Erstelle `docs/incidents/<jjjj-mm-tt>-<kurze-beschreibung>.md`:

```markdown
# Vorfall <Datum> — <Kurzbeschreibung>

## Symptom

- Erkannt um: <Uhrzeit>
- Quelle der Detektion: UptimeRobot / Studi-Mail / eigene Beobachtung
- Was war kaputt: <z.B. Backend HTTP 502>

## Diagnose

- Schritt 1-N aus incident-response.md ausgeführt
- Befund: <z.B. Wallet leer, RPC down, Crash-Loop wegen MINTER_KEY-Tippfehler>

## Aktion

- <was du gemacht hast>
- Service wieder up um: <Uhrzeit>
- Total Down-Time: <Minuten>

## Was hat geholfen / nicht geholfen

- ...

## Vermeidung in Zukunft

- <z.B. "Plesk-Cron für Balance-Watch checkt nicht oft genug — auf 15 min umstellen">

## Cluster mit Audit-Findings

- <z.B. F2.4, F7.1>
```

Der Owner liest das beim nächsten Repo-Sync und entscheidet über Code-Änderungen oder Runbook-Updates.

---

## Wenn nichts hilft — Eskalation

Du hast die Schritte 0-9 durchgegangen, Service ist nach 30 min immer noch down:

1. **Owner kontaktieren** (siehe `operators-private.md`).
2. **Studis informieren** (Lehrende:r-Verteiler) — Beispiel-Text:
   > "Die VPP-Plattform hat aktuell technische Probleme. Wir untersuchen das. Bitte versucht den Claim später erneut. Eine offizielle Update-Mail folgt heute Abend."
3. **Eigene Notes** im incident-md sammeln, was du probiert hast — der Owner braucht das beim Übernehmen.

**Niemals:**

- Ohne Backup `data/*.json` löschen (Backup siehe `disaster-recovery.md`).
- `MINTER_PRIVATE_KEY` rotieren ohne `key-rotation.md`-Schritte (du würdest legitime Studi-Claims brechen).
- Production-Deploy-Schalter im Plesk umlegen, wenn du nicht weißt, was er macht.
