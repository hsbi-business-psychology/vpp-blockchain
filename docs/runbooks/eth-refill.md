# ETH-Refill — Backend-Wallet auffüllen

> **Provider-Hinweis:** Beispiele für Balance-Watch-Cron nutzen Plesk-Scheduled-Tasks; auf cPanel/VPS/Docker entsprechend Cron-Job/systemd-Timer/Sidecar verwenden. Siehe [`README.md`](README.md#zu-hosting-provider-spezifika).

**Wann nutzen:**

- Plesk-Cron / UptimeRobot meldet `MINTER_BALANCE_LOW`
- BaseScan-Watchlist meldet Balance < 0,005 ETH
- Vor jedem größeren Klassen-Run als Vorsichtsmaßnahme

**Geschätzte Zeit:** 30-90 min (abhängig von Coinbase-/Bridge-Latenz)
**Voraussetzung:** Coinbase-Konto mit verifiziertem Bank-Mandat ODER bestehender ETH-Bestand auf einer Hot-Wallet

---

## Schritt 0 — Aktuelle Lage prüfen

```bash
# Aktuelle Balance des Minter-Wallets:
curl -sS https://<VPP_INSTANCE>/api/v1/health/diag | jq '.minter.balanceWei'
```

ODER auf BaseScan: `https://basescan.org/address/<MINTER_ADDRESS>`

**Schwellwerte:**

| Balance         | Status | Aktion                                           |
| --------------- | ------ | ------------------------------------------------ |
| > 0,01 ETH      | OK     | nichts tun                                       |
| 0,005-0,01 ETH  | gelb   | Refill in den nächsten 7 Tagen einplanen         |
| 0,001-0,005 ETH | orange | Refill in den nächsten 24 h                      |
| < 0,001 ETH     | rot    | **Sofort refillen** — Service hat <30 Tx Reserve |

**Tx-Kosten-Schätzung (Stand 2026 auf Base Mainnet):**

- `awardPoints` ohne Bidding-Storm: ~30.000-60.000 Gas × ~0,001-0,01 Gwei = **~0,000003-0,000060 ETH/Tx**
- Bei MEV-Storm/NFT-Mint-Welle: bis 0,001 ETH/Tx

Empfohlener Refill-Betrag: **0,02 ETH** (deckt ~6-12 Monate Standard-Operation, je nach Klassen-Größe).

---

## Schritt 1 — ETH beschaffen

### Variante A — Coinbase (Standard, EUR → ETH direkt auf Base)

> **Voraussetzung:** Coinbase-Account-Owner ist `<EINTRAGEN: Coinbase-Konto-Owner>` (siehe `operators-private.md`). Falls jemand anderes refillen muss → Owner kontaktieren.

1. Login: https://coinbase.com
2. **Buy** → Asset: **ETH** → Network: **Base**
   - **Wichtig:** Network auf "Base" stellen (nicht "Ethereum"). Sonst musst du danach bridgen → +1 h Verzögerung + Bridge-Fee.
3. Betrag in EUR eingeben (z.B. 60 EUR ≈ 0,02 ETH bei aktuellem Kurs).
4. **Buy** klicken → Bestätigen.
5. Coinbase: **Send** → Asset: **ETH on Base** → Recipient: `<MINTER_ADDRESS>` (siehe Konstanten in `runbooks/README.md`).
   - **Doppelt prüfen!** Adresse muss exakt mit BaseScan-Adresse übereinstimmen.
6. Send → Bestätigung.
7. Warte ~2-5 min auf Tx-Confirmation.

### Variante B — Bridge von Ethereum L1 (wenn ETH auf L1 liegt)

> **Längerer Pfad** — nur nutzen, wenn Coinbase-Variante nicht verfügbar.

1. Bridge: https://bridge.base.org/deposit
2. Wallet (z.B. MetaMask) connecten.
3. Asset: ETH, Network: Ethereum → Base.
4. Recipient: `<MINTER_ADDRESS>` (oder zuerst zu eigener Wallet, dann separat senden).
5. Bridge initiieren. **Achtung:** L1-Gas-Fee + Bridge-Wartezeit (10-30 min).

### Variante C — On-Ramp via 3rd-Party (Notfall)

Wenn weder Coinbase noch L1-Wallet verfügbar:

- https://www.banxa.com — EUR → ETH on Base, akzeptiert SEPA + Karte
- https://moonpay.com — gleicher Use-Case
- Beide haben höhere Fees (~3-5 %), aber funktionieren auch außerhalb von Coinbase-Owner-Sphäre.

---

## Schritt 2 — Confirmation prüfen

```bash
# Nach 3-5 min Tx auf BaseScan suchen:
# https://basescan.org/address/<MINTER_ADDRESS>

# Oder via Backend-Health:
curl -sS https://<VPP_INSTANCE>/api/v1/health/diag | jq '.minter'
```

Erwartete Antwort (`/api/v1/status` als Admin, V2-Felder):

```json
{
  "minterAddress": "0x...",
  "balance": "0.02",
  "lowBalance": false,
  "belowWarn": false,
  "belowMin": false,
  "warnThresholdEth": "0.025",
  "minThresholdEth": "0.005",
  ...
}
```

`belowMin === true` heißt: Backend wirft jetzt `INSUFFICIENT_FUNDS` 503
für jeden Schreib-Pfad (audit F2.4). `belowWarn === true` heißt: das
Backend hat ein `MINTER_BALANCE_LOW`-Warn-Log abgesetzt — Plesk-Cron
sollte spätestens jetzt mailen. Beide Schwellen sind über
`MIN_BALANCE_ETH` (Default 0,005) konfigurierbar.

**Wenn `belowMin` immer noch `true`:** Tx noch nicht geminted. Warte 5 min.

**Wenn nach 30 min immer noch `true`:** Tx ist verloren oder an falsche Adresse gegangen. → Coinbase-Tx-History prüfen.

---

## Schritt 3 — Plesk-Cron-Marker resetten (sofern eingerichtet)

Das Backend emittiert seit der M12-Härtung (audit F2.4) automatisch eine
strukturierte Warn-Zeile, sobald die Balance unter den Warn-Schwellwert
(5× `MIN_BALANCE_ETH`, Default 0,025 ETH) fällt:

```
WARN MINTER_BALANCE_LOW: backend wallet needs ETH refill — see docs/runbooks/eth-refill.md
  balanceEth=0.0021 warnThresholdEth=0.025 minThresholdEth=0.005
  minterAddress=0x... severity=OPERATIONAL action=TOP_UP_REQUIRED
```

Zugehöriger Plesk-Cron (Beispiel, in `/etc/cron.hourly/vpp-balance-warn`):

```bash
#!/usr/bin/env bash
LOG=/var/www/vhosts/<VPP_INSTANCE>/logs/access_log
MARKER=/tmp/vpp-balance-warned

if [ ! -f "$MARKER" ] && grep -q 'MINTER_BALANCE_LOW' "$LOG"; then
  mail -s '[VPP] Minter wallet low' "$VPP_OWNER_EMAIL" < "$LOG" \
    | head -n 200 \
    && touch "$MARKER"
fi
```

Nach erfolgreichem Refill den Marker löschen, sonst feuert der Cron nicht
erneut, wenn die Balance später wieder absinkt:

```bash
ssh <PLESK_USER>@<VPP_INSTANCE>
rm /tmp/vpp-balance-warned
```

Der In-Process-Cooldown des Backends (24 h pro Worker, siehe
`services/balance-monitor.ts`) wird beim nächsten Worker-Restart oder
nach Ablauf des Cooldowns automatisch resettet — ein manueller
Backend-Reload ist **nicht** notwendig.

---

## Notfall-Modus — Wallet ist komplett leer und du bist beim Klassen-Run

Wenn Studis warten und kein ETH-Refill in 5 min möglich ist:

1. **Studis informieren** (Lehrende:r-Verteiler):
   > "Aktuell technisches Problem mit der VPP-Plattform. Bitte den Claim heute Abend ab 20 Uhr erneut versuchen — wir melden uns mit Update."
2. **Refill durchziehen** (Schritt 1).
3. **Backend-Restart** ist nicht nötig — Wallet wird beim nächsten Tx neu gecheckt.
4. **Post-Mortem** in `docs/incidents/<datum>.md` (siehe `incident-response.md` Schritt 10) — und in der Liste "Vermeidung" eintragen: "Refill-Schwellwert von X auf Y erhöhen" oder "Plesk-Cron-Intervall verkürzen".

---

## Backup-Wallet-Konzept (Owner-Decision OD-2.A: Minter hat ADMIN_ROLE)

Falls die Refill-Variante nicht funktioniert (Coinbase locked, Bridge-Outage, BaseScan-Adresse falsch eingegeben), kann Owner als Eskalation:

1. Eine **Backup-Hot-Wallet** vorhalten mit z.B. 0,05 ETH Reserve auf Base.
2. Bei Notfall: aus Backup → Minter-Wallet senden (auf Base, ~30 s).

**Backup-Wallet-Adresse:** `<EINTRAGEN, sofern angelegt — siehe operators-private.md>`

> **Hinweis:** Diese Backup-Wallet hat keine ADMIN_ROLE und keine MINTER_ROLE. Sie ist nur ein ETH-Reserve-Pot. Owner kann sie als MetaMask-Hardware-Wallet halten.

---

## Beobachtungen für nächsten Refill (in `docs/incidents/<datum>.md` notieren)

- Wann wurde der Vorfall detektiert?
- Wer hat detektiert (UptimeRobot / Studi / Owner)?
- Wie viel ETH wurde refillt?
- Tx-Hash auf BaseScan?
- Aktueller Stundensatz Coinbase-EUR-zu-Base-ETH?
- Vermutete nächste Refill-Notwendigkeit?

So baust du über mehrere Vorfälle eine **Daten-Basis für die Refill-Frequenz** = Voraussetzung für Plesk-Cron-Schwellwert-Tuning.
