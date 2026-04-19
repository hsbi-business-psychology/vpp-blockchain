# Wallet-Recovery für Studierende

> **Lesezeit:** ca. 5 Minuten. Diese Anleitung richtet sich an Studierende, die
> über das VPP-System Versuchspersonenpunkte sammeln und ihr Browser-Wallet
> sicher verwenden möchten – auch ohne Vorkenntnisse zu Blockchain oder
> Kryptografie.

## Was ist eine Recovery-Phrase?

Wenn du im VPP-System ein neues Wallet erstellst, generiert die Anwendung
12 zufällige englische Wörter (auch _Seed Phrase_, _Mnemonic_ oder
_BIP-39-Phrase_ genannt). Beispiel:

```
witch  collapse  practice  feed  shame  open
despair  creek  road  again  ice  least
```

Diese 12 Wörter sind dein **Generalschlüssel**:

- Sie enthalten dein komplettes Wallet (Adresse + Private Key) in einer Form,
  die du dir aufschreiben oder in einen Passwort-Manager kopieren kannst.
- Aus den 12 Wörtern lässt sich dasselbe Wallet jederzeit auf jedem anderen
  Gerät wiederherstellen – im VPP-Frontend genauso wie in MetaMask, Trust
  Wallet oder jeder anderen Standard-Wallet-App.
- Wer die 12 Wörter kennt, kontrolliert deine Punkte. Behandle sie wie das
  Master-Passwort deines Online-Bankings.

> **Wichtig:** Die Wörter sind eine offene Industrie-Standard-Liste mit
> 2048 englischen Wörtern (BIP-39). Es ist kein Geheimnis, _welche_ Wörter
> es gibt – das Geheimnis ist die Reihenfolge _deiner_ 12 Wörter.

## Wo bewahre ich die Phrase auf?

**Tu das:**

1. Trage die 12 Wörter in deinen Passwort-Manager ein
   (z. B. Bitwarden, 1Password, KeePassXC).
2. Schreibe die 12 Wörter zusätzlich auf Papier und lege sie an einen
   sicheren Ort – z. B. zu wichtigen Dokumenten in einer Schublade zu Hause.
3. Notiere die Reihenfolge (1 – 12), nicht nur die Wörter.

**Tu das nicht:**

- Kein Foto vom Bildschirm oder Zettel machen (Cloud-Synchronisation!).
- Nicht in WhatsApp, Telegram, Discord, Mail oder Slack kopieren.
- Nicht an Lehrende, Tutorinnen, IT oder den Support weitergeben –
  die HSBI fragt **nie** nach deiner Phrase.
- Nicht in einer Datei `phrase.txt` auf dem Desktop oder in iCloud Drive
  liegen lassen.

## Was passiert beim Erstellen?

Der Ablauf im VPP-Frontend besteht aus drei kurzen Schritten:

1. **Aufklärung & Bestätigung** – ein Dialog erklärt dir, wie das Wallet
   gespeichert wird und worauf du achten musst.
2. **Phrase anzeigen** – die 12 Wörter erscheinen standardmäßig nur
   einzeln. Du kannst auf "Alle anzeigen" wechseln, wenn du sicher allein
   bist. Bei jedem Tabwechsel werden die Wörter automatisch wieder
   verdeckt.
3. **Verifikation** – wir fragen drei zufällige Wörter (z. B. Wort 2,
   Wort 5, Wort 9) ab, um sicherzustellen, dass du sie wirklich notiert
   hast. Du hast beliebig viele Versuche und kannst jederzeit zur
   Anzeige zurück.

Erst nach erfolgreicher Verifikation wird das Wallet im Browser
gespeichert und steht für Punkte-Claims zur Verfügung.

## Wallet wiederherstellen

### Im VPP-Frontend (gleiches oder anderes Gerät)

1. Öffne `https://vpstunden.hsbi.de` (bzw. die Adresse deiner Hochschule).
2. Klicke auf **„Wallet importieren"**.
3. Wähle den Tab **„Recovery-Phrase (12 Wörter)"**.
4. Tippe die 12 Wörter in der ursprünglichen Reihenfolge ein.
   - Beim Tippen schlägt der Browser passende BIP-39-Wörter vor.
   - Du kannst auch alle 12 Wörter auf einmal aus deinem Passwort-Manager
     einfügen ("Aus Zwischenablage einfügen").
5. Klicke auf **„Importieren"**. Dieselbe Wallet-Adresse wie vorher
   erscheint – inklusive aller bisher eingelösten Punkte.

### In MetaMask (Browser-Erweiterung oder Mobile-App)

Du kannst dein VPP-Wallet auch in MetaMask öffnen, ohne irgendetwas
anderes umzustellen. Die abgeleitete Adresse ist exakt dieselbe.

1. **MetaMask installieren** (falls nicht schon vorhanden):
   <https://metamask.io/download/>.
2. Beim ersten Öffnen wählst du **„Bestehendes Wallet importieren"**
   (engl. _„Import an existing wallet"_).
3. Wenn MetaMask danach fragt, gib einen **starken Passcode** ein
   (Mindestens 8 Zeichen – der Code verschlüsselt deine Phrase im
   MetaMask-Tresor).
4. Im Schritt **„Geheime Wiederherstellungsphrase"** trage die 12 Wörter
   in der Reihenfolge ein, wie du sie aufgeschrieben hast.
5. Bestätige – MetaMask zeigt nun ein neu importiertes Konto an.
   Standardmäßig ist genau die Adresse aktiv, die du im VPP-Frontend
   hattest.
6. Wechsle in MetaMask oben zum Netzwerk **„Base"**
   (Chain ID 8453). Falls Base nicht in der Liste steht: einmal auf
   <https://basescan.org/> einen beliebigen Block aufrufen, MetaMask
   bietet dann das Hinzufügen automatisch an.
7. Im VPP-Frontend kannst du jetzt zusätzlich „Mit MetaMask verbinden"
   wählen, falls du lieber MetaMask statt des Browser-Wallets nutzen
   möchtest.

> Falls du nach dem Import in MetaMask eine andere Adresse siehst:
> Prüfe, ob du wirklich das **erste** Konto (Account 1) ausgewählt hast.
> Das VPP-Frontend benutzt den Standard-Ableitungspfad
> `m/44'/60'/0'/0/0`, das ist genau das, was MetaMask als Account 1
> anzeigt.

## Häufige Fragen

**Ich habe meinen Browser-Cache gelöscht – sind meine Punkte weg?**
Wenn du noch die 12 Wörter hast, nicht. Importiere sie wie oben
beschrieben und du bist wieder genau dort, wo du aufgehört hast.

**Ich habe die 12 Wörter verloren und kein Backup – was nun?**
In diesem Fall sind die bereits geclaimten Punkte leider nicht mehr
zugreifbar. Sie liegen weiter auf der Blockchain unter deiner alten
Adresse, aber niemand kann sie noch verschieben. Erstelle ein neues
Wallet, sichere die neue Phrase sofort ordentlich und lass dich für
neue Umfragen erneut Punkte gutschreiben.

**Ich habe die Wörter notiert, aber „Phrase ungültig" wird angezeigt.**
Das ist meistens ein Tippfehler. Die Phrase enthält eine
Prüfsumme – ein einzelnes falsches Zeichen führt zur Fehlermeldung.
Prüfe besonders ähnliche Paare wie _„use" / „used"_,
_„flat" / „flag"_ und stelle sicher, dass die **Reihenfolge** stimmt.

**Kann jemand meine Phrase aus dem Browser auslesen?**
Theoretisch ja: Ein Angreifer mit Zugriff auf deinen Account auf dem
Computer kann den `localStorage` lesen. Deshalb darfst du dein VPP-Wallet
**nicht** auf einem Computer benutzen, dem du nicht vertraust
(Internet-Café, geteilter Familien-PC ohne Login). Im Hochschul-Pool
oder auf deinem persönlichen Laptop ist das Risiko sehr gering, solange
du keine fragwürdigen Browser-Erweiterungen installierst.

**Warum kann ich den Private Key nicht mehr als Datei herunterladen?**
Eine `.json`-Datei mit dem Klartext-Schlüssel landet zu schnell in
Cloud-Backups oder Mail-Anhängen. Die 12-Wort-Phrase erfüllt denselben
Zweck, ist aber für Menschen viel besser zu verwalten und passt in jeden
Passwort-Manager.

**Ich habe ein älteres Wallet ohne 12-Wort-Phrase. Was tun?**
Du kannst es weiter verwenden – nichts geht verloren. Im Wallet-Bereich
findest du den Hinweis, dass keine Phrase verfügbar ist. Du hast zwei
Optionen:

1. Importiere den Private Key bei Bedarf in MetaMask (dort: _„Konto
   importieren"_ → _„Privater Schlüssel"_).
2. Oder erstelle ein neues Wallet mit Phrase und claime künftige Punkte
   dorthin. Beide Adressen können nebeneinander existieren.

## Ich brauche Hilfe

- Frag im offiziellen ILIAS-/Moodle-Kurs nach. Die Tutoren können dir
  bei der Bedienung des VPP-Frontends helfen.
- Bei technischen Problemen mit dem System (z. B. Server nicht
  erreichbar) wende dich an die Kontaktadresse im Impressum der
  VPP-Seite.
- **Niemand** wird dich jemals nach deiner Recovery-Phrase fragen –
  weder Lehrende noch der Support. Wer das tut, ist ein Betrugsversuch.
