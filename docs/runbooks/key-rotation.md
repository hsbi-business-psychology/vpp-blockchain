# Key Rotation — `MINTER_PRIVATE_KEY` ist (oder könnte sein) kompromittiert

**Wann nutzen:**

- Verdacht auf Plesk-Tenant-Compromise
- Unerwartete Tx auf Minter-Wallet (BaseScan-Watchlist-Alert)
- `probe.mjs`-artige Files-mit-Klartext-Key gefunden (siehe Bereich 2 F2.1)
- Owner-Entscheidung "wir rotieren proaktiv alle 6-12 Monate"

**Geschätzte Zeit:** 30-90 min, davon 5-15 min echte Service-Unterbrechung
**Voraussetzung:** Zugang zu **DEFAULT_ADMIN_ROLE-Wallet** (Hardware-Wallet empfohlen, in der Owner-Custody)

---

## CRITICAL READ FIRST — Threat-Modell

Owner-Decision **OD-2.A** (Bereich 2): Minter-Wallet hält **ADMIN_ROLE** + **MINTER_ROLE**. Compromise bedeutet:

- Angreifer kann unbegrenzt `awardPoints` aufrufen.
- Angreifer kann **neue Admins ernennen** (`addAdmin` über `addRole(ADMIN_ROLE, attackerWallet)`).
- Angreifer kann Surveys deaktivieren / reaktivieren.
- Angreifer kann **NICHT** das Contract upgraden (`UPGRADER_ROLE` ist beim DEFAULT_ADMIN, separat).
- Angreifer kann **NICHT** den DEFAULT_ADMIN_ROLE löschen (durch Self-Lockout-Schutz im Contract).

**Was du tun musst, in dieser Reihenfolge:**

1. **Schaden begrenzen** (Service tot setzen, Angreifer kann nicht mehr awarden während du arbeitest)
2. **Neue Wallet generieren**
3. **Neue Wallet on-chain mit den Rollen ausstatten** (DEFAULT_ADMIN signt — du brauchst Hardware-Wallet)
4. **Backend mit neuem Key rekonfigurieren**
5. **Alte Wallet entmächtigen** (Rollen revoken)
6. **Alte Wallet leerräumen** (sofern möglich; oder eingestehen dass das ETH verloren ist)

**Falls du die DEFAULT_ADMIN_ROLE-Wallet NICHT hast:** Du kannst die Rollen nicht rotieren. Eskalation: Owner. Wenn Owner unerreichbar: Service permanent off (Plesk-Node.js disable) und auf Owner-Rückkehr warten.

---

## Schritt 0 — Verifikation: Ist es wirklich ein Compromise?

Bevor du dieses Runbook ausführst (= 30-90 min Arbeit + Service-Unterbrechung):

1. **BaseScan-Tx-History des Minter-Wallets prüfen:** `https://basescan.org/address/<MINTER_ADDRESS>`
2. Sind die letzten 24 h Tx alle **erwartete** `awardPoints`-Calls? Wenn ja → kein Compromise, falscher Alarm.
3. Findest du eine **`grantRole(ADMIN_ROLE, ...)`** Tx auf eine **unbekannte** Adresse? → **Compromise bestätigt.**
4. Findest du eine **Tx, die ETH wegtransferiert**? → **Compromise bestätigt.**
5. Sind alle Tx im Normalbereich, aber du hast **anderen Verdacht** (`probe.mjs`-Fund, Plesk-Tenant-Verdacht)? → **Proaktive Rotation** (gleiches Runbook, aber kein Service-Lockout in Schritt 1 nötig).

---

## Schritt 1 — Schaden begrenzen (nur bei aktivem Compromise)

**Ziel:** Backend stoppt awardPoints. Angreifer kann das Contract nur direkt von BaseScan aus benutzen — was er sowieso kann, aber das Backend gibt ihm keine "automatischen" SoSci-Claims mehr.

### Variante A — Backend stoppen (drastisch, aber sauber):

Plesk-Panel:

1. Domains → `vpstunden.hsbi.de` → **Node.js**
2. **"Disable Node.js"** klicken.
3. Frontend zeigt Plesk-Default-Page; Studis können nicht claimen, aber auch keine kompromittierten Tx triggern.

### Variante B — Wallet aus Backend rausnehmen (weniger drastisch):

Plesk-Panel → Custom Environment Variables:

1. `MINTER_PRIVATE_KEY` löschen oder auf einen ungültigen Wert setzen (z.B. `0x0000000000000000000000000000000000000000000000000000000000000001`).
2. Restart: `touch /httpdocs/packages/backend/tmp/restart.txt`
3. Backend startet, aber crash-loopt beim Boot (`assertSufficientBalance` failed) ODER Backend startet, aber `awardPoints` failed mit "INSUFFICIENT_FUNDS".
4. Frontend bleibt erreichbar, Studis sehen Fehler beim Claimen — aber die Service-Outage ist bereits eskaliert via UptimeRobot.

**Empfehlung:** Variante A ist sauberer. Studis sehen "Wartung" statt obskurer Errors.

---

## Schritt 2 — Neue Wallet generieren

> **Wichtig:** Generiere die neue Wallet auf einem **vertrauenswürdigen, aktuellen, Malware-freien Rechner**. NICHT auf dem kompromittierten Plesk-Server. NICHT in einer Online-Webapp ("Vanity-Wallet-Generator" etc.).

### Variante A — Hardware-Wallet (empfohlen für ADMIN_ROLE):

1. Ledger / Trezor → neuen Account generieren.
2. Adresse notieren.
3. Vorteil: Private Key verlässt nie das Gerät. Nachteil: Backend kann nicht direkt damit signen → nicht praktikabel für `MINTER`-Use-Case.

**Daher empfohlen:** Hardware-Wallet **nur für DEFAULT_ADMIN_ROLE**. Für `MINTER` (= `MINTER_PRIVATE_KEY` im Plesk-Panel) bleibt Hot-Wallet die einzige Option (Owner-Decision OD-2.B).

### Variante B — Hot-Wallet via `cast` (lokaler PC):

```bash
# Auf vertrauenswürdigem Laptop (Malware-frei, aktueller OS):
cast wallet new
```

Output:

```
Successfully created new keypair.
Address:     0xNEW_ADDRESS
Private key: 0xNEW_PRIVATE_KEY
```

**Sofort:**

- Adresse in `operators-private.md` notieren (commit später).
- Private Key in 1Password "VPP Operations" speichern (verschlüsselt).
- Lokales Terminal-History löschen: `history -c && history -w`
- Falls Bash-History-File: `cat /dev/null > ~/.bash_history`

### Variante C — MetaMask (komfortabel, aber Klartext im Browser):

Nur OK für `MINTER`-Use-Case (nicht für `DEFAULT_ADMIN`). Owner-Decision OD-2.B akzeptiert sowieso Klartext im Plesk-Panel. Aber: Browser-Extension-Risiko ist hoch.

**Empfehlung:** Variante B (`cast wallet new`).

---

## Schritt 3 — Initial-ETH auf neue Wallet senden

Die neue Wallet braucht ETH, um später Tx zu signen.

```bash
# Aus deiner Owner-EOA oder Coinbase:
# Sende 0,02 ETH (oder mehr) auf <NEW_MINTER_ADDRESS>
# Network: Base
```

→ siehe `eth-refill.md` für Details.

Warte auf Confirmation (3-5 min).

---

## Schritt 4 — Neue Wallet die Rollen geben (DEFAULT_ADMIN signt)

> **Du brauchst:** Hardware-Wallet mit `DEFAULT_ADMIN_ROLE` ODER ein anderes Wallet, das DEFAULT_ADMIN_ROLE hält.

### Variante A — via BaseScan Web-UI (kein Tooling nötig):

1. Öffne: `https://basescan.org/address/<PROXY_ADDRESS>#writeProxyContract`
2. Connect Web3 → Wallet auswählen, die DEFAULT_ADMIN_ROLE hält (Hardware-Wallet).
3. **`grantRole`** finden:
   - `role`: `0x0000000000000000000000000000000000000000000000000000000000000000` (= `DEFAULT_ADMIN_ROLE`-Hash) — **NEIN, falsch! Wir brauchen ADMIN_ROLE und MINTER_ROLE für die neue Wallet:**
   - **ADMIN_ROLE-Hash:** `keccak256("ADMIN_ROLE")` = `0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775` (verify in `architecture.md` oder via `cast keccak "ADMIN_ROLE"`)
   - **MINTER_ROLE-Hash:** `keccak256("MINTER_ROLE")` = `0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6` (verify via `cast keccak "MINTER_ROLE"`)
   - `account`: `<NEW_MINTER_ADDRESS>`
4. **"Write"** → Hardware-Wallet zeigt Tx → bestätigen.
5. Warte Confirmation. Tx-Hash notieren.
6. **Wiederhole für die zweite Rolle** (1× ADMIN_ROLE, 1× MINTER_ROLE = 2 Tx insgesamt).

### Variante B — via `cast` (CLI):

```bash
PROXY="<PROXY_ADDRESS>"
NEW="<NEW_MINTER_ADDRESS>"
ADMIN_HASH=$(cast keccak "ADMIN_ROLE")
MINTER_HASH=$(cast keccak "MINTER_ROLE")
DEFAULT_ADMIN_LEDGER_PATH="m/44'/60'/0'/0/0"  # Standard Ledger-Path

# ADMIN_ROLE für neue Wallet:
cast send "$PROXY" "grantRole(bytes32,address)" "$ADMIN_HASH" "$NEW" \
  --ledger --hd-path "$DEFAULT_ADMIN_LEDGER_PATH" \
  --rpc-url https://mainnet.base.org

# MINTER_ROLE für neue Wallet:
cast send "$PROXY" "grantRole(bytes32,address)" "$MINTER_HASH" "$NEW" \
  --ledger --hd-path "$DEFAULT_ADMIN_LEDGER_PATH" \
  --rpc-url https://mainnet.base.org
```

### Verifikation:

```bash
# Neue Wallet hat ADMIN_ROLE?
cast call "$PROXY" "hasRole(bytes32,address)" "$ADMIN_HASH" "$NEW" \
  --rpc-url https://mainnet.base.org
# Erwartet: 0x0000000000000000000000000000000000000000000000000000000000000001 (= true)

# Neue Wallet hat MINTER_ROLE?
cast call "$PROXY" "hasRole(bytes32,address)" "$MINTER_HASH" "$NEW" \
  --rpc-url https://mainnet.base.org
# Erwartet: 0x...0001
```

---

## Schritt 5 — Backend mit neuem Key konfigurieren

Plesk-Panel → Domains → `vpstunden.hsbi.de` → **Node.js** → Custom Environment Variables:

1. `MINTER_PRIVATE_KEY` → neuer Wert (`0x...` mit `0x`-Prefix, 64 Hex-Chars).
2. **Save**
3. Re-Enable Node.js (falls Schritt 1A genutzt) ODER Restart:
   ```bash
   ssh <PLESK_USER>@vpstunden.hsbi.de
   touch /httpdocs/packages/backend/tmp/restart.txt
   ```
4. Verifikation:
   ```bash
   curl -sS https://vpstunden.hsbi.de/api/v1/health/diag | jq '.minter.address'
   # Erwartet: "<NEW_MINTER_ADDRESS>"
   ```

**Wenn die Adresse falsch ist:** Tippfehler im Plesk-Panel-Wert oder Backend hat noch alten Cache. Restart erneut.

---

## Schritt 6 — Alte Wallet entmächtigen

> **Wichtig:** ERST in Schritt 5 verifiziert haben, dass die neue Wallet funktioniert. Sonst lockst du dich aus.

DEFAULT_ADMIN signt erneut, diesmal `revokeRole`:

### Via BaseScan (Variante A in Schritt 4 analog):

- `revokeRole(ADMIN_ROLE, <OLD_MINTER_ADDRESS>)`
- `revokeRole(MINTER_ROLE, <OLD_MINTER_ADDRESS>)`

### Via `cast`:

```bash
OLD="<OLD_MINTER_ADDRESS>"

cast send "$PROXY" "revokeRole(bytes32,address)" "$ADMIN_HASH" "$OLD" \
  --ledger --hd-path "$DEFAULT_ADMIN_LEDGER_PATH" \
  --rpc-url https://mainnet.base.org

cast send "$PROXY" "revokeRole(bytes32,address)" "$MINTER_HASH" "$OLD" \
  --ledger --hd-path "$DEFAULT_ADMIN_LEDGER_PATH" \
  --rpc-url https://mainnet.base.org
```

### Verifikation:

```bash
cast call "$PROXY" "hasRole(bytes32,address)" "$ADMIN_HASH" "$OLD" \
  --rpc-url https://mainnet.base.org
# Erwartet: 0x0000000000000000000000000000000000000000000000000000000000000000 (= false)
```

---

## Schritt 7 — Alte Wallet ETH-Reste sichern

Falls die alte Wallet noch ETH hat (und du den alten Private-Key noch hast — bei reiner Vorsichts-Rotation; bei aktivem Compromise hat der Angreifer das vermutlich schon weggeleitet):

```bash
# Senden auf neue Wallet (oder eigene Owner-Wallet):
cast send "<NEW_MINTER_ADDRESS>" --value <BALANCE_MINUS_GAS> \
  --private-key "<OLD_MINTER_PRIVATE_KEY>" \
  --rpc-url https://mainnet.base.org
```

Alternativ via MetaMask Import des alten Keys + manueller Send.

**Bei aktivem Compromise:** ETH ist wahrscheinlich schon weg. Akzeptieren.

---

## Schritt 8 — `probe.mjs` und Co. permanent löschen (Bereich 2 F2.1)

```bash
# Auf jedem Rechner, der jemals den alten Key gesehen hat:
cd <repo>
rm -f packages/backend/probe.mjs
git status  # falls etwas in .gitignore-Inkonsistenz steckt
```

**Plus:** Bash-History löschen.

```bash
history -c && history -w
cat /dev/null > ~/.bash_history
```

**Plus:** 1Password-Eintrag des alten Keys archivieren (nicht löschen — könnte für Forensik gebraucht werden), Tag "rotated-<datum>" setzen.

---

## Schritt 9 — Forensik

Nach jeder Rotation:

1. **BaseScan:** Liste aller Tx der alten Wallet seit Verdacht. Wann startete der Compromise?
2. **Backend-Logs:** unauffällige Patterns? `grep -i 'minter\|sign\|transaction' <PASSENGER_LOG_PATH>/error.log` für die Vorfalls-Periode.
3. **Plesk-Audit-Log:** wurde Custom-Env-Vars editiert? Plesk-Panel → Tools → Audit Log.
4. **GHA-Audit:** wurde der `MINTER_PRIVATE_KEY` jemals als GHA-Secret konfiguriert? `Repo → Settings → Secrets`. Wenn ja → GHA-Logs prüfen, ob der Key irgendwann via `echo $SECRET` versehentlich geprintet wurde.
5. **HSBI-IT informieren** falls Verdacht auf Plesk-Tenant-Compromise.
6. **Datenschutzbeauftragte informieren** falls Personendaten betroffen sein könnten (technisch sind im Repo nur Wallet-Adressen + Survey-IDs — kein direkter Bezug zu Studi-Identitäten, aber dokumentieren).

---

## Schritt 10 — Doku-Update

- `operators-private.md`: alte Wallet-Adresse → "rotated <datum>", neue Adresse als aktive.
- `docs/incidents/<datum>-key-rotation.md`: Vorfalls-Beschreibung.
- README-Konstanten-Tabelle (in `runbooks/README.md`): neue Adressen einsetzen.
- BaseScan-Watchlist: neue Adresse hinzufügen, alte als "rotated" labeln (nicht löschen — historische Tx-Beobachtung weiterhin wichtig).

---

## Variante: DEFAULT_ADMIN_ROLE-Rotation (selten)

Falls die DEFAULT_ADMIN-Wallet selbst kompromittiert ist:

> **Risiko:** Self-Lockout möglich. **Doppelt prüfen.**

1. Generiere neue DEFAULT_ADMIN-Wallet (Hardware-Wallet, neuer Account).
2. Aktuelle DEFAULT_ADMIN signt: `grantRole(DEFAULT_ADMIN_ROLE_HASH, <NEW_DEFAULT_ADMIN>)`.
3. Verifikation: neue Wallet hat DEFAULT_ADMIN_ROLE.
4. Wenn die Owner-Decision UPGRADER_ROLE = DEFAULT_ADMIN ist: prüfen, ob neue Wallet auch UPGRADER_ROLE hat. Falls separat: `grantRole(UPGRADER_ROLE_HASH, <NEW_DEFAULT_ADMIN>)`.
5. Aktuelle DEFAULT_ADMIN: `revokeRole(DEFAULT_ADMIN_ROLE_HASH, <OLD_DEFAULT_ADMIN>)`.
6. **Test:** neue Wallet versucht `addAdmin` einer zufälligen Test-Adresse → muss klappen.
7. Backup-Wallet (sofern angelegt) ebenfalls neu konfigurieren.
8. `_adminCount`-Self-Lockout-Schutz prüfen: `cast call "$PROXY" "getAdminCount()"` → muss ≥ 1 sein.

**Wenn unklar:** NICHT machen. Owner-Eskalation. Self-Lockout = Contract permanent unverwaltbar = Disaster.
