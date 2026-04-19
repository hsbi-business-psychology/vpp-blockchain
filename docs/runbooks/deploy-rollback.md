# Deploy Rollback — Letzter Deploy ist kaputt

> **Provider-Hinweis:** Beispielbefehle nutzen Plesk + GitHub Actions. Für andere Hoster siehe Mapping-Tabelle in [`README.md`](README.md#zu-hosting-provider-spezifika). Konkrete Werte (Domain, Panel-URL, SSH-User) liegen in `docs/operators-private.md`.

**Wann nutzen:**

- GHA Post-Deploy-Health-Check (F7.4) hat fail gemeldet
- Backend HTTP 502 / 503 nach Deploy
- Studi-Beschwerde "geht nicht mehr" direkt nach Push auf `main`

**Geschätzte Zeit:** 5-15 min (Rollback) ODER 30-60 min (Forward-Fix wenn Rollback unmöglich)
**Voraussetzung:** Repo-Zugang + GHA-Permission

---

## Schritt 0 — Verifikation: Ist es wirklich der Deploy?

Bevor du rollbackst:

1. `curl -sS https://<VPP_INSTANCE>/api/v1/health/diag` → Befund?
2. GHA → letzten Deploy-Run prüfen (`gh run list --workflow=deploy.yml --limit 5`).
3. Letzter Deploy: erfolgreich oder failed?
4. Wenn letzter Deploy **failed**: vermutlich Plesk hat halb-deployed-State (siehe F7.8). → Rollback ist die richtige Aktion.
5. Wenn letzter Deploy **erfolgreich** und Backend trotzdem kaputt: weniger wahrscheinlich Deploy, eher Runtime-Issue (z.B. RPC-Crisis, Wallet leer, Plesk-Resource-Limit). → `incident-response.md`.

---

## Schritt 1 — Last-Known-Good-Tag prüfen

> **Voraussetzung:** F7.4-Fix ist deployed → `last-known-good`-Tag wird automatisch aktualisiert. Wenn nicht: Schritt 1 alternative.

```bash
git fetch --tags
git log -1 last-known-good --format='%h %s (%ai)'
# Erwartet: SHA + commit message + Datum
```

Falls `last-known-good` nicht existiert (F7.4 noch nicht deployed):

**Alternative — letzten erfolgreichen GHA-Deploy finden:**

```bash
gh run list --workflow=deploy.yml --status=success --limit 5 \
  --json headSha,createdAt,conclusion \
  --jq '.[] | "\(.headSha[0:8])  \(.createdAt)  \(.conclusion)"'
```

Notiere den SHA des letzten erfolgreichen Deploys (= Rollback-Ziel).

---

## Schritt 2 — Rollback-Methode wählen

| Methode                                                 | Wann nutzen                                      | Vor-/Nachteile                                     |
| ------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| **A: Re-Deploy aus altem Commit**                       | Standard-Fall                                    | Sauber, deterministisch. ~10 min.                  |
| **B: Git Revert + Push**                                | Wenn der kaputte Commit klar identifizierbar ist | Trail im Git-History bleibt sauber. ~15 min.       |
| **C: Manueller Plesk-Disable + warten auf Forward-Fix** | Wenn beide Optionen oben nicht funktionieren     | Service down, aber wenigstens nicht crash-loopend. |

---

## Methode A — Re-Deploy aus altem Commit (empfohlen)

```bash
# Lokal:
cd <repo>
git fetch
git checkout last-known-good   # oder: git checkout <SHA>

# GHA-Deploy von diesem Commit triggern:
gh workflow run deploy.yml --ref <SHA-or-tag-name> -f force_full=true
```

**Wichtig:** `--ref` zeigt auf den Commit, nicht auf `main`. GHA deployed dann den älteren Stand.

**Watch:**

```bash
gh run watch
# Alternativ:
gh run list --workflow=deploy.yml --limit 1 --json status,conclusion
```

**Verifikation nach Deploy:**

```bash
sleep 15
curl -sS https://<VPP_INSTANCE>/api/v1/health/ready | jq
```

Erwartet: HTTP 200, `status: ok`.

**Wenn immer noch kaputt:** Rollback hat nicht geholfen → Problem ist **nicht** der Deploy. Siehe `incident-response.md`.

**Wenn ok:** Schritt 4 (Forward-Fix planen).

---

## Methode B — Git Revert (Trail-bewusst)

Wenn der kaputte Commit klar identifizierbar ist (z.B. nur ein commit zwischen `last-known-good` und `main`):

```bash
git checkout main
git pull
git revert <KAPUTTER_SHA>
# → erstellt einen neuen Commit "Revert ..."
git push origin main
```

GHA deployed automatisch (push:main-Trigger).

**Vorteil:** Git-History zeigt klar "wir haben rolled back". Nächste:r Maintainer sieht den Trail.
**Nachteil:** ~15 min, weil ein vollständiger Build+Deploy läuft. Bei akutem Crash schneller mit Methode A.

---

## Methode C — Manueller Plesk-Disable (Notbremse)

Wenn weder GHA noch Re-Deploy funktioniert:

1. Plesk-Panel → Domains → `<VPP_INSTANCE>` → **Node.js**
2. **"Disable Node.js"** klicken.
3. Studis sehen Plesk-Default-Page.
4. Owner kontaktieren (siehe `operators-private.md`).
5. Owner muss den Forward-Fix bauen + manuell pushen.

**Akzeptiere:** Service ist down, bis jemand das Backend repariert. Aber: wenigstens kein Crash-Loop, keine Phantom-Requests, kein Wallet-Drain durch buggy retry-Loop.

---

## Schritt 3 — Forensik (was war kaputt?)

Vor dem Forward-Fix: verstehen, warum der Deploy kaputt war.

```bash
# Letzte GHA-Deploy-Logs:
gh run view <RUN_ID> --log

# Backend-Logs aus dem kaputten Zeitraum:
ssh <PLESK_USER>@<VPP_INSTANCE>
tail -200 <PASSENGER_LOG_PATH>/error.log
```

**Häufige Ursachen für kaputte Deploys:**

| Ursache                                       | Indikator im Log                        | Fix                           |
| --------------------------------------------- | --------------------------------------- | ----------------------------- |
| TS-Compile-Bug, in Tests grün, in Prod kaputt | `Cannot find module` / `SyntaxError`    | Code-Fix + neuer Test         |
| Neue ENV-Var nötig, nicht in Plesk gesetzt    | `Missing required environment variable` | Plesk-Panel-ENV setzen        |
| Inkonsistenz Frontend/Backend-Build           | 404 auf API-Route                       | Beide neu bauen               |
| `package.json`-Drift in deploy/-Bundle        | `Cannot find module 'xyz'` beim Boot    | `build-deploy-ci.sh` debuggen |
| `dotenv`-Konflikt nach F7.6-Fix               | `REFUSING TO START: .env exists`        | `.env` auf Plesk löschen      |
| Migration-Skript hat State korrumpiert        | `JSON.parse error`                      | `disaster-recovery.md`        |

---

## Schritt 4 — Forward-Fix planen

Nachdem Rollback erfolgreich:

1. **Lokal** den kaputten Commit auschecken + reproduzieren.
2. Bug fixen, **neuer Test** (CI hätte das fangen müssen — also Test erweitern).
3. Lokal: `pnpm test && pnpm contracts:build && pnpm backend:build && pnpm frontend:build`.
4. PR mit Fix + Test, Owner-Review.
5. Push + GHA-Deploy.
6. Verifikation Post-Deploy-Health-Check (sobald F7.4 deployed).

---

## Schritt 5 — Doku

`docs/incidents/<datum>-bad-deploy.md`:

```markdown
# Bad Deploy <Datum>

## Was war kaputt

- Commit: <SHA>
- Symptom: <z.B. HTTP 502>
- Detection: <UptimeRobot / Studi-Mail>
- Down-Time: <minuten>

## Root Cause

- <Erklärung>

## Warum CI hat es nicht gefangen

- <Lücke>

## Fix

- Rollback auf: <SHA>
- Forward-Fix-PR: <Link>
- Neuer Test: <Beschreibung>

## Verbesserung Pipeline

- <z.B. "Pre-Deploy-Smoke-Test mit ts-node ./dist/server.js direkt nach Build">
```

---

## Wenn `last-known-good` ein altes V1-Schema-State enthält

Sehr unwahrscheinlich nach V2-Migration, aber theoretisch:

- Rollback auf einen Commit, der noch V1-Code hat → Backend nutzt V1-Contract-ABI auf V2-Contract → Errors.
- **Erkennung:** Backend logs `function not found` o.ä. nach Rollback.
- **Fix:** weiter zurück rollen funktioniert nicht. Vorwärts: Hot-Fix-PR.

**Daher: `last-known-good` Tag automatisch updaten** ist wichtig — alte Tags werden mit jedem erfolgreichen Deploy überschrieben, ABER: Owner sollte sie nicht zu lang stehen lassen, weil sie sonst veraltet werden.

Empfehlung: `last-known-good` ist immer der **letzte erfolgreiche Deploy**, nichts weiter zurück. Für ältere Stände → konkreten SHA aus `gh run list` nutzen.
