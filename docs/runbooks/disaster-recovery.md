# Disaster Recovery — Hosting-Server tot, Daten weg

> **Provider-Hinweis:** Beispielbefehle nutzen Plesk + SSH. Für andere Hoster (cPanel, plain VPS, Docker) siehe Mapping-Tabelle in [`README.md`](README.md#zu-hosting-provider-spezifika). Platzhalter wie `<VPP_INSTANCE>`, `<HOSTING_PANEL_HOST>` werden in `docs/operators-private.md` definiert.

**Wann nutzen:**

- Hosting-Server ist permanent down (Hardware-Defekt, Provider-Migration)
- `data/*.json` ist korrupt oder gelöscht
- Tenant-Migration auf andere Plesk-Instanz
- "wir müssen das Backend von Null aufbauen"

**Geschätzte Zeit:** 2-6 h (abhängig von Cold-Sync-Dauer + Plesk-Setup-Aufwand)
**Voraussetzung:**

- Repo-Zugang (GitHub)
- Backup-Files (siehe `disaster-recovery.md` Schritt 1)
- Neuer Plesk-Tenant (oder gleicher Tenant nach Wiederherstellung)
- DEFAULT_ADMIN-Wallet (für eventuelle Recovery-Rollen-Tx)

---

## Szenarien-Matrix

| Was ist passiert?                                | Recovery-Pfad                                                               | Datenverlust                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------- |
| Backend-Code kaputt, `data/` ok                  | Re-Deploy (siehe `deploy-rollback.md`)                                      | Keiner                                       |
| `events.json` korrupt, andere Stores ok          | Cold-Sync from-block-0                                                      | Service degraded während Sync (~30-90 min)   |
| `survey-keys.json` weg, kein Backup              | **Permanenter Verlust** alle Surveys neu konfigurieren                      | Alle aktiven SoSci-Snippets tot              |
| `used-nonces.json` weg, kein Backup              | Replay-Schutz weg → `recreate empty` UND alle bisherigen Claim-URLs sperren | Theoretischer Replay-Window für ältere Mails |
| `admin-labels.json` weg                          | recreate empty, Display-Namen nachträglich neu setzen                       | Kosmetisch                                   |
| Komplette Plesk-Tenant tot                       | Vollst. Recovery: neuer Tenant + Restore-from-Backup                        | Abhängig von Backup-Aktualität               |
| Contract auf-Chain ist tot (UUPS-Upgrade-Fehler) | Backend-side: nichts. On-Chain: DEFAULT_ADMIN muss V3 deployen              | Schwer                                       |

---

## Schritt 0 — Lage feststellen

```bash
# Externer Health-Check:
curl -sS -m 5 https://<VPP_INSTANCE>/api/v1/health/live

# Wenn DNS auflöst, aber kein TLS:
curl -sSv https://<VPP_INSTANCE>/ 2>&1 | head -20

# Wenn DNS nicht auflöst:
dig <VPP_INSTANCE> +short

# Plesk-Panel erreichbar?
curl -sSI "https://${HOSTING_PANEL_HOST}:${HOSTING_PANEL_PORT}/"

# SSH-Erreichbarkeit:
ssh -o ConnectTimeout=5 <PLESK_USER>@<VPP_INSTANCE> echo ok
```

---

## Schritt 1 — Backup-Restore (vorausgesetzt F7.3-GHA-Backup-Workflow läuft)

### Letzten Backup von GitHub-Releases holen:

```bash
gh release list --repo <owner>/vpp-blockchain --limit 30 \
  | grep '^backup-'
# Output: backup-12345678  Backup 12345678  ...
```

Letzten Backup downloaden:

```bash
gh release download backup-<id> --repo <owner>/vpp-blockchain
ls -lh vpp-backup-*.tar.gz.gpg
```

### Decrypten (Passphrase aus 1Password):

```bash
gpg --batch --passphrase "<BACKUP_PASSPHRASE>" \
    --decrypt vpp-backup-*.tar.gz.gpg \
    | tar xzf -
ls -lh backup/data/
# Sollte enthalten:
# - events.json
# - admin-labels.json
# - survey-keys.json
# - used-nonces.json
```

### Validate (kritischer Schritt — Backup muss valide sein):

```bash
for f in backup/data/*.json; do
  echo "=== $f ==="
  if jq -e . < "$f" > /dev/null 2>&1; then
    echo "  ✓ valid JSON"
    echo "  size: $(stat -c%s "$f") bytes"
    echo "  entries: $(jq 'length' < "$f")"
  else
    echo "  ✗ INVALID JSON — backup is corrupt!"
  fi
done
```

**Wenn Backup invalid:** vorletzten Backup probieren.

**Wenn alle Backups invalid:** F7.3-Workflow hat ein Bug — Owner-Eskalation. Recovery-Pfad: **Cold-Sync für `events.json`** + **Datenverlust für die anderen 3 Stores**.

---

## Schritt 2 — Plesk re-Setup (falls Tenant tot)

> **Vorausgesetzt:** Du hast einen funktionierenden Hosting-Tenant. Falls nein → `<HOSTING_PROVIDER_SUPPORT>` für Provisionierung.

### Variante A — bestehender Tenant, nur App-Re-Setup:

1. Plesk-Panel → Domains → `<VPP_INSTANCE>` → **Node.js**
2. **Enable Node.js**
3. Konfiguration:
   - **Node.js Version:** matching `.nvmrc` (verifizieren: `cat .nvmrc` → z.B. `20`)
   - **Document Root:** `/httpdocs/`
   - **Application Mode:** `production`
   - **Application URL:** https://<VPP_INSTANCE>/
   - **Application Root:** `/httpdocs/packages/backend/`
   - **Application Startup File:** `app.js`
4. **Custom Environment Variables** — komplette Liste setzen (siehe `docs/env-reference.md` oder bisher `docs/deployment.md`):
   - `MINTER_PRIVATE_KEY`
   - `RPC_URL`
   - `CONTRACT_ADDRESS` (= Proxy-Address)
   - `CHAIN_ID` = `8453`
   - `PORT` (oft 3000)
   - `NODE_ENV` = `production`
   - alle weiteren — vollständige Liste in `runbooks/README.md`
5. **NICHT** "NPM Install" klicken — wird beim ersten Deploy gemacht.

### Variante B — komplett neuer Tenant:

1. `<HOSTING_PROVIDER_SUPPORT>` kontaktieren: neue Subdomain provisionieren (z.B. `vpp-new.example.edu`).
2. Wie Variante A vorgehen.
3. **Achtung:** Frontend-CORS, OAuth-Callbacks, BaseScan-Verifications etc. müssen auf neuen Hostname umgestellt werden. → komplettes Audit nötig.

---

## Schritt 3 — Deploy (Code + Frontend)

```bash
# Lokal:
cd <repo>
git checkout main
git pull

# Manueller Deploy via GHA (force_full=true für saubere Komplettbasis):
gh workflow run deploy.yml --ref main -f force_full=true

# Watch:
gh run watch
```

ODER manuell aus lokalem Build:

```bash
# Lokal bauen:
pnpm install --frozen-lockfile
pnpm contracts:build
pnpm contracts:export-abi
pnpm backend:build
pnpm frontend:build

# Deploy-Bundle erstellen:
bash scripts/build-deploy-ci.sh

# Manuelle FTP-Upload (wenn GHA nicht geht):
# Siehe deploy.yml für lftp-Commands. Kurz:
lftp -u <FTP_USER>,<FTP_PASS> -e "
  set ftp:ssl-allow yes; set ftp:ssl-force yes;
  set ssl:verify-certificate no;  # NUR im Notfall
  mirror --reverse --delete deploy/ /httpdocs/;
  put /dev/null -o /httpdocs/packages/backend/tmp/restart.txt;
  quit;
" "$HOSTING_PANEL_HOST"
```

Verifikation:

```bash
sleep 15
curl -sS https://<VPP_INSTANCE>/api/v1/health/live
```

---

## Schritt 4 — Stores wiederherstellen

```bash
ssh <PLESK_USER>@<VPP_INSTANCE>

# Backup-Files hochladen via SCP von deinem lokalen Rechner:
# (vorher: lokal die backup/data/ aus Schritt 1)
exit
scp -r backup/data/* <PLESK_USER>@<VPP_INSTANCE>:/httpdocs/packages/backend/data/

# Permissions setzen (Bereich 4 F4.5):
ssh <PLESK_USER>@<VPP_INSTANCE>
chmod 600 /httpdocs/packages/backend/data/*.json
ls -la /httpdocs/packages/backend/data/
# Erwartet: -rw------- für jede Datei
```

**Restart:**

```bash
touch /httpdocs/packages/backend/tmp/restart.txt
```

**Verifikation:**

```bash
curl -sS https://<VPP_INSTANCE>/api/v1/health/diag | jq '.eventStore'
```

`lastSyncedBlock` sollte ein realistischer Wert sein (nicht 0). Wenn 0: Backup von events.json war leer oder nicht gemounted.

---

## Schritt 5 — Cold-Sync (wenn `events.json` fehlt oder Backup zu alt)

`events.json` kann komplett aus der Blockchain-History rekonstruiert werden.

```bash
# In Plesk-ENV setzen (wenn nicht schon):
# EVENT_STORE_FROM_BLOCK = <CONTRACT_DEPLOYMENT_BLOCK> (siehe BaseScan)

# Restart Backend — es startet Cold-Sync von FROM_BLOCK an
ssh <PLESK_USER>@<VPP_INSTANCE>
touch /httpdocs/packages/backend/tmp/restart.txt
```

**Erwartete Dauer (Stand 2026, mit aktuellen RPCs):**

| Block-Range zu syncen         | Mit Alchemy paid | Mit Public-RPCs only |
| ----------------------------- | ---------------- | -------------------- |
| < 100k Blöcke (~3 Wochen)     | ~5-10 min        | ~15-30 min           |
| 100k-1M Blöcke (~3-12 Monate) | ~15-45 min       | ~30-90 min           |
| > 1M Blöcke (~1+ Jahr)        | ~45-120 min      | ~90-180 min          |

**Watchen:**

```bash
# In zweitem Terminal:
ssh <PLESK_USER>@<VPP_INSTANCE>
tail -f <PASSENGER_LOG_PATH>/access.log | grep -i sync
```

ODER alle 2 min:

```bash
curl -sS https://<VPP_INSTANCE>/api/v1/health/diag | jq '.eventStore.lastSyncedBlock'
```

`lastSyncedBlock` sollte konstant steigen.

**Wenn Cold-Sync hängt** (Block-Zähler steht > 5 min):

- Logs prüfen (Schritt 4 im `incident-response.md`).
- Häufige Ursache: ein RPC-Provider hat Rate-Limit gerissen, Backend retryt.
- Lösung: anderen RPC-Provider in `RPC_URL` setzen, Restart.

---

## Schritt 6 — Verifikation

```bash
# Health komplett:
curl -sS https://<VPP_INSTANCE>/api/v1/health/diag | jq

# Surveys-Endpoint:
curl -sS https://<VPP_INSTANCE>/api/v1/surveys

# Test-Claim (mit einer bekannt-gültigen Studi-Wallet):
# Manueller Test im Frontend.
```

**Akzeptanz-Kriterien:**

- `/health/ready` HTTP 200
- `eventStore.lastSyncedBlock` = aktueller Block-Höhe (±1 Block)
- `rpc.anyOk: true`
- Mind. eine Survey aus `/surveys` erkennbar
- Test-Claim erfolgreich + auf BaseScan sichtbar

---

## Schritt 7 — Restore-Test in Friedenszeiten

> **Halbjährliche Pflicht** — sonst weißt du erst im Disaster, dass dein Backup-Pfad bricht.

1. Lokal Backup downloaden + decrypten (Schritt 1).
2. Lokal in einem Test-Verzeichnis entpacken.
3. Schema-Validate: `jq` läuft auf jedem File ohne Error.
4. **Optional, idealerweise:** auf einer Test-Plesk-Instanz oder Docker-Compose-Setup das komplette Disaster-Recovery durchspielen → echter End-to-End-Test.
5. **Sehr gut:** Cold-Sync auf einer Sepolia-Test-Deployment durchspielen, um die Dauer zu verifizieren.
6. Notiz in `docs/incidents/<datum>-restore-test.md` mit Befund.

---

## Recovery-Time-Budget (RTB) Tabelle

| Disaster                             | Minimum-RTB                            | Realistische-RTB | Worst-Case-RTB           |
| ------------------------------------ | -------------------------------------- | ---------------- | ------------------------ |
| Code-Deploy kaputt                   | 5 min (Rollback)                       | 15 min           | 1 h                      |
| `data/`-Restore aus aktuellem Backup | 15 min                                 | 1 h              | 3 h                      |
| Cold-Sync für `events.json`          | 30 min                                 | 90 min           | 4 h                      |
| Hosting-Tenant-Migration             | 4 h                                    | 8 h              | 2 Tage (Provider-Latenz) |
| Komplett-Verlust ohne Backup         | "permanenter Datenverlust" + Cold-Sync | –                | –                        |

---

## "Wir haben keinen Backup"-Notfallplan

Wenn F7.3 nie aufgesetzt wurde und du im Disaster stehst:

1. **events.json:** Cold-Sync from-block-0 (Schritt 5). Funktioniert immer (solange Contract on-chain noch existiert).
2. **survey-keys.json:** **PERMANENT VERLOREN.** Jede aktive Survey braucht neue Keys.
   - Lehrende:r für jede Survey informieren: "Ihre laufende Studie ist betroffen. Wir generieren Ihnen einen neuen Survey-Key."
   - Im Backend (nach Deploy): Admin-Login, jede Survey neu erstellen, neues SoSci-Snippet generieren, Lehrende:r in SoSci austauschen.
3. **used-nonces.json:** **PERMANENT VERLOREN.** Replay-Schutz weg.
   - Akzeptiere kurzes Replay-Window (alte Claims könnten in-Theorie wieder verwendet werden).
   - Mitigation: alle aktiven Surveys sofort rotieren (HMAC-Key-Wechsel) → invalidiert alle alten Claim-URLs.
4. **admin-labels.json:** kosmetisch, kein Eingriff nötig — Owner kann labels manuell neu setzen.

**Lehre:** F7.3-Backup-Workflow ist die billigste Versicherung im Repo. 2 h Setup-Aufwand, schützt gegen multi-tausend-Studi-Schmerz.
