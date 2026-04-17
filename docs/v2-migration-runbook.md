# V1 → V2 Migration Runbook

Dieses Dokument ist die Schritt-für-Schritt-Anleitung für den einmaligen
Wechsel von `SurveyPoints` (V1, immutable) auf `SurveyPointsV2` (UUPS,
upgradefähig, ohne On-Chain-Secrets).

Es richtet sich an die Person, die den Cutover ausführt — also dich. Du
brauchst dafür:

- Lokales Repo, ausgecheckt auf den `main`-Branch
- Node 18 / 20 (nicht 25 — Hardhat warnt zu Recht)
- `pnpm install` einmal frisch gelaufen
- Plesk-Zugang inkl. SFTP/SSH und der `.env`-Datei
- BaseScan-API-Key (gratis, https://basescan.org/myapikey)
- Den Private Key des Deployer-Wallets (= Minter-Wallet, identisch zur
  V1-Konfiguration). Liegt in `packages/contracts/.env` als
  `DEPLOYER_PRIVATE_KEY`.
- Etwas Base-ETH (siehe [ETH-Beschaffung](#eth-beschaffung) unten).
  Faustregel: **0,005 ETH (≈ 15 USD)** reichen für Sepolia-Testlauf
  - Mainnet-Deploy + 50 typische `awardPoints`-Transaktionen.

Die fünf vorab getroffenen Entscheidungen sind im Code abgebildet:

1. **Upgrade-Mechanismus**: UUPS Proxy (Vorteil: günstiger als Beacon,
   keine externe `ProxyAdmin`-Kontraktfläche).
2. **Governance**: Single Admin (du), Multi-Sig später als reine
   `grantRole(DEFAULT_ADMIN_ROLE, multisig)` + `renounceRole(DEFAULT_ADMIN_ROLE, du)`
   nachrüstbar.
3. **Wechselgeld V1 → V2**: V1-Punkte werden **nicht** migriert. Die
   Studierenden behalten sie auf dem alten Vertrag (sind on-chain
   nachweisbar, aber nicht mehr im UI sichtbar). Das matcht deine
   Vorgabe „verwerfen".
4. **V1 deaktivieren**: Ja — der Deploy-Skript ruft `deactivateSurvey`
   auf jeder noch aktiven V1-Survey auf, sobald V2 live ist.
5. **Reihenfolge**: V2 zuerst voll deployen + admins migrieren, danach
   Frontend/Backend cutovern, danach V1 deaktivieren.

---

## ETH-Beschaffung

Base ist eine L2 auf Ethereum. Du brauchst echtes ETH **auf der
Base-Chain**, nicht auf Ethereum L1. Drei realistische Wege:

### Weg A — Direkt auf Base kaufen (am einfachsten, ~5 Min)

1. **Coinbase-Konto** (https://coinbase.com). Du hast vermutlich schon
   eines; wenn nicht, ist die Verifizierung in DE in 1–2 Tagen durch
   (Personalausweis-Scan + Selfie).
2. In Coinbase: **15 EUR mit SEPA aufladen** → kommt in 1–3 Werktagen
   an, oder **per Sofortüberweisung/Kreditkarte**, dauert ~10 Min,
   kostet aber ~3% Aufschlag. Für 15 EUR ist die Karte einfacher.
3. **15 EUR in ETH tauschen** → du bekommst etwa 0,004 ETH.
4. **„Senden" → Netzwerk: Base** (nicht Ethereum!) → Empfängeradresse
   ist deine Deployer-Wallet (`0x…`, du kennst die Adresse aus
   `packages/contracts/.env`'s `DEPLOYER_PRIVATE_KEY` → entweder per
   Skript ausrechnen oder einfach in MetaMask importieren).
5. Coinbase überweist über die offizielle Base-Bridge **kostenlos**
   und in unter einer Minute. Bestätigung erscheint auf BaseScan
   (https://basescan.org/address/<deine_adresse>).

### Weg B — ETH auf L1 kaufen + selbst bridgen

Macht nur Sinn, wenn du schon ETH auf L1 hast. Sonst zahlst du doppelt
Gas. Nutze https://bridge.base.org. Dauert ~10 Min, Brückenkosten
~0,50 USD.

### Weg C — Sepolia-Testnet (kostenlos)

Für den Testlauf vorab brauchst du **Base Sepolia ETH**, das ist
wertloses Testnetz-Geld. Faucets:

- https://www.alchemy.com/faucets/base-sepolia (am zuverlässigsten,
  Alchemy-Login)
- https://faucet.quicknode.com/base/sepolia

Reicht 0,01 Sepolia-ETH fürs gesamte Testen.

### Wieviel brauchst du wirklich?

| Aktion                                | Gas-Verbrauch  | Kosten @ 0,01 gwei (typisch Base) |
| ------------------------------------- | -------------- | --------------------------------- |
| `deployProxy(SurveyPointsV2)`         | ~3,5 M gas     | ~0,35 USD                         |
| Verify auf BaseScan                   | 0              | 0                                 |
| `addAdmin(jasmin)` × 2                | ~50 k gas/each | ~0,01 USD                         |
| `deactivateSurvey()` × bestehende V1  | ~30 k gas/each | ~0,01 USD                         |
| `awardPoints()` (typische Studie)     | ~80 k gas      | ~0,02 USD                         |
| **Studie mit 100 Teilnehmern, total** |                | **~3 USD**                        |

→ **0,005 ETH (~15 USD)** ist eine bequeme Reserve, die ein Semester
hält. Bei höheren Gas-Spitzen (selten auf Base) entsprechend mehr.

---

## Phase 1 — Sepolia-Testlauf (Pflicht!)

Nie direkt auf Mainnet. Sepolia kostet nichts und du fängst hier alle
Konfig-Fehler ab.

```bash
cd packages/contracts

# 1) Sepolia-ETH besorgen (siehe oben)
# 2) .env anpassen — gleiche Datei wie für Mainnet, nur die RPC-URL
#    zeigt schon auf Sepolia (Default).

# 3) V2 deployen + V1 admins migrieren + V1-surveys deaktivieren
ADMIN_ADDRESS=0xDeineSichereWallet \
MINTER_ADDRESS=0xDeineMinterWallet \
V1_CONTRACT_ADDRESS=0xV1AddressVonSepoliaFallsExistiert \
V1_DEPLOY_BLOCK=12345678 \
pnpm deploy:v2:sepolia
```

Wenn du auf Sepolia noch keinen V1 deployt hattest, lass die beiden
`V1_*`-Variablen weg. Der Skript läuft dann als Greenfield-Deploy.

**Output prüfen:**

- `Proxy address: 0x…` — notieren!
- `Deploy block: NNN` — notieren!
- `Migrated admins: N` — sollte zur tatsächlichen Anzahl passen
- `→ Renouncing deployer roles ✔` — bestätigt, dass dein Deploy-Key
  hinterher nicht mehr admin ist

**End-to-End-Test auf Sepolia** (siehe `docs/e2e-testing.md` für die
ausführliche Variante):

1. Backend lokal mit den Sepolia-Werten in `.env.development` starten.
2. In der Admin-UI eine Test-Survey registrieren (V2 → kein Secret
   mehr, dafür wird ein HMAC-Key erzeugt).
3. SoSci-Snippet in eine Test-Survey einbauen, einmal komplett
   durchspielen.
4. Auf https://sepolia.basescan.org/address/<proxy> nachsehen, ob die
   `awardPoints`-Transaktion durchgeht.

Erst wenn das **alles ohne manuellen Eingriff** funktioniert, weiter zu
Phase 2.

---

## Phase 2 — Mainnet-Deploy

```bash
cd packages/contracts

# Funds-Check zuerst — du brauchst min. ~0.002 ETH auf Base mainnet
# auf der Adresse, die DEPLOYER_PRIVATE_KEY entspricht.

ADMIN_ADDRESS=0xDeineSichereWallet \
MINTER_ADDRESS=0xDeineMinterWallet \
V1_CONTRACT_ADDRESS=0xV1AddressMainnet \
V1_DEPLOY_BLOCK=12345678 \
pnpm deploy:v2:mainnet
```

Nach Erfolg:

```
=== Plesk environment variables ===
# Backend (.env)
CONTRACT_ADDRESS=0x...
CONTRACT_DEPLOY_BLOCK=...
CONTRACT_ABI=SurveyPointsV2
# Frontend (.env)
VITE_CONTRACT_ADDRESS=0x...
VITE_CONTRACT_DEPLOY_BLOCK=...
```

**Diese Werte 1:1 in Plesk übernehmen** (Datei: `.env` im Backend-Root)
und Phusion Passenger neu starten:

```bash
ssh deineuser@vpstunden.hsbi.de
cd ~/httpdocs/<dein-app-pfad>
nano .env   # neue Werte einfügen
touch tmp/restart.txt
```

Frontend braucht einen Re-Build mit den neuen `VITE_*`-Werten. Der
GitHub-Actions-Workflow `deploy.yml` macht das automatisch — einmal
auf `main` pushen, fertig.

---

## Phase 3 — Verifikation post-cutover

Nach dem Restart innerhalb von 5 Minuten prüfen:

- `https://vpstunden.hsbi.de/api/v1/health/ready` → `200 OK` mit
  `eventStore.lastSyncedBlock` ≈ aktueller Mainnet-Block
- `https://vpstunden.hsbi.de/api/v1/admin` → Liste enthält alle
  migrierten Admins
- Eine **Test-Survey registrieren**, claimen, auf BaseScan
  bestätigen → wenn das funktioniert, ist der Cutover erfolgreich

**Letzter Schritt: Deploy-Wallet sichern**

Da der Deploy-Key am Ende des Deploy-Skriptes alle Rollen verloren hat
(`KEEP_DEPLOYER_ADMIN` war nicht gesetzt), kann er nichts mehr Schädliches
tun. Trotzdem: leere ihn auf eine Hardware-Wallet, falls dort noch ETH
liegen.

---

## Notfall-Plan

**„Backend startet nach Restart nicht mehr"**

→ Logs prüfen: `tail -f ~/httpdocs/<app>/logs/error.log`. Häufigste
Ursache: `CONTRACT_ABI=SurveyPointsV2` nicht gesetzt → Backend lädt das
V1-ABI und kommt durcheinander.

**„Studierende sehen ihre alten Punkte nicht mehr"**

→ Erwartet. Die V1-Punkte sind on-chain nachweisbar, aber V2 ist ein
neuer Vertrag. Wenn du das doch zurücknehmen willst: Frontend kann mit
einem zweiten ABI / Address-Pair so erweitert werden, dass es V1-Events
zusätzlich anzeigt. Ist nicht im Cutover enthalten — separater Schritt.

**„Falsche Survey aus Versehen deaktiviert"**

→ Auf V2 ist das jetzt reversibel: `reactivateSurvey(id)` aus der
Admin-UI. Auf V1 ging das noch nicht.

**„HMAC-Key kompromittiert"**

→ In der Admin-UI auf der Survey-Detail-Seite „Key rotieren" klicken.
Alle bisher verteilten Claim-URLs werden ungültig; SoSci-Snippet muss
mit dem neuen Key neu generiert werden.

---

## Zukünftige Upgrades (kein neuer Deploy mehr nötig!)

Sobald V2 deployed ist, sind alle Bug-Fixes oder Feature-Erweiterungen
einfache Implementation-Updates am Proxy. Ablauf:

```bash
cd packages/contracts

# 1) Neue Solidity-Datei z.B. SurveyPointsV3.sol anlegen, die von
#    SurveyPointsV2 erbt. Storage-Layout NIE umsortieren — neue
#    Variablen IMMER nur ans Ende anhängen und __gap entsprechend
#    decrementieren. Der OpenZeppelin-Plugin checkt das automatisch.

# 2) Tests ausführen
pnpm test

# 3) Upgrade ausrollen (verbraucht ~1 M gas, ~0.10 USD auf Base)
PROXY_ADDRESS=0xDeinV2ProxyAddress \
IMPLEMENTATION_NAME=SurveyPointsV3 \
pnpm upgrade:v2:mainnet
```

Die Adresse des Proxy bleibt gleich → keine `.env`-Änderung, kein
Frontend-Rebuild. Phusion-Passenger-Restart ist trotzdem ratsam, falls
das Backend cached ABIs hält.
