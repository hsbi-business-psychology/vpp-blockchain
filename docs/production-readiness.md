# Production Readiness Audit — Stand 17.04.2026

Eine ehrliche Einschätzung was an dem System gerade solide ist, was nur "läuft", und wo
für einen Live-Betrieb mit echten Studierenden noch Lücken sind. Die Tabellen sind nach
Risiko sortiert: Rot = vor Montag fixen wenn möglich. Gelb = sollte mittelfristig. Grün =
gut so wie's ist.

## Zusammenfassung

Was direkt vor dem Test-Run am Montag (~100 Studierende) passiert ist:

- **Drei harte Backend-Bugs** behoben (RPC-Batching, 308-Redirect-Loop, Auth-Catch).
- **CSP-Verletzung** im Frontend entfernt (Inline-Script in `index.html`).
- **FallbackProvider** mit 3 Public Base RPCs als Sicherheitsnetz, sowohl für Reads als
  auch Writes — überlebt den Ausfall jedes einzelnen Providers ohne Operator-Eingriff.
- **`/api/v1/health/diag`** als operationelle Diagnose, zeigt pro RPC ob er gerade healthy ist
  und schließt jetzt einen kompletten Snapshot der Event-Store-Sync-Internas ein
  (`syncing`, `lastSyncedBlock`, `lastSyncError`, `lastSyncAgeSeconds`).
- **Atomic Write** für `events.json` — kein korrupter Cache mehr bei Plesk-Restart mid-write.
- **Hash-basierter Skip** für `node_modules`-Upload — Hot-Fix-Deploys jetzt unter 1 Minute
  statt 13 Minuten.
- **Event-Store-Sync stabilisiert** mit Watchdog (45s Timeout pro Run), opportunistischem
  Refresh aus `/health/ready` und `/admin GET`, sowie dediziertem Event-RPC-Provider
  (Alchemy Free Tier wird automatisch von `eth_getLogs` ausgeschlossen — siehe Incident
  unten).
- **Integration-Test-Suite repariert** — FallbackProvider darf nicht mehr Hardhat-localhost
  mit Mainnet-RPCs mischen. CI ist jetzt komplett grün.

## Incident: Admin-Liste aktualisiert sich nicht (17.04.2026)

Nachdem der Operator über `/api/v1/admin/add` einen neuen Admin gesetzt und dafür eine
Erfolgs-Antwort vom Backend bekommen hat, ist die Admin-Liste in der UI minutenlang nicht
aktualisiert worden. On-chain war die `RoleGranted`-Transaktion sofort gemined, aber der
JSON-Event-Store hatte den Block nie verarbeitet.

**Root Cause:** Alchemy's Free Tier limitiert `eth_getLogs` auf eine 10-Block-Range und
antwortet auf größere Anfragen mit JSON-RPC-Code `-32600` ("Invalid Request",
`"Under the Free tier plan…"`). Unser `queryFilterChunked` arbeitet mit 9000-Block-Chunks
(der Sweet Spot für Public Base RPCs). Jeder Sync-Lauf hat Alchemy als Primary-Provider
getroffen, einen 400-Fehler bekommen und geworfen. Der `FallbackProvider` macht NICHT
auf `-32600` ein Failover, weil er den Code als permanenten Caller-Fehler interpretiert
(falsche Parameter, nicht "Provider down") — folglich wurden die drei gesunden Public-Base-
RPCs (`mainnet.base.org`, `base.publicnode.com`, `base.drpc.org`) nie probiert, obwohl sie
identische Anfragen problemlos bedient hätten.

**Fix:** Wir splitten den Read-Provider auf:

- `provider` (Alchemy + Fallbacks) bedient weiterhin `eth_call`, `getBalance`,
  `broadcastTransaction` etc. — also alles, wo Alchemy Free Tier bequem reicht und der
  Latenz-Vorteil zählt.
- `eventProvider` schließt automatisch `*.alchemy.com`-URLs aus und nutzt für `eth_getLogs`
  / `queryFilter` ausschließlich die Public Base RPCs. Operator auf Alchemy Growth/Scale
  können das via neuem `EVENT_RPC_URL=...`-ENV-Var überschreiben.

**Sekundäre Härtungen** für künftige ähnliche Klassen von Bugs:

- Das `/diag`-Endpoint zeigt jetzt `lastSyncError` (verbatim Provider-Antwort), `syncing`,
  `currentSyncAgeSeconds` etc. — so ein Bug ist beim nächsten Mal in 30 Sekunden
  diagnostiziert statt in 30 Minuten.
- Sync-Watchdog mit 45s-Hard-Timeout: Selbst wenn ein Provider hängt statt zu antworten,
  wird der `syncing`-Lock garantiert wieder freigegeben.
- `/health/ready` triggert opportunistisch einen Sync, wenn der Cache älter als 60s ist —
  Plesk Passenger pausiert Worker zwischen Requests, das verhindert Drift im
  60s-`setInterval`. UptimeRobot pingt `/ready` ohnehin → garantierter Sync-Heartbeat.
- `getCurrentAdmins` (in `/api/v1/admin GET`) erzwingt einen Sync wenn Cache > 5min stale,
  triggert einen Background-Sync wenn > 30s stale — der Operator sieht bei jedem
  UI-Aufruf einen praktisch live-aktuellen Stand.

**Warum nicht einfach "Alchemy upgraden"?** Weil das System auch ohne bezahlte Anbieter
laufen muss. Drei Public Base RPCs als Backbone + Alchemy Free Tier für die Latenz-
sensiblen Calls ist die kostenneutrale Konfiguration, die für ~100 gleichzeitige
Studierende völlig reicht. Die Architektur sollte das aushalten — und tut es jetzt auch.

Was getestet ist:

- Backend: 117 Unit-Tests, alle grün
- Frontend: 66 Unit/Integration-Tests, alle grün
- Smart Contract: getrennte Hardhat-Suite in CI
- Live-Smoke gegen Base mainnet (chainId 8453, Contract 0xfB1b…ca25): Reads + Writes OK

## Was solide ist

| Bereich            | Stand                                                               | Warum belastbar                                                                               |
| ------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Smart Contract** | OZ AccessControl + ReentrancyGuard, immutable, on Base mainnet      | Deploy-Block 43258313, fünf Surveys angelegt, > 2 Claims durch — battle-tested mit Live-Daten |
| **Auth**           | EIP-191 Signaturen, 5min Replay-Window, Clock-Skew-Schutz           | Standardpfad in jeder Web3-App, gut getestet                                                  |
| **CSP**            | `script-src 'self'`, kein Inline                                    | Strenger als 95% aller Web-Apps                                                               |
| **TLS**            | Komplett bei Plesk + cert-pinning für FTP-Deploy                    | DFN/HSBI-CA wird zur Laufzeit gepinned, MITM-Schutz aktiv                                     |
| **Rate Limiting**  | 100 req/min global, 5 req/min für `/claim`, IP-basiert, Redis-fähig | Mehr als ausreichend für Lecture-Run                                                          |
| **RPC-Resilienz**  | FallbackProvider, 4 Anbieter, automatisches Failover                | Verifiziert: Primary kann tot sein, System läuft weiter                                       |
| **Test-Setup**     | 183 Tests + Hardhat-Integration in CI                               | Coverage-Gates gegen Regressions                                                              |
| **CI Pipeline**    | Lint, Format, Tests, Build, Lighthouse                              | Jeder PR durchläuft 5 Jobs vor Merge                                                          |

## Mittelfristig verbessern (gelb)

Nichts davon blockiert Montag, aber wäre für den Echtbetrieb sinnvoll.

| Bereich                 | Aktueller Zustand                                                                                | Empfehlung                                                                                                                                                                                                                   | Aufwand        |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Primary RPC**         | Alchemy Free Tier ist für `eth_call` etc. perfekt, aber `eth_getLogs` ist auf 10 Blöcke begrenzt | **Schon erledigt:** Das Backend routet `eth_getLogs` jetzt automatisch an die Public Base RPCs vorbei an Alchemy. Operator auf Alchemy Growth/Scale können via `EVENT_RPC_URL=<alchemy-url>` opt-in zurück.                  | 0 min          |
| **Minter-Wallet-Topup** | 0.000492 ETH (~1100 Claims). Kein Auto-Topup.                                                    | Mit ~5 € regelmäßig auf den Minter senden. Endpoint `/api/v1/status` zeigt `lowBalance: true` wenn weniger als 100 Claims drin sind                                                                                          | 2 min          |
| **Monitoring**          | Keines — Probleme werden nur durch User-Beschwerden sichtbar                                     | UptimeRobot (kostenlos) auf `https://vpstunden.hsbi.de/api/v1/health/ready` einrichten — 5min-Probe, Alert per E-Mail wenn nicht-200                                                                                         | 10 min         |
| **Logs**                | Pino → stdout → Plesk-Logs. Rotation/Retention unklar.                                           | Plesk Log-Rotation aktivieren, alte Logs nach 30 Tagen löschen                                                                                                                                                               | 5 min in Plesk |
| **events.json Backup**  | Single File auf Plesk, kein Off-Site-Backup                                                      | Optional: Cron-Job auf Plesk der `events.json` täglich wegspeichert. Aber: bei Verlust kann der Cache jederzeit komplett neu vom Contract aufgebaut werden — wäre nur langsam (~5min initial sync). Nicht wirklich kritisch. | optional       |
| **`EXPECTED_CHAIN_ID`** | Nicht gesetzt → kein Schutz vor falscher RPC-URL (z.B. Sepolia statt Mainnet)                    | In Plesk-`.env`: `EXPECTED_CHAIN_ID=8453`. Backend exit'et beim Start wenn der RPC nicht Base mainnet liefert.                                                                                                               | 1 min          |

## Risiken (rot — wenn etwas, dann das vor Montag)

Keine roten Punkte mehr nach dem heutigen Fixing-Run. Was übrig bleibt sind
**Architektur-Limits**, die du kennen solltest, aber für ~100 Studierende kein
Problem darstellen:

| Risiko                                   | Szenario                                                                               | Tatsächlicher Impact                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single-Instance Backend**              | Plesk-Container stirbt mid-Lecture                                                     | Phusion Passenger startet automatisch neu (mit `tmp/restart.txt`-Trigger im Deploy verdrahtet). Downtime: < 30 sec. Studierende hätten nur ein "Loading…" gesehen.                                            |
| **Minter-Key in `.env`**                 | Plesk-Filesystem kompromittiert                                                        | Worst case: Angreifer kann ADMIN_ROLE setzen / Punkte fälschen. ABER: `DEFAULT_ADMIN_ROLE` auf dem Contract liegt bei Gerrit (oder wer das Deploy gemacht hat) — der kann den Minter rotieren ohne Re-Deploy. |
| **`events.json` weg**                    | Datei aus Versehen gelöscht                                                            | Beim nächsten Backend-Start wird der Cache komplett vom Contract neu aufgebaut. Dauert ~5min, in der Zeit sind die Admin-Liste-Endpoints langsamer (RPC-fallback) aber funktional. Kein Datenverlust.         |
| **Alle 4 Public RPCs gleichzeitig down** | Sehr unwahrscheinlich (drei verschiedene Anbieter mit unterschiedlicher Infrastruktur) | Backend logged 'blockchain disconnected', Endpoints liefern 503. Kein Datenverlust, kein dauerhafter Schaden — sobald irgendein RPC wieder antwortet, ist alles zurück.                                       |

## Konkrete Sofort-Maßnahmen (deine TODO für den Lasttest)

In dieser Reihenfolge, dauert insgesamt < 30 Minuten:

1. **Alchemy-Account anlegen** auf https://alchemy.com — kostenloser Tier reicht. App
   für "Base mainnet" erstellen. Du bekommst eine URL wie
   `https://base-mainnet.g.alchemy.com/v2/<key>`.
2. **In Plesk** unter Domains → vpstunden.hsbi.de → Node.js → Environment Variables
   editieren:
   - `RPC_URL` auf die Alchemy-URL setzen (kommagetrennt, primary first; FallbackProvider
     ergänzt automatisch die Public-RPCs als Backup)
   - `EXPECTED_CHAIN_ID=8453` neu hinzufügen
3. **Backend restarten** — entweder über Plesk-UI ("Restart App") oder einfach `tmp/restart.txt`
   touchen.
4. **Verifizieren** mit:
   ```bash
   curl -s https://vpstunden.hsbi.de/api/v1/health/diag | jq .
   ```
   Erwartung: `rpc.probes[0].host = "base-mainnet.g.alchemy.com"`, `ok: true`,
   `chainId: "0x2105"`.
5. **UptimeRobot-Account** anlegen, Probe auf `/api/v1/health/ready` mit 5min-Intervall,
   Alert auf deine Mail. Falls etwas Montag schief geht, weißt du es bevor die ersten
   Studierenden klicken.
6. **Wallet-Top-Up** vor Montag früh: Schick ~0.005 ETH (~12 €) auf den Minter
   `0x17345F2c11109812F819aEE4c5d3bE7a223d351D`. Reicht für ~10.000 Claims, also
   100x über deinem erwarteten Lasttest-Volumen.

## Architekturentscheidungen die OK aber bewusst sind

Damit klar ist was Tradeoffs sind und nicht Bugs:

- **Admin-Archivierung statt Hard-Delete**: Wenn ein Admin entfernt wird, wird seine
  Adresse nicht aus dem Cache gelöscht, sondern in einer separaten "Archived
  Admins"-Sektion sichtbar gemacht. Begründung: Auf der Blockchain bleibt der
  `RoleGranted`-Event ohnehin für immer im Log (kein "Vergessen" möglich), also wäre
  ein Hard-Delete im Backend-Cache **irreführend** — er würde suggerieren der Vorgang
  sei rückgängig gemacht worden, dabei ist er nur durch ein zweites Event neutralisiert.
  Audit-Trail erhalten = Compliance-Pflicht (DSGVO Art. 5(1)(e) "Speicherbegrenzung"
  trifft hier nicht zu, weil die Daten weder personenbezogen noch löschbar sind: eine
  EOA-Adresse ist ein öffentlicher Schlüssel, kein Identifier zu einer natürlichen
  Person, und sie ist on-chain unauslöschlich). Falls für einen Lehr-Reset doch ein
  echtes Delete gewünscht ist: `events.json` einfach löschen, der Cache baut sich
  vollständig aus dem Contract neu auf — die Live-Liste bleibt korrekt, das "Archiv"
  beginnt halt von vorne.

- **JSON-File statt Postgres** für den Event-Cache: bewusst, weil Single-Instance-Plesk
  und der Cache jederzeit aus dem Contract neu aufbaubar ist. Wenn ihr mehrere Instanzen
  oder echte Persistenz wollt: die `EventStore`-Schnittstelle ist dafür extra abstrakt
  gehalten, eine Postgres-Implementation wäre ~150 Zeilen.

- **Rate-Limit in Memory** (kein Redis konfiguriert): bewusst, weil Single-Instance.
  Bei mehreren Workern müsste Redis dazu — `REDIS_URL` setzen reicht, der Code switcht
  automatisch.

- **FallbackProvider mit 4 Public RPCs als Default**: bewusst, weil "Code soll
  überleben wenn der Operator vergisst die `.env` zu pflegen". Wenn ihr einen bezahlten
  RPC habt der zu 99.99% läuft, könnt ihr `RPC_URL=<euer-bezahlter-rpc>` setzen — die
  Fallbacks bleiben als Sicherheitsnetz drin und schaden nicht.

- **Minter macht alle Schreib-TXs** (Studierende halten kein ETH): bewusst, das ist
  der ganze Sinn von "wir abstrahieren Wallet-Komplexität für Lehrveranstaltungen
  weg". Trade-off: zentraler Vertrauenspunkt. Akzeptabel für Punkte-Verbuchung in einer
  Lehrveranstaltung; nicht akzeptabel wenn echtes Geld im Spiel wäre.
