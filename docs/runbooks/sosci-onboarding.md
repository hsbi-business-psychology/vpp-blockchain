# SoSci-Onboarding — Neue Lehrende will VPP für eigene Studie nutzen

> **Hinweis:** Dieser Runbook ist provider-agnostisch und benötigt nur die `<VPP_INSTANCE>`-URL. SoSci-Survey ist nur eines der unterstützten Engines — LimeSurvey, Qualtrics oder Custom-HTML funktionieren analog (siehe [`docs/sosci-integration.md`](../sosci-integration.md)).

**Wann nutzen:** Lehrende:r möchte für ein eigenes Survey das VPP-System nutzen, um Studis automatisiert Versuchspersonenpunkte zu vergeben.

**Geschätzte Zeit:**

- Initial-Setup neue Lehrende: 30-45 min (mit dir als Begleitung)
- Folge-Surveys derselben Lehrenden: 10-15 min (selbständig)

**Voraussetzung:**

- Lehrende:r hat eine eigene SoSci-Survey (oder LimeSurvey — analog)
- Du bist als Admin im VPP-Backend eingetragen (oder kannst die Lehrende:r als Admin hinzufügen)
- Lehrende:r hat eine Wallet (kann beim Onboarding generiert werden)

---

## Schritt 1 — Lehrende:r-Wallet einrichten

Die Lehrende:r braucht eine eigene Web3-Wallet zum Authentifizieren bei VPP-Admin-Aktionen (z.B. Survey erstellen, Key rotieren).

### Option A — MetaMask (empfohlen für Lehrende ohne Web3-Erfahrung)

1. https://metamask.io → Browser-Extension installieren (Chrome/Firefox/Brave).
2. Lehrende:r erstellt neue Wallet → Seed-Phrase notieren (12 Wörter, **offline aufbewahren**).
3. Network in MetaMask hinzufügen:
   - Klick auf Network-Switch oben → **"Add network"** → **"Add network manually"**
   - Network Name: `Base`
   - RPC URL: `https://mainnet.base.org`
   - Chain ID: `8453`
   - Currency Symbol: `ETH`
   - Block Explorer URL: `https://basescan.org`
4. Wallet-Adresse kopieren — du brauchst sie für Schritt 2.

> **Wichtig für Lehrende:** Diese Wallet braucht **kein** ETH-Guthaben — sie signiert nur Off-Chain-Messages. Backend zahlt die Tx-Fees.

### Option B — bestehende Web3-Wallet nutzen

Falls Lehrende:r schon eine Wallet hat (z.B. aus eigener DApp-Nutzung): Adresse weitergeben.

---

## Schritt 2 — Lehrende:r als Admin hinzufügen

> **Du brauchst:** Selbst Admin-Permissions im VPP-System.

### Variante A — via Frontend (UX-empfohlen)

1. Frontend öffnen: https://<VPP_INSTANCE>/admin
2. Mit eigener Wallet einloggen (Sign-Message mit MetaMask).
3. Tab **"Admins"** → **"Add Admin"**.
4. Lehrende:r-Wallet-Adresse einfügen.
5. Optional: Display-Name setzen (z.B. "Prof. Dr. Müller — AG Wirtschaftspsychologie").
6. **Sign & Submit** → MetaMask zeigt Sign-Request → bestätigen.
7. Wartet auf Tx-Confirmation (2-5 min).
8. Verifikation: Lehrende:r-Adresse erscheint in Admin-Liste.

### Variante B — via BaseScan (Notfall)

```bash
# Lehrende:r-Adresse:
NEW_ADMIN="<LEHRENDE_WALLET>"
PROXY="<PROXY_ADDRESS>"
ADMIN_HASH=$(cast keccak "ADMIN_ROLE")

# Mit Minter-Wallet (hat ADMIN_ROLE laut OD-2.A):
cast send "$PROXY" "grantRole(bytes32,address)" "$ADMIN_HASH" "$NEW_ADMIN" \
  --private-key "<MINTER_PRIVATE_KEY>" \
  --rpc-url https://mainnet.base.org
```

---

## Schritt 3 — Survey im VPP-System anlegen

1. Frontend → /admin → Tab **"Surveys"** → **"Create Survey"**.
2. Pflichtfelder:
   - **Survey ID** (numerisch, eindeutig, z.B. `42` — typisch ist die SoSci-Survey-ID)
   - **Display Name** (z.B. "Wirtschaftspsychologie — Studie WS25/26")
   - **Points per Claim** (z.B. `1` für 1 VP-Punkt; je nach Studie und Lehrstuhl-Politik)
   - **Active** = `true`
3. **Sign & Submit** → MetaMask → bestätigen.
4. Wartet auf Tx-Confirmation.

**Verifikation:**

```bash
curl -sS https://<VPP_INSTANCE>/api/v1/surveys/<SURVEY_ID>
```

---

## Schritt 4 — Template generieren + in SoSci/LimeSurvey importieren

Das ist der **kritische Schritt** — ohne korrektes Endseiten-Snippet
funktioniert kein Claim.

> **V2.3-Hinweis (April 2026):** Das Endseiten-Snippet ist
> **engine-agnostisch** — beide Formate enthalten exakt das gleiche
> simple HTML-Fragment: einen `<a href>`-Link auf den Backend-Launcher
> `GET /api/v1/claim/launch/:surveyId`. Kein PHP, kein `<script>`,
> kein HMAC-Key in der Survey-Engine.
>
> | Aspekt                                 | V2.3 Launcher-Link           |
> | -------------------------------------- | ---------------------------- |
> | HMAC-Key sichtbar für Studi?           | **Nein** — bleibt im Backend |
> | PHP-Ausführung in Survey-Engine nötig? | Nein                         |
> | `<script>` in Survey-Engine nötig?     | Nein                         |
> | Funktioniert in SoSci/LimeSurvey/...?  | Ja, jede HTML-fähige Engine  |
> | Funktioniert mit aktivem XSS-Filter?   | Ja, `<a href>` survives      |
>
> Vorgeschichte: V2.2 hatte engine-spezifische Snippets (SoSci-PHP +
> LimeSurvey-JS). Das war fragil, weil LimeSurvey 5/6 `<script>`
> via HTMLPurifier strippt — der LimeSurvey-Pfad war komplett
> defekt, und die JS-Variante hätte ohnehin den HMAC-Key im
> Page-Source geleakt. V2.3 verschiebt die Token-Generierung
> ins Backend → ein universelles Snippet für alle Engines, Key
> bleibt strikt server-side.

1. Frontend → /admin → Tab **"Surveys"** → Survey auswählen → **"Generate Template"**.
   - Format wählen: `sosci` (XML) oder `limesurvey` (.lss).
2. Backend generiert ein **HTML-Snippet ohne Script/PHP**, das:
   - Einen styled `<a href>`-Button auf
     `https://<VPP_INSTANCE>/api/v1/claim/launch/<survey_id>` rendert.
   - Beim Klick erzeugt der Backend-Launcher pro Aufruf einen frischen
     Nonce + HMAC-Token serverseitig und 302-redirected zur Claim-Page.
   - Der HMAC-Key liegt nur im Backend-`survey-keys`-Store, nie im
     Snippet, nie im Page-Source.
3. **Download** der Datei (.xml oder .lss).

### Template in die Survey-Engine importieren

Lehrende:r meldet sich an und importiert die Datei:

**SoSci Survey:**

1. Admin → Project → Import (project file).
2. Generierte `vpp-survey-<ID>.xml` hochladen.
3. Save.

**LimeSurvey:**

1. Surveys → Create survey → Import.
2. Generierte `vpp-survey-<ID>.lss` hochladen.
3. Save.

**Test (für beide Engines):**

- Survey aktivieren → Vorschau öffnen → durchklicken bis Endseite.
- Erwartung: blauer Button **"Punkte jetzt einlösen →"** sofort sichtbar.
- Klick auf den Button → Browser geht auf
  `https://<VPP_INSTANCE>/api/v1/claim/launch/<id>` →
  Backend antwortet 302 → landet auf `/claim?s=…&n=…&t=…` → Wallet-Sign.
- Falls der Button gar nicht angezeigt wird → die Survey-Engine
  hat sogar `<a>`-Tags gestrippt (extrem aggressive XSS-Settings).
  Workaround: Survey-Engine-Admin in den Endtext-Einstellungen
  HTML-Tags `<a>` und `<div>` whitelisten.

### Studi-Wallet-Adresse — wo kommt sie her?

Studi muss in der SoSci-Survey ihre Wallet-Adresse eingeben. Standard-Pattern:

- SoSci-Item: Texteingabe-Feld, Label "Deine VPP-Wallet-Adresse (0x...)".
- Hinweis-Text: "Du hast noch keine? → erstelle eine unter https://<VPP_INSTANCE>/wallet (Anleitung 2 min)".
- Validierung: regex `^0x[a-fA-F0-9]{40}$`.

Lehrende:r muss dieses Feld in jeder Survey selbst hinzufügen. → siehe `docs/sosci-integration.md` für Standard-Snippets.

---

## Schritt 5 — Test-Run

Vor dem ersten echten Klassen-Run:

1. Du selbst (oder Lehrende:r) füllt die SoSci-Survey aus mit einer **Test-Wallet** (z.B. eine zweite MetaMask-Account).
2. Am Ende: Claim-Link erscheint → klick.
3. Frontend → Wallet-Auth → "Claim 1 Point".
4. Sign-Request → bestätigen.
5. Backend triggert `awardPoints` → 2-5 min warten.
6. Auf BaseScan: `https://basescan.org/address/<TEST_WALLET>` → Tx erscheint.
7. Frontend → "Meine Punkte" → 1 Punkt sichtbar.

**Wenn Test erfolgreich:** Survey ist live. Lehrende:r kann an Studis ausrollen.

**Wenn Test failed:** siehe `incident-response.md` Schritt 7 (HMAC-/Claim-Probleme).

---

## Schritt 6 — Lehrende:r-Onboarding-Doku übergeben

Lehrende:r braucht für Folgesurveys:

- Link auf `docs/sosci-integration.md` (Standard-Snippet-Pattern).
- Zugang zu /admin (mit eigener Wallet).
- **Diesen Runbook** als Referenz für eigenständige Survey-Erstellung.

Plus: Notiz in `operators-private.md` ergänzen:

- "Lehrende:r XYZ ist seit <datum> als Admin im VPP-System."
- Wallet-Adresse.
- Zuständig für: <welche Studien>.

---

## Häufige Probleme

| Symptom                                                                         | Ursache                                                                                                                                                      | Fix                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| "Studi sieht keinen Claim-Link, sondern rohen `<?php` / `<script>` Source-Code" | Alte V1- oder V2.2-Template auf einer Engine ohne PHP- bzw. ohne Script-Support. V2.3 hat dieses Problem nicht mehr (nur noch `<a href>`).                   | Template via Admin-UI neu generieren (V2.3) und re-importieren.                      |
| "Loading-Text ‘Link wird vorbereitet…’ bleibt für immer stehen, kein Button"    | Alte V2.2-LimeSurvey-Template — `<script>` wurde von HTMLPurifier gestrippt.                                                                                 | Template via Admin-UI neu generieren (V2.3 hat kein Script mehr) und re-importieren. |
| "Klick auf Button → 404 von Backend"                                            | Survey hat keinen registrierten HMAC-Key auf der Backend-Seite (Survey wurde z.B. nur on-chain registriert, ohne `POST /api/v1/surveys/:id/key`).            | Im Admin-UI für die Survey **"Generate Key"** klicken → re-test.                     |
| "Studi sieht 'Link wird vorbereitet…' aber Button erscheint nie"                | Web Crypto API blockiert (sehr alter Browser, oder Survey läuft auf `http://` statt `https://` → Web Crypto verweigert HMAC-Operationen ohne Secure Context) | Survey auf HTTPS umstellen, oder Studi soll modernen Browser nutzen                  |
| "Studi klickt Claim, sieht 'INVALID_HMAC'"                                      | HMAC-Key im Endseiten-Snippet weicht von `survey-keys.json` ab — z.B. weil Key rotiert wurde, ohne das Template neu zu generieren + zu importieren           | Neues Template generieren + in Survey-Engine re-importieren                          |
| "Studi klickt Claim, sieht 'NONCE_USED'"                                        | Replay-Schutz: dieselbe Survey-Antwort wurde schon mal eingelöst                                                                                             | Studi soll Survey neu ausfüllen                                                      |
| "Studi hat 30 min nichts geclaimt, jetzt INVALID"                               | HMAC-Token-Ablauf (Standard 60 min — siehe `auth.ts`)                                                                                                        | Studi soll Survey neu ausfüllen                                                      |
| "Lehrende:r kann sich nicht im Admin einloggen"                                 | Wallet-Adresse hat keine ADMIN_ROLE (Schritt 2 nicht durchgeführt oder Tx failed)                                                                            | Schritt 2 erneut                                                                     |
| "Keine ETH im Backend für meine Studie"                                         | Wallet-Balance leer                                                                                                                                          | `eth-refill.md`                                                                      |

---

## Lehrende:r-Selbsthilfe-Materialien (zum Verlinken)

- **Studi-Wallet erstellen:** https://<VPP_INSTANCE>/wallet (Frontend hat eigene Anleitung)
- **MetaMask:** https://metamask.io
- **Was sind VP-Punkte:** entweder bestehende Doku der Institution oder Lehrende:r erklärt selbst
- **Datenschutz-Hinweis** (von `<INSTITUTION_DPO>` vorgegeben — Lehrende:r muss in Studie eigenständig einbinden): Wallet-Adressen sind pseudonyme Identifier, keine direkten Personendaten. Aber: Verknüpfung mit Studi-Identität liegt in der SoSci-Datenbank, die unter Lehrenden-Verantwortung steht.

---

## Wenn Lehrende:r-Wallet verloren

Lehrende:r hat MetaMask-Reset gemacht oder Seed-Phrase verloren:

1. Lehrende:r generiert neue Wallet (Schritt 1).
2. Du fügst die neue Wallet als Admin hinzu (Schritt 2).
3. Optional: alte Wallet-Adresse aus Admin-Liste entfernen (Frontend → Admin → Remove Admin).
4. **Wichtig:** Surveys, die die Lehrende:r erstellt hat, bleiben aktiv (Survey-Owner ist nicht an die Lehrende:r-Wallet gebunden — alle Admins können alle Surveys verwalten).

---

## Wenn Lehrende:r aus der Institution ausscheidet

1. Lehrende:r-Wallet als Admin entfernen (siehe Schritt oben).
2. Aktive Surveys der Person → entscheiden: deaktivieren? übertragen an Nachfolge?
3. `operators-private.md` aktualisieren.
