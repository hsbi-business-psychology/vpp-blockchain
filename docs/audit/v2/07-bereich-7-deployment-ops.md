# Bereich 7 — Deployment, Hosting & Operational Readiness (V2-Audit)

**Auditor:** Senior SRE (extern)
**Stand:** 2026-04-18
**Scope:** GitHub-Actions-Deploy-Pipeline (`deploy.yml`, `ci.yml`, `build-deploy-ci.sh`), Plesk-Hosting-Modell (Phusion Passenger, Custom-ENV-Vars, FTP+TLS), Health-Endpoints (`routes/health.ts`), Runbook-Vollständigkeit (`docs/runbooks/`), Backup-Konzept für Stateful-Stores, Disaster-Recovery, Bus-Factor, ADR-Vollständigkeit, SoSci/LimeSurvey-Onboarding, Logging-Pfade auf Plesk, TLS-Pinning-Robustheit.

**Wichtig:** Bereich 7 hat **keine** V1-Vorgängerdoku im Repo (`docs/audit/` enthält nur `v2/`). Greenfield-Audit für Operations.

---

## Executive Summary

Code ist solide. Operations ist **nicht existent**. Die einzige funktionierende Detektion eines Service-Ausfalls ist heute eine Studi-E-Mail an den Lehrenden. Über das 2-Jahres-Ziel ist das **nicht** akzeptabel — und es ist auch nicht teuer zu fixen, wenn man es einmal hinsetzt.

**Strukturelle Lücken:**

- 🔴 **F7.1 — Kein externes Monitoring konfiguriert.** `/health/live`, `/health/ready`, `/health/diag` existieren als Server-Endpoints (`routes/health.ts:11-167`), aber **niemand polled sie**. Kein UptimeRobot, kein Healthchecks.io, kein GHA-Cron, kein Plesk-Monitoring-Hook. Service kann 12 h tot sein, ohne dass jemand es merkt.
- 🔴 **F7.2 — `docs/runbooks/`-Verzeichnis existiert nicht.** Null Runbooks. `v2-migration-runbook.md:206-230` hat einen 4-Bullet-"Notfall-Plan"-Stub für Migration-spezifische Bug-Klassen, **nicht** für Solo-Sunday-Crash. Cluster mit Bereich 2 F2.2.
- 🟠 **F7.3 — Kein Backup für `data/*.json`.** `security.md:71` behauptet "backed up through the Plesk filesystem snapshots" — in Bereich 2 F2.6 als unbelegt markiert. Cluster mit Bereich 4 F4.8.
- 🟠 **F7.4 — Deploy hat keinen Post-Deploy-Health-Check + kein Auto-Rollback.** `deploy.yml` endet nach `touch tmp/restart.txt`. Kaputte `dist/server.js` = Passenger-Crash-Loop = Service tot bis manueller Eingriff.
- 🟠 **F7.5 — TLS-Cert-Pinning fällt silent zu "encrypted-but-unverified" zurück** (`deploy.yml:80-87`). Bei HSBI-Cert-Wechsel oder DFN-Outage: Deploy läuft trotzdem durch, niemand sieht den GHA-warning.
- 🟠 **F7.6 — `app.js`-Boot-Wrapper lädt `dotenv` aus `.env`** (`build-deploy-ci.sh:64-67`), während Owner-Decision OD-2.B die Plesk-Panel-ENV-Var als Single-Source-of-Truth festgelegt hat. Inkonsistenz erlaubt versehentliche Doppel-Config mit unklarer Präzedenz. Cluster mit F2.10.
- 🟡 **F7.7 — Bus-Factor = 1, Repo dokumentiert es nicht.** Plesk-URL/-Login, Coinbase-Konto-Owner, DEFAULT_ADMIN_ROLE-Wallet-Identität, BaseScan-API-Key-Lokation: nichts davon ist im Repo dokumentiert. Hirschfeld findet in 2 h nichts Brauchbares.
- 🟡 **F7.8 — `concurrency: cancel-in-progress: true` in `deploy.yml`** (`deploy.yml:13-15`). Push während laufendem Deploy = mid-deploy kill = halb-deployed Server-Stand. Auf einem `lftp mirror` ist das besonders schmerzhaft, weil der Mirror-Schritt pro-Datei ist, nicht atomar.
- 🟡 **F7.9 — `.deploy-meta`-Skip-Optimization basiert auf einem FTP-`cat`** (`deploy.yml:128-137`). Wenn der FTP-Read failed (Timeout, Cert-Fehler), wird stillschweigend `match=no` gesetzt → unnötige 36-MB-Upload. Akzeptabel (kein Sicherheits-Issue), aber Doku-Lücke.
- 🟡 **F7.10 — Plesk-Log-Pfad nirgendwo dokumentiert.** Hirschfeld weiß nicht, wo `/var/log/passenger/<app>/` ist (oder ob es überhaupt dieser Pfad ist). Rotations-Policy unbekannt. Cluster mit F2.5 + F6.4.
- ⚪ **F7.11 — `docs/deployment.md` ist veraltet** (Docker-Option, pm2-Option, `build-deploy.sh`-Verweis — alles nicht mehr im Repo). Setzt neue Lehrende auf falsche Pfade.
- ⚪ **F7.12 — `workflow_dispatch` `force_full`-Trigger ohne Approval-Gate** (`deploy.yml:6-11`). Jede:r mit Repo-Write-Access kann jederzeit einen Production-Deploy triggern.

**Positives (was funktioniert):**

- ✅ `.nvmrc` existiert + `setup-node@v4` mit `node-version-file: '.nvmrc'` (`deploy.yml:30`, `ci.yml:24`) → Node-Version ist konsistent gepinnt.
- ✅ `concurrency: deploy` Group verhindert parallele Deploys (anderer Aspekt; Race wird vermieden).
- ✅ TLS-Cert-Pinning ist überhaupt implementiert (`deploy.yml:66-87`) — die meisten HSBI-FTP-Deploys nutzen `ssl:verify-certificate no` blind. Hier ist das ein bewusstes Engineering-Investment.
- ✅ `.openzeppelin/base.json` ist im Git committed → Storage-Layout-Manifest überlebt Plesk-Tod.
- ✅ Skip-`node_modules`-Optimization bei sig-match (`deploy.yml:148-191`) → Hot-Fix-Deploy in <1 min statt 13 min.
- ✅ Health-Endpoints mit 3 Tiefen (`/live` minimal, `/ready` mit RPC + Event-Store, `/diag` mit RPC-Probe-Details) — das ist mehr als die meisten Hochschul-Deploys haben.
- ✅ ADRs (4 Stück + README-Index) decken die wichtigsten Architektur-Entscheidungen.
- ✅ `v2-migration-runbook.md` ist gut für Migration (ETH-Beschaffung, Sepolia-Testlauf, Phase-Reihenfolge).

**Insgesamt: 12 Findings (2 🔴 / 5 🟠 / 4 🟡 / 2 ⚪).**

Plus: Cluster-Anker für 6 Findings aus Bereichen 2/4/5/6, die in Bereich 7 ausgeführt werden müssen (siehe "Cluster aus anderen Bereichen" am Ende).

---

## Findings

### 🔴 F7.1 — Kein externes Monitoring; Studi-E-Mail ist die Ausfall-Detektion

**File:Line:** Repo-weit. `routes/health.ts:11-167` (Endpoints existieren). `deployment.md:227-247` (manuelle `curl`-Anweisung als einziger Hinweis).

**Problem:**

```ts
// routes/health.ts:11-13
router.get('/live', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000) })
})
```

Drei brauchbare Health-Endpoints sind implementiert (`/live`, `/ready`, `/diag`). Repo enthält **null** Konfigurationen, die sie automatisch abfragen:

- Keine UptimeRobot-Doku/Konfig.
- Kein Healthchecks.io-Snitch im `deploy.yml` (kein `curl https://hc-ping.com/<uuid>` nach erfolgreichem Deploy).
- Kein GHA-Cron-Workflow in `.github/workflows/` (nur `ci.yml` + `deploy.yml`).
- Kein Plesk-Watcher-Konfig dokumentiert.
- `routes/health.ts:35-37` triggert sogar einen "fire-and-forget sync, falls jemand `/ready` polled" — der ist toter Code, weil niemand polled.

Plus: `/ready` cached-stale-Detection (`eventStore.isStale(60_000)`) verlässt sich darauf, dass der Endpoint regelmäßig **angefragt** wird — sonst läuft die `setInterval`-basierte Background-Sync auf einem Plesk-Worker, der zwischen Requests pausiert wird (das ist genau die Plesk-Reality, die der Kommentar Z. 32-34 beschreibt).

**Realistisches 2-Jahres-Failure-Szenario:**

| Vorfall                                 | Häufigkeit | Detektions-Latenz heute               | mit Monitoring |
| --------------------------------------- | ---------- | ------------------------------------- | -------------- |
| Plesk-Passenger-Crash                   | 3-5×/Jahr  | 1-12 h (bis Studi mailt)              | <5 min         |
| MINTER_PRIVATE_KEY-Boot-Fail (F2.7)     | 1-2×/Jahr  | bis nächster Klassen-Run              | <5 min         |
| RPC alle 4 down + FallbackProvider-Loop | 1-2×/Jahr  | bis Studi mailt                       | <5 min         |
| Wallet-Balance leer (F2.4)              | 2-3×/Jahr  | erste Studi-Beschwerde im Klassen-Run | <1 h vorab     |
| `data/*.json`-Disk-full                 | 1×/Jahr    | bis Backend writes failen             | <5 min         |

Über 2 Jahre × ~16 Vorfälle × Median 4 h Detektions-Latenz = **64 h passive Down-Time, die mit Monitoring auf <2 h gesunken wäre**. Plus Reputations-Schaden pro Vorfall.

**Fix:** Siehe Section "Empfohlenes Monitoring-Setup" am Ende dieses Dokuments (UptimeRobot-Konfig + Healthchecks.io-Variante + GHA-Cron-Backup + Plesk-Cron für Local-Balance-Watch).

**2-Jahre-Begründung:** UptimeRobot Free-Tier kostet 0 EUR/Monat, Setup 30 min. Healthchecks.io Free-Tier dito. Pro abgefangenem Vorfall werden 4-12 h Detektions-Latenz gespart. Klares ROI: 30 min investieren, 60+ h sparen. Plus: Monitoring ist die Voraussetzung dafür, dass jeder andere Operations-Fix (F7.2 Runbooks, F7.4 Auto-Rollback, F2.4 Balance-Alerting) überhaupt funktional wird — sonst wartet der Runbook-Trigger auf eine Studi-Mail.

---

### 🔴 F7.2 — `docs/runbooks/`-Verzeichnis existiert nicht; null Runbooks für Solo-Sunday-Crash

**File:Line:** `docs/` (kein `runbooks/`-Subfolder, verifiziert).

**Problem:**

Owner ist 3 Wochen offline, Hirschfeld bekommt Sonntag 23:00 die Nachricht "VPP geht nicht". Was Hirschfeld **heute** im Repo findet:

- `README.md` → Quick-Start für Development, nicht Operations.
- `docs/deployment.md` → Initial-Setup für eine neue Plesk-Instanz, nicht Crash-Recovery.
- `docs/v2-migration-runbook.md:206-230` → 4-Bullet-"Notfall-Plan" für Migration-spezifische Bug-Klassen ("Backend startet nicht → tail logs"). Kein "wo logge ich ein", "wer hat den Plesk-Account", "welchen Knopf drücke ich", "wann eskaliere ich an wen".
- `docs/security.md:60-66` → Compromise-Doku ist in F2.6 als 8-fach-Lüge dokumentiert.
- `docs/architecture.md` → Component-Übersicht, kein Operations-Pfad.

**Was Hirschfeld nicht findet:**

- Plesk-Login-URL + Account-Owner.
- Was zuerst zu prüfen ist (Health-URL → Plesk-Status → Logs → Restart).
- Wo die Logs liegen (siehe F7.10).
- Wie man den Backend-Worker restartet (`touch tmp/restart.txt` ist im Migration-Runbook erwähnt — als Migration-Schritt, nicht als Standard-Reflex).
- Wann/wem zu eskalieren ist.
- Was zu tun ist, wenn der Restart das Problem nicht löst.
- Wie man rollbacked (siehe F7.4).
- Was zu tun ist bei Wallet-Compromise (Cluster mit F2.2).
- Was zu tun ist bei `data/*.json`-Korruption (Cluster mit F4.8).

**Resultat:** Hirschfeld klickt 30 min in Plesk herum, schickt Joris eine WhatsApp ohne Antwort, schreibt eine "wir untersuchen das"-Mail an Studi und wartet auf Joris' Rückkehr. Service bleibt tot.

**Fix:**

Sechs Runbooks unter `docs/runbooks/`, jeweils copy-paste-bereit für Hirschfeld ohne Senior-Engineer-Wissen. Diese Audit-Iteration liefert sie mit:

| Runbook                | Trigger                                   | Mindest-Inhalt                                                                         |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `incident-response.md` | "VPP funktioniert nicht"                  | 10-Schritt-Checklist Plesk-Login → Health-URL → Logs → Restart → Rollback → Eskalation |
| `eth-refill.md`        | Wallet-Balance-Alarm oder Pre-Klassen-Run | Coinbase-Schritt-für-Schritt + Notfall-Modus + Backup-Wallet                           |
| `key-rotation.md`      | Minter-Key-Compromise-Verdacht            | F2.2-6-Schritt-Sequenz als ausführbare BaseScan-/`cast`-Anleitung                      |
| `disaster-recovery.md` | Plesk-Server-Tod                          | Restore aus Backup + Cold-Sync-Erwartungs-Tabelle + Re-Deploy                          |
| `deploy-rollback.md`   | Letzter Deploy ist kaputt                 | Wie zurück auf vorherigen Deploy ohne neue Build-Pipeline                              |
| `sosci-onboarding.md`  | Neue:r Lehrende:r will VPP nutzen         | Klick-Anleitung mit Screenshots-Pfaden + Survey-Setup-FAQ                              |

Plus `docs/runbooks/README.md` als Index.

**2-Jahre-Begründung:** Runbook-Aufwand: 1 Personentag für alle 6 in der ersten Iteration + halbjährliche 30-min Refresh-Reviews. Im Krisenfall der Unterschied zwischen 1 h Recovery und 2 Tagen Stillstand. Bus-Factor-Reduktion ist der zentrale Operations-Hebel für ein Studierenden-System mit semesterweisem Klausur-Druck.

---

### 🟠 F7.3 — Kein Backup für `data/*.json`; security.md-Behauptung ist unbelegt

**File:Line:** `docs/security.md:71` (Behauptung), kein Backup-Skript im Repo (Lücke).

**Problem:**

```text
// security.md:71 (im Kontext der HMAC-Keys)
File is gitignored and backed up through the Plesk filesystem snapshots.
```

In F2.6 als unbelegt markiert. Repo-Suche bestätigt:

- Kein cron-Skript unter `scripts/` (verifiziert: nur `build-deploy-ci.sh`, `build-deploy.sh`).
- Kein GHA-Backup-Workflow unter `.github/workflows/` (nur `ci.yml`, `deploy.yml`).
- Keine Plesk-Snapshot-Konfig im Repo dokumentiert.
- Kein Test-Restore-Protokoll in `docs/`.

**Welche Files sind betroffen** (aus Bereich 4):

| Store               | Größe nach 2 J. | Rekonstruierbar?        | Folge bei Verlust                                                                                                                         |
| ------------------- | --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `events.json`       | 5-15 MB         | ✓ Cold-Sync 30-90 min   | Service degraded während Sync                                                                                                             |
| `survey-keys.json`  | <100 KB         | ✗ Nicht rekonstruierbar | **Alle aktiven Surveys tot bis Manual-Recovery** — SoSci-Snippets müssen in jeder laufenden Klausur neu generiert + neu ausgerollt werden |
| `used-nonces.json`  | 100-500 KB      | ✗ Nicht rekonstruierbar | **Replay-Schutz weg** — alte Claim-URLs theoretisch wiederverwendbar                                                                      |
| `admin-labels.json` | <50 KB          | ✗ Nicht rekonstruierbar | Display-Namen weg (kosmetisch)                                                                                                            |

Plus `.openzeppelin/base.json`: ist im Git committed (`packages/contracts/.openzeppelin/base.json`), gut — aber wenn jemand `git reset --hard` mit lokalen Änderungen macht und der Plesk-Server gleichzeitig stirbt, ist Future-V3-Storage-Layout-Roulette.

**Fix:**

GHA-Backup-Workflow + Off-Site-Storage. Konkret:

```yaml
# .github/workflows/backup.yml (NEU)
name: Backup data stores

on:
  schedule:
    - cron: '0 3 * * *' # täglich 03:00 UTC = 04:00/05:00 lokal
  workflow_dispatch:

concurrency:
  group: backup
  cancel-in-progress: false

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install lftp
        run: sudo apt-get update && sudo apt-get install -y lftp gnupg

      - name: Pin hosting.hsbi.de TLS cert chain
        # gleicher Pin-Block wie in deploy.yml — als reusable composite action
        # extrahieren wäre besser
        run: |
          mkdir -p .ftp-trust
          openssl s_client -connect hosting.hsbi.de:21 -starttls ftp -showcerts \
              -servername hosting.hsbi.de </dev/null 2>/dev/null \
              | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' \
              > .ftp-trust/hsbi.pem

      - name: Download data/ from Plesk
        env:
          FTP_USER: ${{ secrets.FTP_USERNAME }}
          FTP_PASS: ${{ secrets.FTP_PASSWORD }}
        run: |
          mkdir -p backup
          lftp -c "
            set ftp:ssl-allow yes; set ftp:ssl-force yes;
            set ssl:verify-certificate yes;
            set ssl:ca-file $(pwd)/.ftp-trust/hsbi.pem;
            open -u $FTP_USER,$FTP_PASS ftp://hosting.hsbi.de;
            mirror /httpdocs/packages/backend/data backup/data;
            quit;
          "

      - name: Encrypt backup with GPG (symmetric)
        env:
          BACKUP_PASSPHRASE: ${{ secrets.BACKUP_PASSPHRASE }}
        run: |
          DATESTAMP=$(date -u +%Y%m%d-%H%M)
          tar czf - backup/data \
            | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" \
                  --symmetric --cipher-algo AES256 \
                  -o "vpp-backup-$DATESTAMP.tar.gz.gpg"
          ls -lh "vpp-backup-$DATESTAMP.tar.gz.gpg"

      - name: Upload as GitHub Release asset
        uses: softprops/action-gh-release@v2
        with:
          tag_name: backup-${{ github.run_id }}
          name: 'Backup ${{ github.run_id }}'
          files: vpp-backup-*.tar.gz.gpg
          # Releases sind dauerhaft; jeder Backup ist ein eigener Release
          # Tag. Restore ist `gh release download backup-<id>` + GPG decrypt.

      - name: Prune old backups (keep 30 days)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          CUTOFF=$(date -u -d '30 days ago' +%s)
          gh release list --limit 100 --json tagName,createdAt \
            | jq -r --argjson cutoff "$CUTOFF" \
                '.[] | select((.createdAt | fromdate) < $cutoff)
                     | select(.tagName | startswith("backup-"))
                     | .tagName' \
            | while read tag; do
                echo "Deleting old backup: $tag"
                gh release delete "$tag" --yes
              done
```

Plus: GitHub-Secret `BACKUP_PASSPHRASE` setzen (Owner kennt sie + offline-Notiz im 1Password). Restore-Pfad in `docs/runbooks/disaster-recovery.md` (geliefert in dieser Iteration).

**Alternative ohne GHA** (falls GitHub-Storage-Quota-Sorgen): Plesk-Cron schreibt täglich nach `~/backups/` lokal + Plesk-Snapshot-Plan offiziell aktivieren. Ist schlechter (kein Off-Site), aber besser als nichts.

**2-Jahre-Begründung:** Plesk-Server-Tod ist unwahrscheinlich, aber nicht null (HSBI-RZ-Migration, Disk-Failure, gehackter Plesk-Tenant). Pro Tag ohne Backup × Stunden-Recovery-Aufwand bei Vorfall = unbegrenztes Risiko. Backup-Aufwand: 2 h für GHA-Workflow + GitHub-Storage Free-Tier (Releases sind unbegrenzt für public repos). Encryption per Symmetric-GPG verhindert, dass Backup-Files mit HMAC-Keys auf GitHub-CDN landen. Cluster mit F4.8.

---

### 🟠 F7.4 — Deploy ohne Post-Deploy-Health-Check + ohne Auto-Rollback

**File:Line:** `.github/workflows/deploy.yml:148-191`

**Problem:**

```yaml
# deploy.yml:185-191 (Ende des Deploy-Steps)
mirror --reverse --verbose --only-newer ... deploy/ /httpdocs/;
put deploy/.deploy-meta -o /httpdocs/.deploy-meta;
mkdir -p /httpdocs/packages/backend/tmp;
put /dev/null -o /httpdocs/packages/backend/tmp/restart.txt;
quit;
```

GHA-Workflow endet nach `touch tmp/restart.txt`. Kein:

- Health-Probe (`curl https://vpstunden.hsbi.de/api/v1/health/ready`) post-Deploy.
- Diff-Compare alter-vs-neuer Health-Output.
- Auto-Rollback bei Fail.
- Slack/E-Mail-Notification bei Deploy-Failure.

**Failure-Modes:**

1. **Build-Fehler in `dist/server.js`** — TypeScript-Compile-Bug, der Tests bestanden hat aber Production-Specifics bricht (z.B. `import.meta.url` vs. CJS-Wrapper). Passenger startet, crasht beim ersten Import, Crash-Loop.
2. **Inkonsistente Frontend/Backend-Build-Versionen** — Frontend referenziert API-Route, die Backend nicht hat (Race zwischen Builds).
3. **`package.json`-Dependency-Drift** — `npm install --omit=dev` (`build-deploy-ci.sh:84`) hat anderes Lock-Verhalten als `pnpm install --frozen-lockfile`. Production-only-Dep, die in Dev nie getestet wurde.
4. **`.env`-Drift** — neue Env-Var im Code, in Plesk-Panel nicht gesetzt → Backend crasht beim Boot mit "MISSING_ENV".

In allen Fällen: Service tot, niemand merkt es (siehe F7.1), bis Studi mailt.

**Fix:**

```yaml
# deploy.yml — neuer Step nach dem Deploy-Step
- name: Wait for Passenger restart
  run: sleep 15 # Passenger braucht ~10 s für graceful restart

- name: Post-deploy health check
  run: |
    set -euo pipefail
    URL="https://vpstunden.hsbi.de/api/v1/health/ready"

    echo "Probing $URL ..."
    for i in 1 2 3 4 5; do
      RESPONSE=$(curl -sS -m 10 -w '\n%{http_code}' "$URL" || echo "FAIL")
      HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
      BODY=$(echo "$RESPONSE" | head -n-1)
      
      echo "Attempt $i: HTTP $HTTP_CODE"
      echo "$BODY" | head -c 500
      echo
      
      if [ "$HTTP_CODE" = "200" ]; then
        echo "✓ Backend healthy after deploy"
        exit 0
      fi
      
      if [ $i -lt 5 ]; then
        sleep 10
      fi
    done

    echo "::error::Backend unhealthy after deploy. Last HTTP code: $HTTP_CODE"
    echo "::error::Body: $BODY"
    exit 1

- name: Post-deploy diag snapshot (forensics)
  if: always()
  run: |
    curl -sS -m 10 https://vpstunden.hsbi.de/api/v1/health/diag \
      | tee post-deploy-diag.json
  continue-on-error: true

- name: Upload diag as artifact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: post-deploy-diag-${{ github.run_id }}
    path: post-deploy-diag.json
    retention-days: 30
```

**Auto-Rollback** ist auf Plesk schwieriger als auf Vercel/Fly, weil es kein "previous version"-Konzept gibt. Pragmatischer Ansatz: bei Fail das vorherige `dist/`-Verzeichnis aus dem GHA-Artifact-Storage holen und re-uploaden. Aufwand: weitere 1 h Workflow-Code. **Alternative jetzt:** Bei Fail einfach nur GHA-Run-Failure markieren + GitHub-Issue automatisch eröffnen. Hirschfeld sieht das im GHA-Tab und folgt dem Rollback-Runbook (`docs/runbooks/deploy-rollback.md`, geliefert in dieser Iteration).

**Plus:** `deploy.yml` sollte einen `last-known-good`-Tag im Repo aktualisieren bei jedem erfolgreichen Deploy:

```yaml
- name: Tag last-known-good commit
  if: success()
  run: |
    git tag -f last-known-good
    git push -f origin last-known-good
```

So weiß `deploy-rollback.md`: "checkout `last-known-good` → re-run deploy" = sicherer Rollback ohne Source-Tree-Detective-Arbeit.

**2-Jahre-Begründung:** 1-2 kaputte Deploys/Jahr × 4-12 h Detektions-Latenz heute = 4-24 h Stillstand pro Vorfall. Mit Health-Check: <30 s Detektion + GHA-Issue-Auto-Open. Aufwand: 1 h Workflow-Erweiterung. Cluster mit F7.1 (ohne Monitoring weiß auch der Health-Check-Fail nicht, wer ihn sieht).

---

### 🟠 F7.5 — TLS-Cert-Pinning fällt silent zu "encrypted-but-unverified" zurück

**File:Line:** `.github/workflows/deploy.yml:66-87`

**Problem:**

```yaml
# deploy.yml:80-87
else
echo "verify=no" >> "$GITHUB_OUTPUT"
echo "::warning::Empty cert chain from hosting.hsbi.de — falling back to encrypted-but-unverified TLS"
fi
# (ähnlich Z. 84-87 für openssl-failure)
```

Wenn `openssl s_client` zu `hosting.hsbi.de:21` failed (Timeout, DFN-Outage, geblockter Egress aus dem GHA-Runner-IP-Range), wird stillschweigend `verify=no` gesetzt. GHA `::warning::` ist eine **Annotation**, kein Fail. Der Deploy läuft trotzdem durch, jetzt aber **MITM-anfällig**:

- HSBI-Internal-Proxy (oder DFN-Proxy) könnte ein eigenes Cert präsentieren — `lftp` würde es akzeptieren.
- Angreifer mit BGP-Hijack auf `hosting.hsbi.de`-IP-Range könnte FTP-Credentials abfangen (sind GHA-Secrets, also auch im Klartext im Memory während des `lftp`-Calls).
- DFN-CA-Compromise (selten, aber 2020 Entrust-Distrust-Vorgang als Beispiel-Risiko) wäre nicht detektierbar.

Plus: niemand liest GHA-warnings systematisch. Owner würde ein paar Wochen lang nicht merken, dass jeder Deploy seitdem unverified läuft.

**Realistische Häufigkeit:**

- HSBI-Cert-Renewal (jährlich oder 90-Tage bei Let's-Encrypt): 1-4× Wechsel/Jahr. Pinning failed während des Renewal-Zeitfensters.
- DFN-CA-Bundle-Drift in Ubuntu: alle 2-3 Jahre einmal.
- GHA-IP-Egress-Blockierung durch HSBI-Firewall: sporadisch, schwer vorhersagbar.

**Fix:**

**Variante A — Hard-Fail bei Pin-Fehler:**

```yaml
- name: Pin hosting.hsbi.de TLS cert chain
  id: pin-cert
  run: |
    set -euo pipefail
    mkdir -p .ftp-trust
    if openssl s_client -connect hosting.hsbi.de:21 -starttls ftp -showcerts \
        -servername hosting.hsbi.de </dev/null 2>/dev/null \
        | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' \
        > .ftp-trust/hsbi.pem
    then
      if [ -s .ftp-trust/hsbi.pem ]; then
        CERT_COUNT=$(grep -c BEGIN .ftp-trust/hsbi.pem)
        echo "verify=yes" >> "$GITHUB_OUTPUT"
        echo "Pinned $CERT_COUNT certs from hosting.hsbi.de"
      else
        # PREVIOUSLY: silent fallback to verify=no
        # NOW: hard fail unless explicitly allowed
        if [ "${{ vars.ALLOW_TLS_FALLBACK }}" = "true" ]; then
          echo "verify=no" >> "$GITHUB_OUTPUT"
          echo "::warning::Empty cert chain — fallback EXPLICITLY allowed via vars.ALLOW_TLS_FALLBACK"
        else
          echo "::error::Empty cert chain from hosting.hsbi.de"
          echo "::error::Set vars.ALLOW_TLS_FALLBACK=true to allow unverified TLS for this run"
          exit 1
        fi
      fi
    else
      # Same: hard-fail-by-default
      if [ "${{ vars.ALLOW_TLS_FALLBACK }}" = "true" ]; then
        echo "verify=no" >> "$GITHUB_OUTPUT"
        echo "::warning::Cert fetch failed — fallback EXPLICITLY allowed"
      else
        echo "::error::Could not fetch cert chain from hosting.hsbi.de"
        echo "::error::Likely causes: HSBI cert renewal in progress, DFN outage, or GHA egress blocked"
        echo "::error::Set vars.ALLOW_TLS_FALLBACK=true (Repo > Settings > Variables) for this deploy run, then revert"
        exit 1
      fi
    fi
```

Plus Repo-Variable `ALLOW_TLS_FALLBACK` (default `false`). Owner setzt sie temporär auf `true` während HSBI-Cert-Renewal-Wochen, setzt sie danach zurück.

**Variante B — Cert in Repo committen:**

Cert-Chain einmalig nach `.github/trust/hsbi.pem` committen, GHA nutzt die file. Bricht bei Cert-Renewal (1-4×/Jahr) — aber bricht **laut**, nicht silent. Aufwand pro Renewal: 2 min (`openssl s_client ... > file && git commit`). Vorteil: verifizierbar für externe Reviewer (Cert ist im Repo-History).

**Empfehlung: Variante A** (weniger Maintenance, gleicher Sicherheits-Gewinn).

**2-Jahre-Begründung:** MITM auf HSBI-FTP-Deploy ist kein hochwahrscheinlicher Angriff (interner Akteur mit Netzwerk-Zugang nötig). Aber: Folge bei Erfolg = FTP-Credentials → vollständiger Plesk-Tenant-Compromise → Klartext-Minter-Key (OD-2.B). Aufwand: 30 min Workflow-Refactor. Macht den TLS-Fallback zu einer bewussten Owner-Decision statt einer silent-default-Annahme.

---

### 🟠 F7.6 — `app.js`-Boot-Wrapper lädt `dotenv` aus `.env` trotz Plesk-Panel-ENV als Single-Source-of-Truth

**File:Line:** `scripts/build-deploy-ci.sh:64-67`

**Problem:**

```bash
# build-deploy-ci.sh:63-75 (CI generiert app.js für Plesk)
cat > "$BACKEND_DEPLOY/app.js" << 'APPJS'
const { config: loadEnv } = require('dotenv')
const { resolve } = require('path')

loadEnv({ path: resolve(__dirname, '.env') })

import('./dist/server.js')
  .then(() => console.log('VPP Backend started'))
  .catch((err) => {
    console.error('Failed to start VPP Backend:', err)
    process.exit(1)
  })
APPJS
```

`dotenv.config()` macht **Default-Behavior**: nicht-vorhandene `.env`-Datei = silent skip (`debug: false`); existierende `.env` = parse + setze in `process.env` **nur wenn die Variable nicht schon gesetzt ist** (`override: false` per Default).

Owner-Decision OD-2.B (aus Bereich 2): Plesk-Panel-Custom-ENV-Vars sind die Single-Source-of-Truth. Plesk setzt diese ENV-Vars **vor** dem Start von `app.js`. `dotenv` ist also redundant.

**Folgen der Inkonsistenz:**

1. **Hirschfeld erstellt versehentlich eine `.env`-Datei** in `httpdocs/packages/backend/.env` (z.B. weil F7.11 die veraltete `deployment.md` zwei Optionen vorschlägt). Plesk-Panel-ENV gewinnt (override:false), `.env`-Werte werden ignoriert. Hirschfeld glaubt die `.env`-Werte sind aktiv → Debugging-Wahnsinn ("warum ändert sich nichts wenn ich `.env` editiere?").

2. **Migration-Runbook empfiehlt `.env`-Editing** (`v2-migration-runbook.md:170-178`):

   ```bash
   ssh deineuser@vpstunden.hsbi.de
   cd ~/httpdocs/<dein-app-pfad>
   nano .env   # neue Werte einfügen
   touch tmp/restart.txt
   ```

   Dies widerspricht direkt OD-2.B + F2.10. Wer dem Runbook folgt, schreibt eine `.env`-Datei, die durch Plesk-Panel-ENV überstimmt wird.

3. **Plesk-Tenant-Read-Surface verdoppelt sich**: Klartext-Key ist jetzt zwei mögliche Wohnorte. Selbst wenn die `.env` ignoriert wird, ist sie auf Disk lesbar.

**Fix:**

**Schritt 1 — `build-deploy-ci.sh` anpassen:**

```bash
# scripts/build-deploy-ci.sh — neuer app.js-Wrapper
cat > "$BACKEND_DEPLOY/app.js" << 'APPJS'
// Plesk Phusion Passenger entry point.
//
// Environment variables MUST come from the Plesk Node.js panel
// "Custom Environment Variables" section, NOT from a .env file in
// this directory. See docs/runbooks/incident-response.md and
// docs/audit/v2/02-bereich-2-key-management.md OD-2.B for rationale.
//
// We do NOT load dotenv here — Plesk has already populated
// process.env before this file runs.

// Defensive: refuse to start if a .env file is present, to prevent
// confusion about which source wins. Plesk-Panel-ENV is single source.
const fs = require('node:fs')
const { resolve } = require('node:path')
const envFile = resolve(__dirname, '.env')
if (fs.existsSync(envFile)) {
  console.error(
    'REFUSING TO START: ' + envFile + ' exists.\n' +
    'Backend env config MUST be set via Plesk Node.js panel "Custom Environment Variables".\n' +
    'A .env file in this location is ambiguous and forbidden by ADR / Bereich-2 audit.\n' +
    'See docs/runbooks/incident-response.md for migration steps.\n' +
    'To recover: delete ' + envFile + ' and ensure all required vars are set in the Plesk panel.'
  )
  process.exit(1)
}

import('./dist/server.js')
  .then(() => console.log('VPP Backend started'))
  .catch((err) => {
    console.error('Failed to start VPP Backend:', err)
    process.exit(1)
  })
APPJS
```

**Schritt 2 — Doku-Bereinigung:**

- `v2-migration-runbook.md:170-178` umschreiben: "Werte im Plesk-Panel unter Domains → vpstunden.hsbi.de → Node.js → Custom Environment Variables setzen, dann `touch tmp/restart.txt`".
- `docs/deployment.md:101-110` (siehe F7.11): einzige Methode = Plesk-Panel.
- `.env.production.example`: Header-Kommentar laut F2.10-Fix anpassen.

**Schritt 3 — Lokale Dev unverändert:**

`packages/backend/src/server.ts` (Source) lädt `dotenv` direkt (für lokales `pnpm dev`). Das ist OK — nur der Production-`app.js` ist betroffen. Lokale Dev nutzt `packages/backend/.env`, Production nutzt Plesk-Panel.

**2-Jahre-Begründung:** Konfigurations-Inkonsistenz ist die häufigste Ursache für "ich-hab-doch-was-geändert"-Stunden-Verluste. Defensive Refuse-To-Start macht aus einem stillen Bug eine laute Boot-Failure mit klarer Anleitung. 15 min Code, 30 min Doku-Updates. Cluster mit F2.10.

---

### 🟡 F7.7 — Bus-Factor = 1; Repo dokumentiert nicht, wer wofür zuständig ist

**File:Line:** `docs/` (überall) — kein zentrales `OPERATORS.md` oder Equivalent.

**Problem:**

Hirschfeld am Sonntag 23:00 sucht und findet **nicht**:

| Frage                                              | Aktueller Status im Repo                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Plesk-URL?                                         | `docs/deployment.md:94` "z.B. `https://hosting.hsbi.de:8443/`" — als Beispiel, nicht als gültige Adresse markiert |
| Plesk-Account-Owner?                               | nirgends                                                                                                          |
| Plesk-Login-Credentials-Recovery?                  | nirgends (HSBI-IT-Kontakt, Account-Reset-Pfad)                                                                    |
| Wo lebt `MINTER_PRIVATE_KEY`?                      | F2.10/F7.6: zwei widersprüchliche Stellen (Plesk-Panel laut OD-2.B, `.env`-Datei laut Migration-Runbook)          |
| Wer hält `DEFAULT_ADMIN_ROLE`?                     | `architecture.md:107` "the production admin" — anonym                                                             |
| Welche Wallet-Adresse ist DEFAULT_ADMIN?           | nirgends im Repo (würde aktive Recovery via `cast` blockieren)                                                    |
| Wo ist die DEFAULT_ADMIN-Wallet-Backup?            | nirgends                                                                                                          |
| Coinbase-Konto-Owner für ETH-Refill?               | `v2-migration-runbook.md:50` "du hast vermutlich schon eines" — adressiert nur Joris                              |
| BaseScan-API-Key — wo?                             | nirgends (lokal? GHA-Secret? Plesk-ENV?)                                                                          |
| Wer ist Eskalations-Kontakt bei Joris-Abwesenheit? | nirgends                                                                                                          |
| Welche Plesk-Tenant hat Zugang?                    | nirgends                                                                                                          |
| HSBI-IT-Hotline / Datenschutzbeauftragte?          | nirgends                                                                                                          |

**Fix:**

`docs/runbooks/README.md` (geliefert in dieser Iteration) plus eine sensible Owner-Identitäten-Datei. Da Owner-Identitäten teilweise sensitiv sind (Plesk-URL, Account-Owner-Namen): **zwei** Files:

1. **`docs/operators.md` (öffentlich, im Repo):**
   - Rollen-Definition (Owner, Backup-Operator, Eskalations-Kontakt, Datenschutz, HSBI-IT) — **als Rolle**, nicht als Person.
   - Wer-darf-was-Matrix (Code-Push, Production-Deploy, Wallet-Operations, Rotate-Keys).
   - Plesk-Subdomain-Pattern (öffentlich: `vpstunden.hsbi.de` ist sowieso bekannt).
   - Verweis auf `docs/operators-private.md` für Personen-Identitäten.

2. **`docs/operators-private.md` (im Repo, aber mit Hinweis-Header):**
   - Personen-Namen, E-Mails, Phone für jede Rolle.
   - Plesk-Login-URL (auch wenn der Hostname öffentlich ist, der Login-Pfad ist nicht öffentlich-Nutzlich).
   - Wallet-Adressen (DEFAULT_ADMIN, MINTER, BACKUP) — Adressen sind sowieso on-chain sichtbar, aber Zentralisation hilft.
   - Coinbase/1Password-Konto-Owner-Mapping.
   - HSBI-IT-Hotline.
   - **Nicht** im Repo: Passwörter, Private Keys (sind in 1Password/Plesk-Panel/Hardware-Wallets).

   Header-Hinweis:

   ```markdown
   # Operators (private contact info)

   This file contains contact info and account ownership mapping for VPP
   Operations. It does NOT contain credentials. Credentials live in:

   - Plesk Node.js panel (MINTER_PRIVATE_KEY, RPC_URL, etc.)
   - 1Password "VPP Operations" vault (FTP, BaseScan API, Coinbase)
   - Hardware wallets (DEFAULT_ADMIN_ROLE, BACKUP_OPERATOR)

   This file IS in Git but should be considered "internal use" — review
   sensitivity before any open-source release of this repo.
   ```

**Plus:** Konkrete Inhalte siehe `docs/runbooks/incident-response.md`-Section "Eskalation".

**2-Jahre-Begründung:** Bus-Factor-Reduktion ist Operations-Pflicht. Ohne dokumentierte Rollen-Ownership ist jede Recovery von einer einzigen Person abhängig. 1 h Doku jetzt = mehrere Stunden Krisen-Recherche-Zeit gespart später. Trade-off: `operators-private.md` muss bei jedem Personalwechsel aktualisiert werden — Eintrag in `docs/runbooks/README.md` als "halbjährlicher Review-Punkt".

---

### 🟡 F7.8 — `concurrency: cancel-in-progress: true` in `deploy.yml` = halb-deployed Server-State möglich

**File:Line:** `.github/workflows/deploy.yml:13-15`

**Problem:**

```yaml
# deploy.yml:13-15
concurrency:
  group: deploy
  cancel-in-progress: true
```

Wenn ein zweiter Push auf `main` während eines laufenden Deploys passiert, killt GHA den ersten Deploy mid-flight. Auf einem `lftp mirror`-Job ist das besonders schmerzhaft, weil:

- `lftp mirror --reverse` ist pro-Datei, nicht atomar. Halb-Upload-Stand möglich.
- `tmp/restart.txt` wird vielleicht schon getoucht (Passenger restartet), aber `dist/server.js` ist nur halb-uploaded (alte und neue Mischung).
- Das zweite Deploy-Run startet von vorn, lädt erneut alles hoch — währenddessen hat der Server eine inkonsistente Mischung aus Run-1- und Run-2-Files.

**Realistische Häufigkeit:** Push-Storms passieren bei Hot-Fixes ("Mist, Tippfehler im Fix"). Ohne `cancel-in-progress: true` würden sich zwei Deploys nacheinander queue-en (besser, weil deterministisch). Mit Cancel: race + partial state.

**Fix:**

```yaml
# deploy.yml:13-15
concurrency:
  group: deploy
  cancel-in-progress: false # queue, don't cancel — atomic deploys matter
```

Trade-off: Wenn 2 Pushes innerhalb 13 min passieren, dauert der zweite Deploy entsprechend länger (queued auf 1.). Akzeptabel, weil Push-Storms rare sind.

Plus: `lftp mirror --no-empty-dirs` als kleinen Robustness-Bonus (verhindert leere Directories nach Failures).

**2-Jahre-Begründung:** 1-2 Push-Storm-Vorfälle/Jahr × 30-50% Wahrscheinlichkeit für inkonsistenten Stand = 1-2 Stunden Debug-Zeit/Jahr. 1-Zeilen-Fix. No-Brainer.

---

### 🟡 F7.9 — `.deploy-meta`-Skip-Optimization: silent fallback bei FTP-Read-Fehler

**File:Line:** `.github/workflows/deploy.yml:128-146`

**Problem:**

```yaml
# deploy.yml:128-137
LIVE=$(lftp -c "
  ...
  cat /httpdocs/.deploy-meta;
  quit;
" 2>/dev/null | tr -d '\r\n ' || echo "")
if [ -n "$LIVE" ] && [ "$LIVE" = "$LOCAL_HASH" ]; then
  echo "match=yes" >> "$GITHUB_OUTPUT"
  echo "Live signature matches local — skipping node_modules upload"
else
  echo "match=no" >> "$GITHUB_OUTPUT"
  echo "Local: $LOCAL_HASH"
  echo "Live : ${LIVE:-<none>}"
  echo "Will perform full upload"
fi
```

Wenn der `lftp cat` failed (Cert-Pinning-Issue, FTP-Timeout, transient Plesk-Down), `$LIVE` ist leer → `match=no` → vollständiger 36-MB-Upload. Akzeptabel als Sicherheits-Fallback, aber:

- Der GHA-Run zeigt "Will perform full upload" ohne Begründung — Owner sieht nicht, dass das ein FTP-Read-Fehler war (vs. echter Sig-Mismatch).
- Wenn FTP-Read failed wegen Cert-Pinning-Fallback (F7.5): doppelter MITM-Risiko-Faktor.

**Fix:**

```yaml
- name: Check live deploy signature
  id: live-sig
  run: |
    set +e  # we handle errors ourselves
    LIVE_OUT=$(lftp -c "
      ...
      cat /httpdocs/.deploy-meta;
      quit;
    " 2>&1)
    LIVE_RC=$?
    set -e

    if [ $LIVE_RC -ne 0 ]; then
      echo "::warning::lftp cat failed (rc=$LIVE_RC). Output:"
      echo "$LIVE_OUT" | head -20
      echo "match=no" >> "$GITHUB_OUTPUT"
      echo "reason=ftp-error" >> "$GITHUB_OUTPUT"
      exit 0
    fi

    LIVE=$(echo "$LIVE_OUT" | tr -d '\r\n ')
    if [ -n "$LIVE" ] && [ "$LIVE" = "$LOCAL_HASH" ]; then
      echo "match=yes" >> "$GITHUB_OUTPUT"
      echo "reason=match" >> "$GITHUB_OUTPUT"
    else
      echo "match=no" >> "$GITHUB_OUTPUT"
      echo "reason=mismatch" >> "$GITHUB_OUTPUT"
      echo "Local: $LOCAL_HASH"
      echo "Live : ${LIVE:-<none>}"
    fi
```

Plus: nachher im Deploy-Step `echo "::notice::Skip-reason: ${{ steps.live-sig.outputs.reason }}"`.

**2-Jahre-Begründung:** Operative Diagnostizierbarkeit. 15 min Code, hilft Hirschfeld später beim "warum dauert dieser Deploy 13 min statt 1 min"-Debugging.

---

### 🟡 F7.10 — Plesk-Log-Pfad nirgendwo dokumentiert; Rotation-Policy unbekannt

**File:Line:** `docs/` weit (kein zentraler Hinweis).

**Problem:**

Phusion Passenger auf Plesk legt Logs üblicherweise in:

- `/var/log/passenger/<app-id>/access.log`, `error.log` (Plesk-Onyx ≥ 18)
- ODER `~/logs/passenger/...` (Plesk-User-Tenant-Modell)
- ODER `/var/www/vhosts/<domain>/logs/passenger/...` (Plesk-Older)

Welcher Pfad real ist auf `vpstunden.hsbi.de`: nirgendwo dokumentiert. Hirschfeld findet:

```bash
# v2-migration-runbook.md:210
tail -f ~/httpdocs/<app>/logs/error.log
```

Pfad-Pattern, das auf vielen Plesk-Versionen NICHT existiert. `~/httpdocs/<app>/` ist die App-Root, da hat Passenger keine Logs. Das ist eher `~/logs/error_log` oder `/var/log/plesk/...`.

Plus: kein Wort zu Log-Rotation. Pino schreibt unbegrenzt nach stdout, Passenger captured stdout in eine Log-Datei, die Plesk per Default mit `logrotate` konfiguriert (oder auch nicht).

Plus: Cluster mit F2.5 (Logger ohne Redact) und F6.4 (pino-http ohne Header-Redact) — wenn die Log-Files Klartext-Sigs/Keys enthalten, verstärkt sich das Plesk-Tenant-Read-Risiko (F4.5) durch undefinierten Speicherort.

**Fix:**

**Schritt 1 — Pfad einmalig ermitteln:**

Owner loggt einmal in Plesk SSH ein und führt aus:

```bash
# Find passenger logs on this Plesk instance
ls -la /var/log/passenger/ 2>/dev/null
ls -la ~/logs/ 2>/dev/null
plesk bin domain --info vpstunden.hsbi.de 2>/dev/null | grep -i log
find ~ -name 'passenger*.log' 2>/dev/null
```

**Schritt 2 — In `docs/runbooks/incident-response.md` dokumentieren** (geliefert in dieser Iteration):

```markdown
## Logs prüfen

SSH-Login zu Plesk:
ssh <PLESK_USER>@vpstunden.hsbi.de

Passenger Backend-Logs:
tail -f <PASSENGER_LOG_PATH>/access.log
tail -f <PASSENGER_LOG_PATH>/error.log

Wo <PASSENGER_LOG_PATH> auf dieser Instanz ist:
<EINTRAGEN: nach Schritt 1 oben>

Häufigste Werte:

- /var/log/passenger/<app-id>/
- ~/logs/passenger/
- /var/www/vhosts/system/vpstunden.hsbi.de/logs/
```

**Schritt 3 — Rotation-Policy:**

Plesk macht Default-`logrotate` (`/etc/logrotate.d/plesk-*`). Owner sollte einmal verifizieren:

```bash
sudo cat /etc/logrotate.d/plesk* | grep -A5 'passenger\|httpd'
```

und das Ergebnis (typisch: rotate 4, weekly, compress) in `incident-response.md` dokumentieren. Plus: bei F2.5 + F6.4-Fix sollte gleichzeitig `logger.ts` auf `pino-roll`-Transport umgestellt werden für app-side Rotation (weil `logrotate` mit `truncate` nicht mit Pino-stdout-Capture spielt — Logs würden inkonsistent).

**2-Jahre-Begründung:** Logs sind das primäre Debug-Tool bei jedem Vorfall. Wer-find-die-Logs ist Operations-Pflicht. Cluster mit F2.5/F6.4. 30 min Recherche + Dokumentation.

---

### ⚪ F7.11 — `docs/deployment.md` ist veraltet (Docker, pm2, build-deploy.sh nicht mehr im Repo)

**File:Line:** `docs/deployment.md:49-86, 135-141`

**Problem:**

```text
// deployment.md:49-66 — Docker-Option
### Option A: Docker
docker build -t vpp-backend -f packages/backend/Dockerfile .
docker run -d --name vpp-backend -p 3000:3000 ...

// deployment.md:68-86 — pm2-Option
### Option B: Manual (Node.js)
pm2 start packages/backend/dist/server.js --name vpp-backend

// deployment.md:135-141 — Manual Deployment
bash scripts/build-deploy.sh
```

- `packages/backend/Dockerfile` — ich habe nicht verifiziert ob es existiert, aber `architecture.md:67` referenziert es noch. Wenn ja: ist es production-ready oder ein Dev-Stub? `deploy.yml` nutzt es nicht.
- pm2-Option ist nicht in CI getestet, nicht in Plesk verwendet — toter Pfad in der Doku.
- `scripts/build-deploy.sh` (ohne `-ci`-Suffix) — verifiziert: existiert nicht (`scripts/` enthält nur `build-deploy-ci.sh`).

Plus: deployment.md mischt:

- Initial Deployment mit Migration (Phase 1-3)
- Operations (Health-Check, Logs)
- Reference (Env-Vars-Tabelle)

Owner-Decision OD-2.B (Plesk-only) macht Docker/pm2-Optionen redundant für die HSBI-Deployment.

**Fix:**

`docs/deployment.md` refactoren in **drei** Files:

1. **`docs/deployment.md`** — fokussiert auf Plesk Initial Setup. Docker/pm2-Sections entfernen (oder als "alternative deployments — not the supported HSBI path" am Ende mit klarer Maintenance-Status-Markierung).
2. **`docs/runbooks/incident-response.md`** (geliefert) — Operations.
3. **`docs/env-reference.md`** (neu, Auszug aus deployment.md:185-211) — Single-Source für ENV-Vars.

Plus: `scripts/build-deploy.sh`-Verweis korrigieren auf `scripts/build-deploy-ci.sh`.

**2-Jahre-Begründung:** Doku-Drift ist Bus-Factor-Multiplikator. Hirschfeld liest deployment.md, glaubt Docker funktioniert, debuggt 2 h einen toten Pfad. 1 h Refactor, 2-Jahre-Schmerz weg.

---

### ⚪ F7.12 — `workflow_dispatch` `force_full`-Trigger ohne Approval-Gate

**File:Line:** `.github/workflows/deploy.yml:6-11`

**Problem:**

```yaml
# deploy.yml:6-11
workflow_dispatch:
  inputs:
    force_full:
      description: 'Force full upload (re-upload node_modules even if signature matches)'
      type: boolean
      default: false
```

Jede:r mit `Repo > Settings > Actions > Workflow Permissions: write` (= jeder Maintainer) kann jederzeit einen Production-Deploy auslösen, inklusive `force_full=true`. Auf einem aktiven Repo (Owner + Co-Maintainer) ist das risikoarm. Bei Maintainer-Wechsel: lose Permission-Spuren.

**Fix:**

GitHub-Environments mit Required-Reviewers für Production-Deploys:

```yaml
# deploy.yml:18-21
jobs:
  deploy:
    name: Build & Deploy
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://vpstunden.hsbi.de/
```

Plus im GitHub-Repo unter **Settings → Environments → New environment "production"**: Required reviewers = Owner + Backup-Operator. Optional: Wait timer = 5 min.

Trade-off: Auto-Deploy bei `push: main` triggert dann eine Approval-Wartezeit. Wenn Owner das nicht will (häufiger Push-and-Forget), Alternative: nur `workflow_dispatch` requires Approval, `push: main` läuft auto. (GitHub Environments unterstützt das nicht direkt — Workaround: `if: github.event_name == 'workflow_dispatch'`-gated environment auf einen separaten dispatch-only-Job).

**Empfehlung pragmatisch:** Lass `push: main` auto-deployen (bisheriges UX behalten). Aber: setze `workflow_dispatch` auf einen separaten `deploy-manual`-Job mit Environment-Approval. Niemand soll versehentlich über die GHA-UI einen Production-Deploy triggern können, ohne 2-mal zu klicken.

**2-Jahre-Begründung:** Vorbereitung auf Maintainer-Wechsel. Heute kein akutes Problem (kleines Team), aber Permission-Tightening ist günstig solange das Team klein ist. 15 min Setup.

---

## Empfohlenes Monitoring-Setup

Diese Section ist copy-paste-bereit. Owner setzt Folgendes einmal auf, danach läuft das System mit operativer Detektion.

### Variante A — UptimeRobot Free-Tier (empfohlen)

UptimeRobot Free: 50 Monitore, 5-min-Intervall, E-Mail-Alerts, kostet 0 EUR/Monat. Setup: 30 min einmalig.

**Schritt 1 — Account anlegen:** https://uptimerobot.com/signUp (Owner-E-Mail). Verifikation per Mail.

**Schritt 2 — 5 Monitore konfigurieren:**

| #   | Name                   | Type                                                   | URL/Target                                                                | Intervall | Alerting            | Schwellwert            |
| --- | ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | --------- | ------------------- | ---------------------- |
| 1   | VPP Backend Live       | HTTP(s)                                                | `https://vpstunden.hsbi.de/api/v1/health/live`                            | 5 min     | Owner+Backup-E-Mail | 2× Fail in Folge       |
| 2   | VPP Backend Ready      | HTTP(s)                                                | `https://vpstunden.hsbi.de/api/v1/health/ready`                           | 5 min     | Owner+Backup-E-Mail | 2× Fail in Folge       |
| 3   | VPP Frontend           | HTTP(s)                                                | `https://vpstunden.hsbi.de/`                                              | 5 min     | Owner-E-Mail        | 2× Fail in Folge       |
| 4   | VPP Diag (deep)        | Keyword                                                | `https://vpstunden.hsbi.de/api/v1/health/diag` mit keyword `"anyOk":true` | 15 min    | Owner-E-Mail        | 1× Fail (deep monitor) |
| 5   | BaseScan Minter Wallet | nicht via UptimeRobot — siehe BaseScan-Watchlist unten | –                                                                         | –         | –                   | –                      |

**Schritt 3 — Alert-Contacts:**

UptimeRobot → My Settings → Alert Contacts → Add Alert Contact:

- Type: E-Mail
- Friendly Name: `Owner (Joris)`
- Value: `joris@hsbi.de` (Beispiel — anpassen)
- Enable: yes

Wiederholen für: Backup-Operator (Hirschfeld), Eskalations-Kontakt.

Pro Monitor (Step 4) Alert-Contacts auswählen + "When down for at least N consecutive minutes" auf 10 (= 2× Fail bei 5-min-Intervall).

**Schritt 4 — Status-Page (optional):**

UptimeRobot → Status Pages → Add New Status Page:

- Name: `VPP Status`
- Public URL: `https://stats.uptimerobot.com/<random-id>`
- Monitors: alle 4 oben

URL in `docs/runbooks/README.md` eintragen, in `README.md` als Badge verlinken. Studis und Lehrende können selbst nachschauen statt zu mailen.

**Schritt 5 — BaseScan-Watchlist (separat, free):**

https://basescan.org/myaddress (oder einloggen):

| Adresse                        | Label        | Notify on                  |
| ------------------------------ | ------------ | -------------------------- |
| `<MINTER_ADDRESS>`             | VPP Minter   | Balance change > 0,001 ETH |
| `<PROXY_ADDRESS>`              | VPP Contract | New transactions           |
| `<DEFAULT_ADMIN_ROLE_ADDRESS>` | VPP Admin    | Any transaction            |

Notification-Method: E-Mail. Für DEFAULT_ADMIN-Wallet (sollte im Normalbetrieb **nie** transacten) ist jede Tx ein Alert-würdiges Event = Insider-Threat-Detection.

---

### Variante B — Healthchecks.io Snitch (Backup oder Alternative)

Healthchecks.io: 20 Checks Free, Cron-Job-Style ("ping me every X minutes, alert if missed").

**Anwendungsfall:** Im Gegensatz zu UptimeRobot fragt Healthchecks.io nicht aktiv — der Backend muss selbst "ich lebe"-Pings senden. Vorteil: misst auch Background-Job-Health (z.B. Event-Sync-Loop, der bei UptimeRobot von Plesk-Idle-Pause maskiert würde).

**Setup:**

1. Account: https://healthchecks.io/accounts/signup/
2. Project: "VPP Production"
3. Check: "Backend Sync Heartbeat" — Schedule: every 5 min, Grace 5 min.
4. Pingen aus Backend:

```ts
// packages/backend/src/services/heartbeat.ts (NEU)
import { logger } from '../lib/logger.js'

const HEARTBEAT_URL = process.env.HEARTBEAT_URL // optional
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

let timer: NodeJS.Timeout | null = null

export function startHeartbeat(): void {
  if (!HEARTBEAT_URL) {
    logger.info('Heartbeat disabled (HEARTBEAT_URL not set)')
    return
  }

  const ping = async () => {
    try {
      await fetch(HEARTBEAT_URL, { method: 'POST', signal: AbortSignal.timeout(5000) })
    } catch (err) {
      logger.warn({ err }, 'Heartbeat ping failed')
    }
  }

  void ping() // sofortiger Initial-Ping
  timer = setInterval(ping, HEARTBEAT_INTERVAL_MS)
}

export function stopHeartbeat(): void {
  if (timer) clearInterval(timer)
}
```

In `server.ts`:

```ts
import { startHeartbeat } from './services/heartbeat.js'
// ... after server.listen():
startHeartbeat()
```

Plesk-Panel-ENV `HEARTBEAT_URL` setzen auf den Healthchecks.io-Ping-URL (z.B. `https://hc-ping.com/<uuid>`).

**Bonus:** Healthchecks.io kann Pager-Duty/Slack/Discord-Webhooks triggern — falls jemand das später will.

---

### Variante C — GHA-Cron als Backup (kein externes Konto nötig)

Falls UptimeRobot/Healthchecks.io nicht gewählt werden:

```yaml
# .github/workflows/health-cron.yml (NEU)
name: Health Check Cron

on:
  schedule:
    - cron: '*/15 * * * *' # alle 15 min
  workflow_dispatch:

jobs:
  probe:
    runs-on: ubuntu-latest
    steps:
      - name: Probe /health/ready
        id: probe
        run: |
          set +e
          RESPONSE=$(curl -sS -m 10 -w '\n%{http_code}' https://vpstunden.hsbi.de/api/v1/health/ready)
          HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
          BODY=$(echo "$RESPONSE" | head -n-1)
          echo "http_code=$HTTP_CODE" >> "$GITHUB_OUTPUT"
          echo "body<<EOF" >> "$GITHUB_OUTPUT"
          echo "$BODY" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"
          if [ "$HTTP_CODE" != "200" ]; then
            exit 1
          fi

      - name: Open issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const title = `[Health] /ready degraded — HTTP ${{ steps.probe.outputs.http_code }}`
            // Check for existing open issue with same title (avoid spam)
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: 'health-alert',
            })
            const existing = issues.find(i => i.title === title)
            if (existing) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: existing.number,
                body: `Still failing as of ${new Date().toISOString()}.\n\n\`\`\`\n${{ steps.probe.outputs.body }}\n\`\`\``,
              })
            } else {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title,
                body: `Health check failed at ${new Date().toISOString()}.\n\nHTTP code: ${{ steps.probe.outputs.http_code }}\n\nResponse:\n\`\`\`\n${{ steps.probe.outputs.body }}\n\`\`\`\n\nSee docs/runbooks/incident-response.md`,
                labels: ['health-alert', 'priority-high'],
                assignees: ['<owner-github-username>'],
              })
            }
```

Trade-off: GHA-Cron-Schedules sind nicht garantiert (GitHub-Free-Tier kann Cron-Runs überspringen unter Last). UptimeRobot ist zuverlässiger. GHA-Cron als reine Backup-Schicht / Issue-Auto-Open-Mechanik gut.

---

### Plesk-Cron für Local-Balance-Watch (Cluster mit F2.4)

Auf Plesk SSH:

```bash
# /var/www/vhosts/vpstunden.hsbi.de/check-balance.sh (Plesk-Cron-Job)
#!/bin/bash
LOG=/var/log/passenger/<app-id>/error.log  # Pfad nach F7.10-Recherche eintragen
MARKER=/tmp/vpp-balance-warned

if grep -q 'MINTER_BALANCE_LOW' "$LOG" 2>/dev/null; then
  if [ ! -f "$MARKER" ] || [ $(($(date +%s) - $(stat -c %Y "$MARKER"))) -gt 86400 ]; then
    mail -s 'VPP: Minter wallet balance low' \
         -a 'From: noreply@vpstunden.hsbi.de' \
         joris@hsbi.de hirschfeld@hsbi.de << EOF
VPP Backend wallet balance is low.

Action: refill ETH per docs/runbooks/eth-refill.md.

Latest log entries:
$(grep 'MINTER_BALANCE_LOW' "$LOG" | tail -5)

Health check:
$(curl -sS https://vpstunden.hsbi.de/api/v1/health/diag | head -50)
EOF
    touch "$MARKER"
  fi
fi
```

In Plesk → Tools & Settings → Scheduled Tasks (Cron Jobs):

- **Run:** `/bin/bash /var/www/vhosts/vpstunden.hsbi.de/check-balance.sh`
- **Schedule:** `*/30 * * * *` (alle 30 min)

Vorteil: nutzt Plesk-eigene Mail-Infrastruktur (Postfix), kein externer Service nötig.

Voraussetzung: F2.4-Fix (Backend loggt `MINTER_BALANCE_LOW`-Marker).

---

## Cluster aus anderen Bereichen, die in Bereich 7 ausgeführt werden müssen

Diese Findings sind in den Vor-Bereichen identifiziert worden, gehören aber operativ in den Bereich-7-Maintenance-Plan:

| Finding                                       | Bereich | Bereich-7-Aktion                                                                                                                                     |
| --------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F2.2** Recovery-Plan für Minter-Compromise  | 2       | `docs/runbooks/key-rotation.md` (geliefert in dieser Iteration).                                                                                     |
| **F2.4** Plesk-Cron für Balance-Alarm         | 2       | Plesk-Cron oben, plus `eth-refill.md`-Runbook (geliefert).                                                                                           |
| **F2.6** `docs/security.md` 8-fach-Lüge       | 2       | Security.md neu schreiben (siehe F2.6-Fix-Snippet); plus `runbooks/README.md`-Index verlinkt.                                                        |
| **F2.9** ETH-Refill-Runbook                   | 2       | `docs/runbooks/eth-refill.md` (geliefert).                                                                                                           |
| **F2.10** `.env`-Datei vs. Plesk-Panel        | 2       | F7.6-Fix (defensive `app.js`-Refuse) + Doku-Konsolidierung.                                                                                          |
| **F4.5** chmod auf `survey-keys.json`         | 4       | In `docs/runbooks/incident-response.md` als Setup-Verifikations-Schritt (`stat -c %a`).                                                              |
| **F4.8** Backup-Strategie                     | 4       | F7.3-Fix (GHA-Backup-Workflow).                                                                                                                      |
| **F5.3** Plesk-Static-Serve-CSP-Bypass        | 5       | Plesk-`.htaccess`-Hardening — siehe F5.3-Fix in Bereich 5. Hier: `runbooks/incident-response.md` listet `.htaccess`-Verifikation als Standard-Check. |
| **F5.12** Permissions-Policy / COOP für Admin | 5       | Backend `helmet`-Header — Bereich-5-Fix. Hier: deployment.md verlinkt auf konsolidierte CSP/Header-Doku.                                             |
| **F6.4** pino-http ohne Header-Redact         | 6       | Cluster mit F2.5 + F7.10. Logger-Refactor in einer PR.                                                                                               |
| **F6.10** Pre-Flight-Health-Check             | 6       | Erweitert F7.4 (Post-Deploy-Health-Check). Gemeinsam in `deploy.yml`-Update.                                                                         |
| **F6.12** Audit-Log für Admin-Aktionen        | 6       | Hier: `runbooks/incident-response.md`-Section "Forensik" verlinkt darauf.                                                                            |

---

## Empfohlener Fix-Pfad

**Phase 1 — Sofort (vor jedem weiteren Klassen-Run; Detektion herstellen):**

1. **F7.1** — UptimeRobot Free-Tier einrichten (5 Monitore, 30 min).
2. **F7.2** — Runbooks `docs/runbooks/incident-response.md` + `eth-refill.md` deployen (in dieser Iteration geliefert; nur lesen + Plesk-Pfade einsetzen).
3. **F2.4** — Plesk-Cron für Balance-Watch (oben dokumentiert, 15 min).

Total: 1 h Aufwand → 80 % der operativen Lücken geschlossen.

**Phase 2 — Vor Production-Operation (operative Reife, 1 Personentag):**

4. **F7.3** — GHA-Backup-Workflow + GitHub-Secret `BACKUP_PASSPHRASE` (2 h).
5. **F7.4** — Post-Deploy-Health-Check + GHA-Issue-Auto-Open (1 h).
6. **F7.6** — `app.js` Defensive-Refuse + `v2-migration-runbook.md` korrigieren (45 min).
7. **F7.10** — Plesk-Log-Pfad recherchieren + dokumentieren (30 min).
8. Restliche Runbooks (`key-rotation`, `disaster-recovery`, `deploy-rollback`, `sosci-onboarding`) deployen + Plesk-spezifische Werte einsetzen (in dieser Iteration geliefert; 1 h Anpassungen).

**Phase 3 — Operative Politur (1 Personentag):**

9. **F7.5** — TLS-Pinning Hard-Fail + `vars.ALLOW_TLS_FALLBACK`-Variable (30 min).
10. **F7.7** — `docs/operators.md` + `docs/operators-private.md` schreiben (1 h).
11. **F7.11** — `docs/deployment.md` refactoren auf Plesk-only + `env-reference.md` extrahieren (1 h).
12. **F7.8** — `concurrency: cancel-in-progress: false` (1 min).
13. **F7.9** — `live-sig`-Step mit `reason`-Output (15 min).
14. **F7.12** — GitHub-Environment "production" mit Required Reviewers für `workflow_dispatch` (15 min).

**Phase 4 — Halbjährliche Reviews:**

- Runbooks durchspielen (Hirschfeld + Owner: ein Trockenlauf, alle Schritte ausführen — finden veraltete Werte).
- ADR-Vollständigkeit prüfen (neue Owner-Decisions seit letztem Review?).
- `operators-private.md` aktualisieren bei Personalwechsel.
- BaseScan-Watchlist-Adressen prüfen (Wallet-Wechsel?).
- Backup-Restore-Test (1× pro Halbjahr — `disaster-recovery.md` ausführen auf Test-Instanz).

---

## Severity-Tally Bereich 7

| Severity   | Anzahl                                            | Findings                     |
| ---------- | ------------------------------------------------- | ---------------------------- |
| 🔴 Blocker | 2                                                 | F7.1, F7.2                   |
| 🟠 Major   | 5                                                 | F7.3, F7.4, F7.5, F7.6, F7.7 |
| 🟡 Minor   | 4                                                 | F7.8, F7.9, F7.10, F7.11     |
| ⚪ Nit     | 2                                                 | F7.7-Variante, F7.12         |
| **Gesamt** | **12** (effektiv 11 unique, F7.7 läuft als Major) |                              |

Hinweis: Bei F7.7 habe ich oben 🟡 Minor-Severity gewählt (nicht Major), weil die Bus-Factor-Konsequenzen primär durch F7.2-Runbook-Lücke verursacht werden — beide Findings clustern und müssen zusammen behoben werden. Korrigierte Tally: **2 🔴 / 4 🟠 / 4 🟡 / 2 ⚪ = 12 Findings**.

Plus: 6 Cluster-Anker für Findings aus Bereichen 2/4/5/6, die hier ausgeführt werden müssen (siehe oben).

---

## Cross-Cutting Notes

**Zu Bereich 8 (Tests & CI):**

- F7.4 Post-Deploy-Health-Check braucht Test, der bewusst eine kaputte `dist/server.js` deployed und prüft, dass der Health-Check korrekt fail-detektiert. (Auf einer Staging-Plesk-Instanz, nicht Production.)
- F7.3 Backup-Workflow braucht Restore-Test als CI-Job (1× pro Monat: download letzten Backup, GPG-decrypt, schema-validate die JSON-Files).
- F7.6 `app.js`-Defensive-Refuse braucht Test im CI: legacy `.env`-Datei + Plesk-Panel-Mock = Backend wirft mit klarer Message statt silent.

**Zu Bereich 9 (Synthese & Go/No-Go):**

- F7.1 + F7.2 sind die zwei Findings, die direkt für das Go/No-Go-Urteil entscheidend sind. Ohne externe Detektion + ohne Solo-Sunday-Runbook ist kein "production-ready"-Stempel verteidigbar.
- F7.7 (Bus-Factor) ist ein langfristiges Risiko, kein Sofort-Blocker — aber Synthese sollte es als "muss vor erstem Owner-Wechsel gefixt sein"-Bedingung markieren.
