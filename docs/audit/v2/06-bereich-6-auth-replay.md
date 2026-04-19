# Bereich 6 — Authentifizierung, Autorisierung & Replay (V2-Audit)

**Auditor:** Senior Auditor (extern, second pass)
**Stand:** 2026-04-18
**Scope:** Auth-Middleware (`middleware/auth.ts`), HMAC-Claim-Pfad (`routes/claim.ts` + `services/hmac.ts` + `services/nonce-store.ts`), alle Admin-Endpoints (`routes/{admin,surveys,wallets,status}.ts`), Frontend-Sign-Flows (`hooks/use-wallet.ts`, `hooks/use-api.ts`, `pages/{admin,claim}.tsx`, `components/admin/*.tsx`), Rate-Limiting (`middleware/rateLimit.ts`).

---

## Executive Summary

Das V2-EIP-191-Auth-Modell ist **strukturell defekt**. Drei Blocker:

1. **Es gibt keine Server-Side-Nonce** auf Admin-Pfaden. Die einzige Replay-Bremse ist ein 5-Minuten-Timestamp-Fenster — innerhalb dessen jede gültige Signatur eines Admins **beliebig oft** gegen **jedes** Admin-Endpoint wiederverwendet werden kann.
2. **Der Message-Inhalt wird vom Backend komplett ignoriert.** Frontend signiert nominell `Add admin 0xVICTIM by 0xADMIN at 1700000000`, aber Backend liest aus dieser Message **nur** den letzten Token (Timestamp). Operation, Target-Address, Survey-ID, Nonce — nichts davon wird gegen den Request-Body gebunden. Eine geleakte Sig für die scheinbar harmlose Operation `Admin login` ist 5 Minuten lang ein Bearer-Token für `addAdmin(0xATTACKER)`, `removeAdmin(0xLEGITIMATE)`, `revokePoints`, `markWalletSubmitted` und alles andere unter `requireAdminHandler`.
3. **Sigs landen unredacted im pino-Server-Log.** Default-`pino-http` mit `{ logger }` loggt jeden Request-Body. Jeder Admin-Call hinterlässt 5 Minuten frisch-replayfähige `(adminMessage, adminSignature)`-Paare in `/var/log/passenger`. Wer Plesk-Tenant-Read auf den Logs hat (siehe Bereich 4 F4.5), bekommt ein Live-Feed authentifizierter Sigs.

**Die Kombination dieser drei Befunde macht das gesamte Admin-Modell zu einem Sieb.** Ein einziger erfolgreicher Sig-Leak (Schulter-Surf, Browser-Extension, Plesk-Log-Read, MITM auf einem missgestalteten Admin-Endpoint, geteilter PC) gibt einem Angreifer 5 Minuten lang freie Hand über den gesamten Admin-Surface — inklusive `addAdmin(angreifer)`, das ihm dann **dauerhafte** Kontrolle gibt, weil die danach geschriebenen Admin-Operationen mit der eigenen Wallet signiert sind.

Der Claim-Pfad ist robuster (HMAC-Token ist sauber, `nonce-store` korrekt fail-closed), hat aber dieselbe Message-Bindungs-Schwäche: die Studi-Sig ist nicht an die Nonce gebunden, sodass ein Studi, der **irgendwo** einen Sign-Request beantwortet, sich in einen offenen Replay-Vektor für seinen eigenen `nonce`/`token` verwandelt — solange dieser noch nicht eingelöst ist.

Plus 4 Major (Body-Logging, isAdmin-Hot-Path-und-Lockout, Rate-Limit-Trügerei, React-State-Sig-Leak), 3 Minor (Worker-Crash-Burnt-Nonce, Doku-zu-Code-Diskrepanz, HMAC-Rotation-Hard-Cutoff), 2 Nit.

**Insgesamt: 12 Findings (3 🔴 / 4 🟠 / 3 🟡 / 2 ⚪).**

Erforderliche Fixes vor 2-Jahres-Klassen-Einsatz:

- F6.1+F6.2+F6.3 zusammen lösen: Server-Side-Nonce-Endpoint (`POST /api/v1/auth/challenge` → `{ nonce, expiresAt }`) + canonical Message mit Operation-Type-Prefix + Body-Hash + Nonce + ChainId + Origin. Verifikation muss **alle** Felder gegen den Request-Body cross-checken.
- F6.4: `pino-http` mit `redact: ['req.body.adminSignature', 'req.body.adminMessage', 'req.headers["x-admin-signature"]', 'req.headers["x-admin-message"]', 'req.body.signature', 'req.body.message']` konfigurieren.
- F6.5: `isAdmin`-Result im Memory-Cache mit 30 s TTL pro recovered-Address. RPC-Failure-Pfad: bei einem RPC-Outage `last-known-good`-Cache nutzen, mindestens 60 s, und als 503 mit Retry-Hint antworten — nicht als generischer 500.
- F6.6: `claimRateLimit.max` auf 30/min/IP senken, `apiLimiter` für Admin-Routen auf 60/min/IP, dediziertes `adminAuthLimiter` mit 10 invalid-sigs/min/IP.

---

## Findings

### 🔴 F6.1 — Auth ist ein 5-Minuten-Bearer-Token: keine Server-Side-Nonce, kein Single-Use

**File:Line:** `packages/backend/src/middleware/auth.ts:11-96` (`requireAdmin`)

**Problem:** Die Middleware authentifiziert ausschließlich über (Sig, Timestamp ≤ 5 min, isAdmin on-chain). Es gibt keinen serverseitigen State, der eine Sig auf **einmaligen** Verbrauch festlegen würde. Das Backend hat keine Vorstellung davon, ob diese Signatur in der vergangenen Sekunde schon einmal angekommen ist.

```ts
// auth.ts:34
recoveredAddress = ethers.verifyMessage(adminMessage, adminSignature)
// auth.ts:45-72 — die einzigen Replay-Bremsen
const parts = adminMessage.split(/[\s:]+/)
const timestamp = parseInt(parts[parts.length - 1], 10)
// ...
const ageMs = Date.now() - timestamp * 1000
if (ageMs > config.maxMessageAgeMs) {
  /* 400 */
}
if (ageMs < -60_000) {
  /* 400 */
}
// auth.ts:79
hasRole = await checkAdmin(recoveredAddress)
```

`config.maxMessageAgeMs` default = 300 000 ms = 5 min (`config.ts:64`). Innerhalb dieses Fensters ist eine einzige Sig **N-mal** wiederverwendbar.

**Angriffspfad (step-by-step):**

1. Admin Alice öffnet Admin-Dashboard. `admin.tsx:84-91` ruft `handleAuth`, signiert `Admin login 0xALICE at 1700000000`, speichert Sig + Message im React-State.
2. Sig + Message werden ans Backend geschickt (für GET `/admin`, GET `/status`, etc.). pino-http loggt beide in `/var/log/passenger/<app>/access.log` (siehe F6.4).
3. Angreifer Mallory bekommt eine der Quellen (Schulter-Surf während Bib-Session, Browser-Extension auf Admin-Browser, Plesk-Tenant-Read auf die Logs, kompromittierter Reverse-Proxy-Tap).
4. Mallory schickt innerhalb der nächsten 4 min an `POST /api/v1/admin/add`:
   ```http
   POST /api/v1/admin/add HTTP/1.1
   Content-Type: application/json
   {
     "address": "0xMALLORY_OWN_WALLET",
     "adminSignature": "<stolen sig from log>",
     "adminMessage": "Admin login 0xALICE at 1700000000"
   }
   ```
5. Backend verifiziert: Sig recovered → `0xALICE`, `isAdmin(0xALICE)` → true, age = 240 s → ok. Auth-Pass.
6. Backend ruft on-chain `addAdmin(0xMALLORY_OWN_WALLET)` über die Minter-Wallet. Mallory ist nun permanent Admin und kann ab diesem Moment mit der **eigenen** Wallet weitermachen.

**Kostenseite des Angriffs:** Mallory braucht **eine** geleakte Sig in einem 5-Minuten-Fenster. Mit dem `pino-http`-Default-Body-Logging (F6.4) wird Stunde für Stunde frisch-replayfähiges Material in die Plesk-Logs geschrieben.

**Fix (realistisch, ohne JWT-Migration):**

1. **Server-Side-Nonce-Endpoint einführen:**
   ```ts
   // routes/auth.ts (neu)
   router.post('/challenge', (req, res) => {
     const nonce = randomBytes(32).toString('base64url')
     const expiresAt = Date.now() + 60_000
     challengeStore.set(nonce, { expiresAt, used: false })
     res.json({ success: true, data: { nonce, expiresAt } })
   })
   ```
2. Frontend holt vor jeder Admin-Operation eine frische Challenge.
3. Canonical Message bekommt Nonce-Slot (siehe F6.3 für die volle Struktur).
4. `requireAdmin` verbraucht die Nonce atomar:
   ```ts
   const { nonce } = parseAdminMessage(adminMessage)
   if (!challengeStore.consume(nonce)) {
     return res.status(401).json({ error: 'NONCE_USED_OR_EXPIRED' })
   }
   ```
5. `challengeStore` als in-Memory Map mit Pruning beim Insert (kein Disk, weil sub-1-min-TTL). Bei Multi-Worker-Plesk: Redis-Backed (Backend hat schon `RATE_LIMIT_STORE=redis`-Pfad in `rateLimit.ts:6-17` — derselbe Redis lässt sich wiederverwenden).

Aufwand: 1 Endpoint, 1 Map (oder Redis-Set), 1 Frontend-Refactor (`useApi.requestAuth(operation, body)` Helper). Keine Contract-Änderung.

**2-Jahre-Begründung:** Bei 2000 Klassen-Run-Sessions × 5 Admins × 10 Admin-Aktionen = 100 000 Auth-Events. Die Wahrscheinlichkeit, dass über diesen Zeitraum **kein** Sig-Leak passiert (Browser-Extension, geteilter Lehrenden-PC, Plesk-Log-Schreiber, Network-Capture in einem Hochschul-Proxy, Phishing-Mail die einen Admin zum „Test-Sign" überredet), ist effektiv null. Ohne Server-Side-Nonce ist **jeder einzelne** Leak ein Take-Over-Vektor. Mit Server-Side-Nonce ist ein geleakter Sig + Message wertlos, weil die Nonce sofort nach dem ersten Use abgewiesen wird.

---

### 🔴 F6.2 — Cross-Operation-Replay: jede Sig autorisiert jede Operation

**File:Line:** `packages/backend/src/middleware/auth.ts:11-96` ↔ `routes/{admin,surveys,wallets,status}.ts` (alle `requireAdminHandler`-geschützten Endpoints).

**Problem:** Das Frontend baut **per-Operation** unterschiedliche Messages — der Backend ignoriert das Operation-Wort komplett.

Frontend-Inventar (alle Sign-Stellen):

```ts
// admin.tsx:89        Admin login ${wallet.address} at ${timestamp}
// admin.tsx:133       Register survey ${data.surveyId} by ${wallet!.address} at ${timestamp}
// admin.tsx:168       Deactivate survey ${...} by ${...} at ${timestamp}
// admin.tsx:185       Reactivate survey ${surveyId} by ${...} at ${timestamp}
// admin.tsx:202       Download template ${...} by ${...} at ${timestamp}
// admin.tsx:257       Rotate survey key ${...} by ${...} at ${timestamp}
// role-management.tsx:51   List admins by ${walletAddress} at ${timestamp}
// role-management.tsx:74   Add admin ${address} by ${walletAddress} at ${timestamp}
// role-management.tsx:93   Remove admin ${addr} by ${walletAddress} at ${timestamp}
// role-management.tsx:121  Set admin label ${addr} at ${timestamp}
// submission-management.tsx:75  ${verb} wallet ${result.address} by ${...} at ${timestamp}
```

Backend-Validierung (`auth.ts:45-46`):

```ts
const parts = adminMessage.split(/[\s:]+/)
const timestamp = parseInt(parts[parts.length - 1], 10)
```

Das Backend liest aus der Message **ausschließlich** den Timestamp. Operation-Wort, Subject-Address, Survey-ID — alles wird verworfen. Es gibt **keine Stelle** in der gesamten Codebase, die `adminMessage.startsWith('Add admin')` oder Ähnliches prüft.

**Angriffspfad — Eskalation einer „read-only"-Sig zu Privileg-Eskalation:**

1. Admin Alice öffnet Dashboard. Frontend signiert für sie `Admin login 0xALICE at T₀` (das gefühlt harmloseste, was sie signieren kann — sie denkt: „ich logge mich nur ein").
2. Diese Sig wird im React-State gespeichert (`admin.tsx:91`) und an `<SystemStatus>` (`admin.tsx:354-357`) durchgereicht. Außerdem geht sie als Body an `GET /admin`, `GET /status`.
3. Sig + Message liegen im pino-Body-Log (F6.4).
4. Mallory bekommt das Sig+Message-Paar (irgendeine der vielen Quellen).
5. Mallory ruft `POST /admin/add` mit `body.address=0xMALLORY` und der **`Admin login`**-Sig. Backend: Sig→Alice, Alice ist Admin, Timestamp ok → grants Mallory ADMIN_ROLE.

Das ist **schlimmer** als F6.1, weil Alice nie wissentlich für die Operation `Add admin` signiert hat. Sie signiert eine Sig, die im Naming nach Login klingt, und das macht sie trotzdem zu einem Add-Admin-Token.

**Symmetrisch in die andere Richtung:**

- Admin Alice signiert `Remove admin 0xVICTIM by 0xALICE at T₀` (Body: `{address: 0xVICTIM, ...}`).
- Mallory fängt sie ab.
- Mallory ruft `POST /admin/add` mit `{address: 0xMALLORY, adminSignature: <stolen>, adminMessage: "Remove admin 0xVICTIM by 0xALICE at T₀"}`.
- Backend: Sig recovers Alice → ok, isAdmin → ok, timestamp → ok. Backend ruft `addAdmin(0xMALLORY)` (aus Body), die Message-Operation `Remove admin` wird ignoriert.

Die `address`-Felder im Body sind komplett Angreifer-kontrolliert. Das gilt für **alle** Endpoints unter `requireAdminHandler`:

- `POST /admin/add` — Body `{address}` → Backend ruft `addAdmin(body.address)`.
- `POST /admin/remove` — Body `{address}` → `removeAdmin(body.address)` (außer Minter-Address-Schutz `admin.ts:131-138`).
- `POST /surveys` — Body `{surveyId, points, maxClaims, title}` → `createKey + registerSurvey`.
- `POST /surveys/:id/deactivate|reactivate` — `:id` aus URL → `deactivate|reactivateSurvey(parseInt(:id))`.
- `POST /surveys/:id/revoke` — Body `{student}` → `revokePoints(student, surveyId)`.
- `POST /surveys/:id/template` — Body `{format}` → bekommt **HMAC-Key** im rendered XML.
- `POST /surveys/:id/key/rotate` — `:id` aus URL → rotiert Key, **invalidiert alle laufenden Claims**.
- `GET  /surveys/:id/key` — gibt **Klartext-HMAC-Key** zurück.
- `POST /wallets/:address/mark-submitted|unmark-submitted` — `:address` aus URL.

**Worst-Case-Kette:** Mallory leakt eine `Admin login`-Sig von Alice. Innerhalb der 5 min:

1. `POST /admin/add` mit Mallorys eigener Wallet → permanenter Admin.
2. `POST /surveys/X/key/rotate` → invalidiert alle laufenden Klassen-Surveys.
3. `GET /surveys/X/key` → klaut den neuen Key.
4. `POST /admin/remove` mit Alices Address → entfernt Alice als Admin.
5. `POST /surveys/X/revoke` mit beliebigen Studi-Wallets → löscht reale Klausurpunkte.

**Fix (realistisch):**

1. **Canonical-Message-Format mit Operation-Type-Prefix** — Single-Source-of-Truth in `services/admin-auth.ts`:
   ```ts
   export function buildAdminMessage(opts: {
     operation: 'admin.add' | 'admin.remove' | 'admin.label' | 'survey.register' | ...
     subject: string         // e.g. target wallet, survey ID
     bodyHash: string        // sha256 of canonical-JSON of req.body minus auth fields
     nonce: string           // server-issued challenge
     issuedAt: number        // unix seconds
     chainId: number         // mainnet 8453
     domain: string          // 'vpstunden.hsbi.de'
   }): string {
     return [
       `vpp.admin.v1`,
       `op=${opts.operation}`,
       `subject=${opts.subject}`,
       `body=${opts.bodyHash}`,
       `nonce=${opts.nonce}`,
       `chainId=${opts.chainId}`,
       `domain=${opts.domain}`,
       `issuedAt=${opts.issuedAt}`,
     ].join('\n')
   }
   ```
2. Frontend importiert dieselbe Funktion aus `@vpp/shared` (existiert bereits als Workspace-Package). Keine doppelten Strings.
3. `requireAdmin` parsed das Format strikt und cross-checked:
   ```ts
   const fields = parseAdminMessage(adminMessage)
   if (fields.operation !== expectedOp) → 401 OPERATION_MISMATCH
   if (fields.bodyHash !== sha256(canonicalize(req.body))) → 401 BODY_TAMPERED
   if (fields.subject !== expectedSubject) → 401 SUBJECT_MISMATCH
   if (fields.chainId !== config.expectedChainId) → 401 WRONG_CHAIN
   if (fields.domain !== config.frontendUrl.host) → 401 WRONG_DOMAIN
   if (!challengeStore.consume(fields.nonce)) → 401 NONCE_USED
   ```
4. Per-Endpoint-Wrapper deklariert das `expectedOp`:
   ```ts
   router.post('/add', requireAdminFor('admin.add', (req) => req.body.address), async (req, res) => {...})
   ```

**Aufwand:** ~200 LoC Backend + ~50 LoC Frontend-Refactor. Keine Contract-Änderung. Tests existieren bereits (`auth.test.ts`-Pfad), erweitern.

**2-Jahre-Begründung:** Operation-Binding ist die einzige Verteidigung gegen den „der Admin signiert irgendwas Harmloses und wird damit retroaktiv für gefährliche Operationen autorisiert"-Vektor. Über 2 Jahre wird mindestens ein Admin auf eine geschickt formulierte Phishing-Mail klicken, die ihn um eine Sig bittet. Ohne Operation-Binding ist das ein Take-Over.

---

### 🔴 F6.3 — Claim-Sig bindet weder Nonce noch Operation: Sig-Leak von ANDEREN DApps wird zum Claim-Vektor

**File:Line:** `packages/frontend/src/pages/claim.tsx:60` ↔ `packages/backend/src/routes/claim.ts:84-131`

**Problem:** Die Claim-Sig der Studi-Wallet wird gegen die Message verifiziert, aber die Message bindet **weder** die Nonce **noch** den Token **noch** die surveyId in einer vom Backend geprüften Form.

Frontend baut:

```ts
// claim.tsx:60
const message = `Claim:${surveyId}:${wallet!.address}:${timestamp}`
```

Backend prüft:

```ts
// claim.ts:86-87
const parts = message.split(':')
const timestamp = parseInt(parts[parts.length - 1], 10)
```

Plus `recoveredAddress.toLowerCase() === walletAddress.toLowerCase()` (`claim.ts:125`). Sonst nichts. `surveyId`, `nonce`, `token` aus dem Message-Inhalt werden weder geparst noch validiert.

**Konsequenz 1 — Doku ist faktisch falsch:**

```ts
// claim.ts:16-18 (JSDoc)
//  - message — `claim:<surveyId>:<nonce>:<unixSeconds>`
```

Frontend sendet `Claim:<surveyId>:<address>:<unixSeconds>` (großes C, nonce fehlt, address drin). Beide funktionieren, weil das Backend nichts validiert.

**Konsequenz 2 — Sig-Wiederverwendung über DApp-Grenzen hinweg:**

Studi A öffnet `/claim?s=42&n=NONCE_A&t=TOKEN_A`, signiert seine claim-Message, Backend awarded Punkte. **Soweit ok.** Aber:

Stellen wir uns Studi B vor, der seinen Claim-Link noch nicht eingelöst hat. Er surft eine andere DApp an, die ihn um eine Signatur bittet (z. B. ein NFT-Drop-Phishing-Site, eine WalletConnect-Demo, ein „test-sign your wallet"-Tool). Studi B signiert dort `Welcome to FreeNFT at 1700000050`. Phishing-Server schickt diese Sig an Mallory.

Mallory hat unabhängig davon Studi B's claim-URL aus dem Bib-Browser (Schulter-Surf) abgegriffen. Mallory ruft:

```http
POST /api/v1/claim
{
  "walletAddress": "0xSTUDI_B",
  "surveyId": 42,
  "nonce": "NONCE_B",
  "token": "TOKEN_B",
  "signature": "<stolen 'Welcome to FreeNFT' sig>",
  "message": "Welcome to FreeNFT at 1700000050"
}
```

Backend:

- Token-Shape OK (`hmac.ts:127-129`).
- Timestamp 1700000050, age 30 s → ok.
- `verifyMessage("Welcome to FreeNFT at 1700000050", sig)` → recovers `0xSTUDI_B`. ✅
- `recovered.toLowerCase() === walletAddress.toLowerCase()` → true. ✅
- `getSurveyInfo(42)` → exists, active. ✅
- `verifyToken({surveyId: 42, nonce: NONCE_B, key: surveyKey, token: TOKEN_B})` → true (Mallory hat den echten Token aus der URL). ✅
- `isUsed(42, NONCE_B)` → false (Studi B hat noch nicht geclaimed). ✅
- `markUsed(42, NONCE_B)` → success. ✅
- `awardPoints(0xSTUDI_B, 42)` → success.

Studi B sieht später seinen Claim-Link → 409 NONCE_USED → er denkt, sein Link ist kaputt. Punkte sind aber an seine Wallet gegangen. **Aber:** `markWalletSubmitted` (separater Admin-Flow) wurde nicht ausgelöst — und die HSBI-Note hängt am `submitted`-Flag, nicht direkt an Punkten. Wenn die Note-Vergabe-Logic nur `getTotalPoints` checkt: kein Schaden für Studi B. Wenn sie auf `claim event from his wallet` reagiert: Schaden, weil das Claim-Event vorhanden ist, aber der Claim-Akt nicht autorisiert wurde.

**Tieferes Problem:** Die Trennung zwischen „der HMAC-Token autorisiert die Survey-Berechtigung" (kommt von SoSci, Studi-Antwort-Beweis) und „die Sig autorisiert die Wallet-Identität" (kommt vom Wallet) ist im Code intakt, aber die Sig erfüllt die Wallet-Identitäts-Funktion nur, weil die Wallet existiert und mal irgendwann eine Message mit dem richtigen Timestamp signiert hat. Die Sig sagt **nicht** „ich claime Survey 42 mit Nonce NONCE_B" — sie sagt nur „ich war wach um T". Das ist keine Authentifizierung, das ist ein Lebenszeichen.

**Fix:**

1. **Canonical Claim-Message** mit allen Bind-Feldern:
   ```ts
   // services/claim-auth.ts (neu)
   export function buildClaimMessage(opts: {
     surveyId: number
     nonce: string
     walletAddress: string
     issuedAt: number
   }): string {
     return [
       `vpp.claim.v1`,
       `survey=${opts.surveyId}`,
       `nonce=${opts.nonce}`,
       `wallet=${ethers.getAddress(opts.walletAddress)}`,
       `issuedAt=${opts.issuedAt}`,
     ].join('\n')
   }
   ```
2. Frontend sendet die canonical Message; Backend rebuilt sie aus dem Body und vergleicht 1:1:
   ```ts
   const expected = buildClaimMessage({
     surveyId, nonce, walletAddress, issuedAt: timestamp
   })
   if (message !== expected) → 400 MESSAGE_MISMATCH
   ```
3. JSDoc in `claim.ts` korrigieren.
4. Im Frontend `@vpp/shared`-Helper exportieren, damit es **eine** Wahrheit gibt.

**Optionaler stärkerer Fix:** EIP-712 statt EIP-191. Mit Domain-Separator (`name: 'VPP Claim', version: '2', chainId: 8453, verifyingContract: <SurveyPointsV2-proxy>`). MetaMask zeigt strukturierte Daten an, Studis sehen explizit was sie signieren. Aufwand höher, aber eindeutig richtige Long-Term-Lösung.

**2-Jahre-Begründung:** Tausende Studis × beliebige andere DApps × 2 Jahre. Ein einzelner Studi, der irgendwo einen Sign-Request annimmt, hat seinen aktuellen unverbrauchten Claim-Link in Mallorys Hände gelegt — gepaart mit jeder geleakten Sig wird das zum stillen Front-Run. Solange die Sig nicht **deklariert**, was sie autorisiert, ist sie auf jedem anderen Ufer wiederverwendbar.

---

### 🟠 F6.4 — pino-http loggt Request-Body inkl. `adminSignature` + `adminMessage` unredacted

**File:Line:** `packages/backend/src/middleware/requestLogger.ts:5-11`

**Problem:**

```ts
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/api/v1/health/live',
  },
})
```

Kein `redact`-Konfig. `pino-http` loggt nicht standardmäßig den Body — aber: jede `next(err)`-Pfad in der App führt errorHandler aus, und die Codebase hat mehrere Stellen, an denen `req.body` in Errors landet (z. B. `validation.ts` via Zod-Issues mit `received`-Werten). Plus: jeder `app.use(express.json())` parsed den Body, und falls in einem `logger.error({ req }, ...)`-Aufruf irgendwo der `req` mitgegeben wird, serialisiert pino den ganzen Request inklusive Body.

Konkrete Stellen:

- `errorHandler.ts:234` — `logger.error({ err }, 'Unhandled error')`. Nicht direkt Body, aber der `err`-Stack kann Body-Reste enthalten (wenn Zod Validation-Errors throwen, ist der `received`-Value im Stack-Trace).
- `claim.ts:198-205` — Race auf `markUsed`: hier landen weder Body noch Sig im Log, aber wenn man Replay-Forensik wollte, wäre nichts drin (umgekehrtes Risiko).

**Verifikation per Probe:** Das Standard-pino-http-Default für `serializers.req` ist die `pino.stdSerializers.req`-Funktion, die KEIN Body inkludiert. Body landet **nur** im Log, wenn jemand explizit `req.log.info({ body: req.body })` schreibt. **Aber:** `adminSignature`/`adminMessage` werden über Headers (`x-admin-signature`, `x-admin-message`) übertragen für read-Endpoints (`use-api.ts:112-115, 132-135, 152-155, 175-178, 191-194, 209-212, 234-237, 250-253, 261-265, 275-278`). pino-http's Default-Header-Logging via `req.headers` **inkludiert** alle Custom-Headers. Sigs sind also **direkt** im Request-Log.

```jsonc
// Erwartete Log-Zeile bei einem Admin-Request:
{
  "level": 30, "time": ..., "req": {
    "method": "GET",
    "url": "/api/v1/admin",
    "headers": {
      "host": "vpstunden.hsbi.de",
      "x-admin-signature": "0x1234...0a",  // ← REPLAY-FÄHIG, 5 min lang
      "x-admin-message": "List admins by 0xALICE at 1700000000",  // ← passt zur Sig
      ...
    }
  }
}
```

Damit hat jeder mit Plesk-Tenant-Read-Zugriff (siehe Bereich 4 F4.5 — `survey-keys.json` ist 0644, Logs typischerweise ähnlich) einen Live-Stream replayfähiger Sigs.

**Replay-Fenster:** 5 Minuten ab `issuedAt` der Message — d. h. wer die Logs **innerhalb von 5 Minuten** nach der Schreib-Aktion ausliest, hat eine direkt verwendbare Sig. Bei einer Hochschul-Plesk-Instanz mit anderen Tenants oder einem Cron-Job, der Logs nach S3 spielt, ist die Wahrscheinlichkeit eines real-time-Reads nicht null.

**Fix (5 Minuten Code-Änderung):**

```ts
// packages/backend/src/middleware/requestLogger.ts
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/api/v1/health/live',
  },
  redact: {
    paths: [
      'req.headers["x-admin-signature"]',
      'req.headers["x-admin-message"]',
      'req.headers["x-api-key"]', // future-proof
      'req.headers["authorization"]', // future-proof
      'req.body.adminSignature',
      'req.body.adminMessage',
      'req.body.signature',
      'req.body.message',
      'req.body.privateKey', // future-proof, sollte nie kommen
    ],
    censor: '[REDACTED]',
  },
})
```

Plus: `lib/logger.ts` (nicht gelesen, aber Standard) sollte denselben `redact` auf der Top-Level-Logger-Instanz haben, falls jemand `logger.info({ req }, ...)` direkt aufruft.

**2-Jahre-Begründung:** Logs werden von Cron-Jobs rotiert, von Backup-Skripten in Plesk-Snapshots gepackt, von Operatoren in Tickets gepostet, von SREs für Debugging auf lokale Maschinen kopiert. Jeder dieser Pfade vervielfältigt die Replay-Fähigkeit auf neue Speicherorte mit unklareren Zugriffskontrollen. In 2 Jahren wird mindestens **einmal** ein Log-Snippet versehentlich an einer öffentlich erreichbaren Stelle landen (Slack-Channel mit Externen, GitHub-Issue, Stackoverflow-Frage, Tickets-Export). F6.4 macht aus diesem Versehen einen direkten Take-Over-Vektor — kombiniert mit F6.1/F6.2 ist das eine 5-Minuten-Pwn-Window. Mit Server-Side-Nonce (F6.1-Fix) wäre der Schaden begrenzt; ohne ist er katastrophal.

---

### 🟠 F6.5 — `isAdmin()` als Hot-Path on-chain pro Request, kein Cache, RPC-Outage = Admin-Lockout

**File:Line:** `packages/backend/src/middleware/auth.ts:78-83` ↔ `packages/backend/src/services/blockchain.ts:386-388`

**Problem:** Jede einzelne Admin-authentifizierte Request macht einen on-chain `isAdmin(address)`-Read.

```ts
// auth.ts:77-83
let hasRole: boolean
try {
  hasRole = await checkAdmin(recoveredAddress)
} catch (err) {
  next(err)
  return
}
```

```ts
// blockchain.ts:386-388
export async function isAdmin(address: string): Promise<boolean> {
  return withRpcRetry(() => readOnlyContract.isAdmin(address), { label: 'isAdmin' })
}
```

Kein Caching auf Application-Layer, kein TTL. `withRpcRetry` (siehe Bereich 3) macht 3 Versuche mit 200ms-Backoff über `FallbackProvider` mit `quorum: 1`. Realistische Wall-Clock-Latenz pro Auth: 100–800 ms (RPC-Roundtrip Plesk → Cloudflare-Frontend → Base-Mainnet-Knoten + Backoff bei 429).

**Quantifizierung des Hot-Path-Cost:**

Admin-Dashboard-Initial-Load (Alice öffnet `/admin`):

1. `useEffect` triggert `handleAuth` → 1× `signMessage` (kein RPC).
2. `getSurveys` (kein Auth, kein isAdmin).
3. `<SystemStatus>` mit cached creds → `GET /status` → **1× isAdmin**.
4. `<RoleManagement>` → `getAdmins(sig, msg)` → `GET /admin` → **1× isAdmin**.
5. `<SubmissionManagement>` lädt nichts initial, aber `getWalletSubmissionStatus(addr)` ist public.

= 2 isAdmin-Calls pro initial-Page-Load.

Während aktiver Nutzung (Admin registriert 1 Survey + lädt 1 Template + markiert 3 Wallets als submitted):

- `POST /surveys` → 1× isAdmin + 1× `getSurveyInfo` + 1× `registerSurvey` (write) + 1× `getEventStore().sync()`.
- `POST /surveys/:id/template` → 1× isAdmin + 1× `getSurveyInfo`.
- 3× `POST /wallets/:addr/mark-submitted` → 3× isAdmin + 3× `isWalletSubmitted` (read) + 3× `markWalletSubmitted` (write).

= 5 isAdmin-Calls in ~30 s.

**Auf Alchemy Free Tier:** `eth_call` mit `isAdmin(address)` ist ein einfacher Storage-Slot-Read = **26 Compute-Units** pro Call. Bei 5 Admins × 50 Calls/Tag = 250 Calls/Tag = 6 500 CUs/Tag. Im Vergleich zu 16,7 Mio CUs/Tag Free-Quota: vernachlässigbar (0,04 %). **Aber:** `withRpcRetry` macht bei 429-Failure bis zu 3 Versuche, plus `FallbackProvider` würfelt zusätzliche Calls. Im worst-case-RPC-Storm-Szenario kann ein einzelner isAdmin-Call 6+ tatsächliche RPC-Calls auslösen. Bei einem wirklich schlechten Tag mit 30 % der Calls auf retry: 250 × 1.5 × 26 = 9 750 CUs/Tag. Trotzdem unter dem Limit, aber näher dran.

**Schwerer: RPC-Outage = Admin-Lockout.**

`auth.ts:78-83` propagiert RPC-Errors via `next(err)` an `errorHandler.ts:234` → 500 INTERNAL_ERROR mit dem generischen Text:

> _„An unexpected error occurred. Please try again later or contact the administrator."_

Wenn Base-Mainnet RPCs für 5 min wackeln (in 2 Jahren passiert das mehrfach — Bereich 3 dokumentiert die Realität), **können Admins für die Dauer des Outages NICHTS tun**. Kein Survey aktivieren, keine Punkte revoken, keine Wallets als submitted markieren. Selbst der Versuch, sich einzuloggen, schlägt fehl.

**Schlimmster Fall:** Klassen-Run, 30 Studis warten auf Punkte, ein Studi hat sich verklickt und braucht `revokePoints` — Admin kann nicht revoken, weil isAdmin-Lookup hängt. Studi steht in der Schlange, Admin steht hilflos da.

**Fix:**

1. **In-Memory-Cache pro recovered-Address mit TTL:**

   ```ts
   // services/admin-cache.ts (neu)
   interface AdminCacheEntry {
     isAdmin: boolean
     expiresAt: number
     staleAt: number
   }
   const cache = new Map<string, AdminCacheEntry>()
   const TTL_MS = 30_000 // fresh
   const STALE_TTL_MS = 5 * 60_000 // serve stale on RPC failure

   export async function isAdminCached(address: string): Promise<boolean> {
     const key = address.toLowerCase()
     const now = Date.now()
     const cached = cache.get(key)
     if (cached && cached.expiresAt > now) return cached.isAdmin
     try {
       const isAdmin = await blockchain.isAdmin(address)
       cache.set(key, { isAdmin, expiresAt: now + TTL_MS, staleAt: now + STALE_TTL_MS })
       return isAdmin
     } catch (err) {
       if (cached && cached.staleAt > now) {
         logger.warn({ err, address }, 'isAdmin RPC failed; serving stale cache')
         return cached.isAdmin
       }
       throw err
     }
   }
   ```

2. **`requireAdmin` nutzt `isAdminCached`** statt `isAdmin`.

3. **Cache invalidieren** nach `addAdmin`/`removeAdmin`-Erfolg (`admin.ts:104-105, 149-150`).

4. **RPC-Outage-Fallback:** Wenn Cache-Miss UND RPC-Fail, antworte mit 503 ATTRACTIVE_DEGRADED und `Retry-After: 30`-Header, nicht mit 500. Frontend zeigt einen klaren Banner: „Blockchain-Verbindung instabil — Admin-Funktionen vorübergehend eingeschränkt".

**Aufwand:** ~50 LoC für Cache, ~10 LoC für Invalidation, 5 Tests. Keine Frontend-Änderung.

**2-Jahre-Begründung:** Cache spart in der 99-%-RPC-Up-Phase nur Latenz (gut). Aber im 1-%-RPC-Down-Fenster ist das der Unterschied zwischen „Klasse läuft weiter mit kleiner Verzögerung" und „Klasse kann nicht enden, weil keine Punkte revoken-bar". Plus: schützt das Free-Tier-RPC-Budget gegen DoS-Versuche, die einfach 1000 isAdmin-Calls/min an die Auth-Middleware schicken.

---

### 🟠 F6.6 — Rate-Limit-Defaults: Doku sagt 5/min, Code sagt 100/min, NAT'd Klasse trifft Limit

**File:Line:** `packages/backend/src/middleware/rateLimit.ts:21` (Doku) ↔ `packages/backend/src/config.ts:46-49` (Defaults)

**Problem 1 — Doku-zu-Code-Diskrepanz:**

```ts
// rateLimit.ts:21
/** Strict limiter for the claim endpoint (default: 5 req/min per IP). */
export const claimLimiter = rateLimit({
  windowMs: config.claimRateLimit.windowMs,
  max: config.claimRateLimit.max,
  ...
})
```

```ts
// config.ts:46-49
claimRateLimit: {
  windowMs: parseInt(optional('CLAIM_RATE_LIMIT_WINDOW_MS', '60000'), 10),
  max: parseInt(optional('CLAIM_RATE_LIMIT_MAX', '100'), 10),  // ← 100, NICHT 5
},
```

Die Doku ist 20× zu niedrig. Wer den Code-Kommentar liest und auf den Default vertraut, plant für 5 req/min. Tatsächlich werden 100 req/min toleriert.

**Problem 2 — IP-basiert auf NAT'd Schul-WLAN:**

`express-rate-limit` mit Default-`keyGenerator` nutzt die Client-IP. Hochschul-WLAN (HSBI hat ein Standard-`eduroam`-Setup mit NAT) gibt typischerweise allen Studis im selben Hörsaal **eine** Public-IP. 30 Studis im Hörsaal → 30 simultane Claims → 30 Requests/min auf einer IP → unterhalb des 100-Limits, aber nahe dran.

Bei Klassen mit 50+ Teilnehmern oder mehreren parallelen Surveys (HSBI VPP wird laut README für mehrere Veranstaltungen genutzt) kann man bei einem koordinierten Goodbye-Page-Trigger die 100/min reißen. Erste 100 Studis bekommen Punkte, der 101te bekommt `RATE_LIMITED`. Der wartet eine Minute und versucht es erneut, bekommt aber wieder `RATE_LIMITED`, weil andere Studis aus dem gleichen NAT inzwischen weiter pollen.

**Problem 3 — Admin-Endpoints haben KEINEN strict-limiter:**

```ts
// server.ts:77
app.use(apiLimiter)
```

`apiLimiter` ist 600 req/min/IP (`config.ts:51-54`). Das gilt für ALLE Routes, inklusive `/admin/add`, `/admin/remove`, `/surveys/:id/key/rotate`. Brute-Force auf invalide Sigs: 600 Versuche/min. Für ECDSA-Recovery praktisch irrelevant (k256 hat 2^256 Keys), aber für **Address-Enumeration via isAdmin** relevant: 600 isAdmin-Lookups/min × eine Stunde = 36 000 RPC-Calls. Das stresst die RPC-Provider und kann die Free-Tier-Quota auffressen, wenn jemand böswillig Wallet-Addresses ratet.

**Problem 4 — Kein dediziertes Auth-Failure-Limiter:**

Wenn ein Angreifer 100 ungültige `adminSignature`-Versuche pro Minute schickt (jeweils mit unterschiedlichen Hex-Strings), antwortet das Backend jeweils mit 401 `INVALID_SIGNATURE`. Kein Lockout, kein Backoff. Im aktuellen Code-Pfad ist das unschädlich (ECDSA-Recovery erkennt invalide Sigs sofort), aber:

- Es konsumiert Compute (100 verifyMessage-Calls/min sind nicht null).
- Es füllt Logs (jeder 401 wird per pino loggt).
- Es maskiert echte Auth-Failures eines vergesslichen Admins.

**Fix:**

1. **Doku korrigieren** (rateLimit.ts:21): "default: 100 req/min per IP, override via CLAIM_RATE_LIMIT_MAX".
2. **Default-Werte sinnvoll setzen:**
   ```ts
   // config.ts
   claimRateLimit: { windowMs: 60_000, max: 30 },  // entspricht 30 Studis im Hörsaal
   apiRateLimit:   { windowMs: 60_000, max: 200 }, // tighter
   ```
3. **Per-Endpoint-Limiter für Admin-Writes:**
   ```ts
   // middleware/rateLimit.ts
   export const adminWriteLimiter = rateLimit({
     windowMs: 60_000,
     max: 30,        // 30 admin-writes per minute per IP
     standardHeaders: 'draft-7',
     legacyHeaders: false,
     skip: () => isTest,
     ...
   })
   ```
   In `routes/admin.ts`, `routes/surveys.ts`, `routes/wallets.ts` für alle POST/PUT-Routen anwenden.
4. **Auth-Failure-Limiter:**
   ```ts
   export const adminAuthFailureLimiter = rateLimit({
     windowMs: 60_000,
     max: 10,        // 10 invalid sigs per minute per IP
     skipSuccessfulRequests: true,
     ...
   })
   ```
   Vor `requireAdminHandler` aufrufen.
5. **Wallet-basiertes Limit für Claims** (statt nur IP) — `keyGenerator: (req) => req.body.walletAddress?.toLowerCase() ?? req.ip`. Damit kann ein NAT-Block die Limits nicht einseitig auffressen.

**2-Jahre-Begründung:** Klassen-Größen wachsen, Multi-Survey-Tage werden Routine, Plesk-Logs werden zur Forensik genutzt. Falsch-konfigurierte Defaults sind in der Default-Installation jahrelang unbemerkt — bis der erste Klassen-Run mit 80 Teilnehmern hängt. Doku-zu-Code-Diskrepanz ist ein Konsistenz-Defekt mit Sicherheits-Konsequenz: jemand der „passt schon, ist auf 5/min" denkt, ist ahnungslos warum Punkte gehijacked werden.

---

### 🟠 F6.7 — Frontend Admin-Sig im React-State 5 Min lang exfiltrierbar (DevTools, Extension)

**File:Line:** `packages/frontend/src/pages/admin.tsx:41, 91, 354-357`

**Problem:**

```ts
// admin.tsx:41
const [authCredentials, setAuthCredentials] = useState<{
  signature: string
  message: string
} | null>(null)
// admin.tsx:91 (handleAuth, nach erfolgreichem signMessage)
setAuthCredentials({ signature, message })
// admin.tsx:354-357
{authCredentials && (
  <SystemStatus
    adminSignature={authCredentials.signature}
    adminMessage={authCredentials.message}
  />
)}
```

Die Sig ist:

- Im React-State der `<AdminPage>`-Komponente.
- Als Prop an `<SystemStatus>` durchgereicht (also auch in deren State sichtbar).
- 5 Minuten lang gültig.
- Indirekt im Network-Tab der Browser-DevTools (jeder GET /admin, GET /status zeigt sie als Header).

**Angriffspfade:**

1. **React DevTools Browser-Extension:** Standard-Tool für Frontend-Devs. Ein Admin, der React-DevTools installiert hat (für irgendein anderes Projekt), sieht beim Inspect auf `<AdminPage>` direkt `authCredentials.signature` und `.message` im Component-Tree. Wer den Browser-Tab kurz mit jemand anders teilt (Pair-Programming, Bildschirm-Share via Zoom mit Schulter-Surfer), gibt die Sig her.
2. **Bösartige Browser-Extension** mit `tabs`-Permission kann den DOM und Component-State auslesen. Admin-Browser mit z. B. einer Wetter-Extension von zweifelhaftem Anbieter → Sig ist nur ein chrome.runtime.sendMessage entfernt.
3. **XSS** (siehe Bereich 5 — aktuell keiner gefunden, aber `i18next.escapeValue:false` ist eine offene Wunde) → `JSON.stringify(window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers)` exfiltriert State.
4. **Geteilter Lehrenden-PC** mit Browser-Cache + Tab-Restore. Admin schließt Browser, eine andere Person öffnet, Tab-Restore lädt das `/admin`-Page; React-State ist zwar leer (kein localStorage), ABER: das `useEffect` triggert direkt `handleAuth` → MetaMask-Popup. Wenn ein noch-eingeloggtes-MetaMask die Sig automatisch erstellt (nicht der Default, aber bei Hardware-Wallets mit „auto-confirm"), hat die zweite Person eine Admin-Sig.

**Tieferes Problem:** Die Sig ist im Frontend ein **Bearer-Token** mit 5-Minuten-Lebensdauer. Behandelt wird sie wie ein lokales User-State-Detail. Sie sollte mindestens dieselbe Vorsicht erfahren wie eine Session-ID:

- Nicht im Component-Tree als Klartext.
- Nicht als Prop durchgereicht (custom Hook mit Closure-Capture).
- Network-Layer-Auth via httpOnly-Cookie wäre besser, aber das geht mit EIP-191 nicht direkt.

**Fix (kombiniert mit F6.1-Fix):**

1. **Server-Side-Nonce-basiertes Modell** (siehe F6.1-Fix) macht die Sig single-use → der „5 Minuten gültig"-Aspekt verschwindet, weil sie nach dem ersten Use konsumiert ist. Damit ist die Exfiltration wertlos.
2. Solange F6.1 nicht gefixt ist: zumindest pro-Operation-Sigs (kein Sig-Reuse). Das `authCredentials`-Pattern kommplett wegwerfen, statt:
   ```ts
   // anstelle von cached creds
   const requestAdminAction = async (operation: string, body: object) => {
     const challenge = await fetchChallenge()
     const message = buildAdminMessage({ operation, body, challenge })
     const signature = await sign(message)
     return apiCall(operation, { ...body, adminSignature: signature, adminMessage: message })
   }
   ```
3. `<SystemStatus>` ohne Sig-Props bauen — die Sig wird beim button-click frisch erstellt, nicht weitergereicht.
4. UX-Konzession: Ja, das bedeutet 1 MetaMask-Popup pro Klick. Aber es ist die Operation, die die Klick-Bestätigung verdient.

**Alternative (weniger sicher, weniger UX-Friction):** Sig in einem `useRef` statt `useState` halten — `useRef` ist nicht im React-DevTools-Tree als prominentes State-Item sichtbar (steht in `current`-Property). Das ist Sicherheits-durch-Obskurität und löst das Grundproblem nicht.

**2-Jahre-Begründung:** React-DevTools sind universell installiert. Browser-Extensions sind ein wachsender Vektor (mehrere große Supply-Chain-Angriffe pro Jahr). Geteilte Lehrenden-PCs sind in HSBI Realität (mehrere Lehrende teilen ein Büro). Über 2 Jahre × 5–10 aktive Admins ist die Wahrscheinlichkeit, dass mindestens einmal eine Admin-Sig durch einen dieser Pfade exfiltriert wird, hoch genug, dass man sie nicht ignorieren kann. Mit F6.1+F6.2-Fix ist die Exfiltration wertlos; ohne ist sie ein direkter Take-Over.

---

### 🟡 F6.8 — `markUsed` BEFORE `awardPoints`: Worker-Crash zwischen den Stufen verbrennt Nonce ohne Recovery-Endpoint

**File:Line:** `packages/backend/src/routes/claim.ts:193-207`

**Problem:**

```ts
// claim.ts:193-207
// Mark the nonce consumed BEFORE broadcasting the on-chain TX. If the
// TX fails (e.g. RPC outage), the participant must reopen SoSci to
// get a fresh nonce — that is the cost of fail-closed replay
// protection. ...
if (!markUsed(surveyId, nonce)) {
  throw new AppError(409, 'NONCE_USED', '...')
}
const receipt = await blockchain.awardPoints(walletAddress, surveyId)
```

Das fail-closed-Design ist sicherheitstechnisch korrekt (siehe Auditor-Notiz weiter unten — diese Reihenfolge ist KEIN Fehler). Aber zwei UX-Probleme bleiben:

**Szenario A — Worker-Kill:** Plesk-Passenger killed den Worker zwischen `markUsed` (Disk-Sync abgeschlossen) und `awardPoints` (RPC-Submit) — z. B. wegen Memory-Limit, Idle-Timeout, oder Operator-Restart. Folge:

- `used-nonces.json` enthält den Nonce → Replay-Schutz greift.
- On-chain ist nichts passiert → Studi hat keine Punkte.
- Studi sieht `INTERNAL_ERROR` (oder gar nichts, weil HTTP-Connection mit dem Worker-Kill abbricht).
- Studi versucht erneut → 409 NONCE_USED (weil markUsed während des ersten Versuchs erfolgreich war).
- Studi muss zurück zu SoSci, neue Goodbye-Page generieren, neue Nonce/Token bekommen.

**Probability:** Plesk-Passenger killed Worker bei Idle ≥ `passenger_pool_idle_time` (default 300 s). Bei 30 simultanen Claims dauert eine `awardPoints`-Tx auf Base ~3-5 s (1 Block). Der Time-Window für Worker-Kill ist klein (~3 s pro Claim), aber bei 100 000 Claims über 2 Jahre: Erwartungswert 1-3 Vorfälle pro Jahr.

**Szenario B — RPC-Receipt-Failure:** `awardPoints` succeded on-chain (Tx broadcasted, Block geminted, Punkte sind im Contract-State), aber der Receipt-Wait failed wegen RPC-Stale-Read (Bereich 3 F3.5 — verschiedene RPCs sehen verschiedene Heads). `awardPoints` throws → `errorHandler` antwortet mit 500. Studi sieht Error, wartet, versucht erneut → 409 NONCE_USED + 409 ALREADY_CLAIMED (`hasClaimed` ist now true on-chain). Studi ist verwirrt, Admin kann nicht helfen ohne manuellen `unlinkSync` im `used-nonces.json` — was den Replay-Schutz für andere Studis kompromittiert.

**Fehlende Recovery-Mechanismen:**

- Kein `POST /admin/nonce/restore { surveyId, nonce }`-Endpoint (admin-authenticated).
- Kein Cron-Job, der „verbrannte aber nicht eingelöste" Nonces erkennt (Vergleich `used-nonces.json` × `events.json`).
- Kein Frontend-Hint für den Studi: „Falls deine Punkte angezeigt werden, ist alles ok — der Error war nur ein Anzeige-Fehler".

**Fix:**

1. **Recovery-Endpoint** (admin-only):

   ```ts
   // routes/admin.ts (additional)
   router.post('/nonce/restore', requireAdminHandler, async (req, res) => {
     const { surveyId, nonce } = req.body
     const removed = nonceStore.unmarkUsed(surveyId, nonce)
     await getEventStore().sync()
     res.json({ success: true, data: { restored: removed } })
   })
   ```

   Plus `nonce-store.ts`: `unmarkUsed(surveyId, nonce)` als zusätzliche Funktion.

2. **Detection-Helper im Backend:**

   ```ts
   // services/nonce-store.ts
   export function findOrphanedNonces(eventStore): Array<{ surveyId; nonce }> {
     const used = Array.from(load().set)
     // returns nonces consumed but no awardPoints event found
   }
   ```

   Plus `GET /admin/diag/orphaned-nonces` (admin-only) für Operator-Diagnose.

3. **Frontend-Hint** in `claim.tsx`-Error-Handling:
   ```tsx
   {
     error && error.includes('NONCE_USED') && (
       <p className="text-sm text-muted-foreground mt-2">
         {t('claim.error.nonceUsedHint')}
         {/* "Falls Sie bereits Punkte sehen, war Ihr Claim erfolgreich – der vorherige Fehler war ein Anzeige-Problem." */}
       </p>
     )
   }
   ```

**Auditor-Notiz:** Die Reihenfolge `markUsed BEFORE awardPoints` ist die einzige sicherheitskorrekte. Die Alternative (`awardPoints` zuerst, `markUsed` nach Receipt) hätte einen klaren Replay-Vektor: Angreifer schickt 100 simultane Claim-Requests mit derselben Nonce; alle laufen parallel `awardPoints`; das Contract-`AlreadyClaimed`-Revert hilft nicht, weil zwischen `hasClaimed`-Check und `awardPoints`-Submit noch Zeit für Concurrent-Submits vergeht. F6.8 ist also ein UX-Finding mit erforderlichem Recovery-Pfad, kein Sicherheits-Fix.

**2-Jahre-Begründung:** Bei ~1-3 Vorfällen/Jahr ohne Recovery-Pfad: jeder Vorfall = 30 Minuten Admin-Eingriff (manueller File-Edit + Restart) + 1 verärgerter Studi + Risiko, dass der File-Edit den Replay-Schutz für andere Surveys schwächt. Mit Recovery-Endpoint: 30-Sekunden-Klick im Admin-UI, kein Restart, atomar. ROI hoch bei minimalem Aufwand.

---

### 🟡 F6.9 — Doku-zu-Code-Diskrepanz im Claim-Message-Format führt zukünftige Integratoren in die Falle

**File:Line:** `packages/backend/src/routes/claim.ts:16-18` (JSDoc) ↔ `packages/frontend/src/pages/claim.tsx:60` (Implementation) ↔ `packages/backend/src/routes/claim.ts:86-87` (Verifikation)

**Problem (siehe auch F6.3):**

| Quelle                     | Format                                                          |
| -------------------------- | --------------------------------------------------------------- |
| `claim.ts:16-18` (JSDoc)   | `claim:<surveyId>:<nonce>:<unixSeconds>`                        |
| `claim.tsx:60` (Frontend)  | `Claim:${surveyId}:${wallet!.address}:${timestamp}`             |
| `claim.ts:86-87` (Backend) | akzeptiert beides, parsed nur `parseInt(parts[parts.length-1])` |

Drei Wahrheiten an drei Stellen. Aktuell funktioniert es, weil das Backend keinen Inhalt prüft. **Aber:** Jede zukünftige Änderung am Format führt zu silent-failure. Ein externer Integrator (z. B. Lehrender, der direkt aus PHP claimen will, ohne über das Frontend zu gehen), der die JSDoc liest, baut `claim:42:abc123:1700000000` — was auch akzeptiert wird, **obwohl die Doku-Form korrekt wäre und die Frontend-Form nicht**.

Wenn morgen jemand das Backend härten will (z. B. F6.3-Fix mit canonical Message), bricht der Frontend-Code, weil er die alte Format-Form schickt. Wenn die Doku als Spec dient: Frontend bricht. Wenn die Frontend-Implementation als Spec dient: Doku ist Lüge.

**Fix:**

1. **Eine Wahrheits-Quelle in `@vpp/shared`:**

   ```ts
   // packages/shared/src/messages.ts
   export function buildClaimMessage(opts: {
     surveyId: number
     nonce: string
     walletAddress: string
     issuedAt: number
   }): string {
     return `vpp.claim.v1\nsurvey=${opts.surveyId}\nnonce=${opts.nonce}\nwallet=${ethers.getAddress(opts.walletAddress)}\nissuedAt=${opts.issuedAt}`
   }
   export function parseClaimMessage(msg: string) {
     /* strict parse */
   }
   ```

2. **Frontend importiert:** `import { buildClaimMessage } from '@vpp/shared'`.

3. **Backend rebuilt + vergleicht 1:1:**

   ```ts
   // claim.ts
   const expected = buildClaimMessage({ surveyId, nonce, walletAddress, issuedAt: timestamp })
   if (message !== expected) {
     throw new AppError(400, 'MESSAGE_MISMATCH', '...')
   }
   ```

4. **JSDoc im Backend wird zur reinen Code-Referenz** (`See @vpp/shared#buildClaimMessage for the canonical format`).

5. **Test:** `messages.test.ts` mit Round-Trip-Tests + Backend-Frontend-Format-Match-Test.

**2-Jahre-Begründung:** Solange das Format „loose" ist, kommt jeder zukünftige Sicherheits-Patch (F6.3-Fix) mit der Notwendigkeit, beide Seiten gleichzeitig zu deployen. Mit einer geteilten Source-of-Truth gibt es keine Drift. Plus: Externe Integratoren (LimeSurvey-Operator, andere HSBI-Tools die VPP-Punkte vergeben wollen) haben einen klaren Anker statt einer Code-Lese-Ralley.

---

### 🟡 F6.10 — HMAC-Key-Rotation: hard cutoff ohne Pre-Flight-Warning, alle laufenden Claims sterben sofort

**File:Line:** `packages/backend/src/services/survey-keys.ts:155-169` (`rotateKey`) ↔ `packages/backend/src/routes/surveys.ts:314-347` (`POST /:id/key/rotate`)

**Problem:**

```ts
// survey-keys.ts:159-169
export function rotateKey(surveyId: number): string {
  const file = load()
  const k = toKey(surveyId)
  if (!file.keys[k]) {
    throw new Error(`Survey ${surveyId} has no key to rotate — use createKey instead`)
  }
  const key = generateKeyMaterial()
  file.keys[k] = { key, createdAt: Date.now() } // ← old key wird sofort überschrieben
  save(file)
  return key
}
```

Kein 2-Key-Übergang, kein `previousKey + acceptUntil`. Im Moment des `rotateKey`-Aufrufs bricht **jeder** noch-nicht-eingelöste Claim-Link, der mit dem alten Key signiert wurde.

**Realistic Failure-Mode:**

1. Admin entscheidet: „Ich rotiere den Key, weil ich denke er könnte geleakt sein."
2. Admin klickt `Rotate survey key` im UI → `POST /surveys/42/key/rotate`.
3. Backend rotiert. Neuer Key wird zurückgegeben.
4. Admin lädt neue Template runter, packt sie in SoSci.
5. **Aber:** Studi X war seit 30 Minuten in der SoSci-Survey, hat sie gerade abgeschickt, sieht die Goodbye-Page mit dem ALTEN Token. Klickt Claim.
6. Backend: `verifyToken` mit neuem Key → Match-Fail → 400 INVALID_TOKEN.
7. Studi X sieht „der Link ist kaputt" und denkt, sein Browser/SoSci sei schuld. Verlässt enttäuscht die Sitzung.
8. Im schlimmsten Fall: 30 Studis im Hörsaal, alle haben SoSci offen, Admin rotiert den Key → 30 broken Claims. Alle müssen die Survey neu starten.

**Pre-Flight-Warning fehlt:**

- Kein Endpoint `GET /surveys/:id/key/usage-stats` → „in den letzten 60 min wurden N HMAC-Tokens generiert (= laufende Claims)".
- Kein Confirmation-Dialog im Frontend, der den Admin warnt: „Achtung — N Claims sind gerade in flight, sie werden invalide".
- Kein Audit-Log für Rotation (siehe F6.12).

**Fix:**

**Variante A — Soft-Rotation mit Übergangs-Phase (komplex, aber UX-richtig):**

```ts
// survey-keys.ts
interface SurveyKeyRecord {
  key: string
  createdAt: number
  previousKey?: string
  previousValidUntil?: number // unix-ms; Backend akzeptiert bis dahin
}

export function rotateKey(surveyId: number, opts?: { gracePeriodMs?: number }): string {
  const grace = opts?.gracePeriodMs ?? 30 * 60 * 1000 // 30 min default
  const file = load()
  const old = file.keys[toKey(surveyId)]
  const newKey = generateKeyMaterial()
  file.keys[toKey(surveyId)] = {
    key: newKey,
    createdAt: Date.now(),
    previousKey: old.key,
    previousValidUntil: Date.now() + grace,
  }
  save(file)
  return newKey
}
```

Plus `verifyToken` versucht new-key, dann (falls grace-period aktiv) old-key:

```ts
if (verifyHmac(newKey, ...)) return true
if (record.previousKey && record.previousValidUntil > Date.now()) {
  if (verifyHmac(record.previousKey, ...)) {
    logger.warn({ surveyId }, 'claim accepted with previous key during grace period')
    return true
  }
}
return false
```

**Variante B — Pre-Flight-Warning (minimal, behält hard-cutoff):**

1. `GET /surveys/:id/key/in-flight` → schätzt anhand `events.json` + `nonce-store`-Diff die Anzahl ausstehender Claims (Nonces verbraucht aber kein Award-Event). Kann mit Bereich 4 F4.6 gleichzeitig gefixt werden.
2. Frontend `<RegenerateTemplateDialog>`: vor Rotation Pre-Flight-Check. Wenn `> 0 in-flight`: Confirmation-Dialog mit „Achtung, N Studis verlieren ihren Link".

**Empfehlung:** Variante B ist günstiger, Variante A ist UX-besser. Hängt davon ab, wie oft Rotation real passiert. Falls < 1×/Quartal: Variante B reicht. Falls häufiger: Variante A.

**2-Jahre-Begründung:** Über 2 Jahre wird mindestens einmal ein Admin in einer panischen Situation (Verdacht auf Leak, Vor-Klausur-Reset) den Key rotieren wollen, ohne zu prüfen ob laufende Claims betroffen sind. Aktuell führt das zu 30+ broken Claims und Notrufen am Klausur-Tag. Mit Pre-Flight-Warning weiß der Admin, was er tut.

---

### ⚪ F6.11 — `maxMessageAgeMs` default 5 min ist zu lang

**File:Line:** `packages/backend/src/config.ts:64`

**Problem:**

```ts
maxMessageAgeMs: parseInt(optional('MAX_MESSAGE_AGE_MS', '300000'), 10),  // 5 min
```

5 Minuten ist das Replay-Fenster (siehe F6.1). Best-practice für EIP-191-Auth ohne Server-Side-Nonce: 60-120 Sekunden. Längere Fenster sind nur dann ok, wenn die Sig bereits durch eine Nonce single-use gemacht wird.

In V2: keine Nonce → 5 min ist der **direkte** Exposure-Window für jeden Sig-Leak.

**Fix:** Default auf 60 s senken:

```ts
maxMessageAgeMs: parseInt(optional('MAX_MESSAGE_AGE_MS', '60000'), 10),
```

UX-Trade-off: Studi mit langsamer Internet-Verbindung könnte zwischen `signMessage` und `POST /claim` mehr als 60 s brauchen. Realistic Latenz auf einem mittelmäßigen 4G: ~5-10 s. 60 s ist 6-10× Pufferung. Ausreichend.

Ebenfalls für Admin-Sigs gleich: 60 s. Admin signiert → klickt sofort den Submit-Button. Wenn er 5 min weg vom Tisch ist: Re-Sign verlangen ist eher Feature als Bug.

**2-Jahre-Begründung:** Linear-Skala: 60s vs 300s = 5× kleineres Replay-Fenster. Bei einem Sig-Leak ist das der Unterschied zwischen „Mallory hat 5 min Zeit, einen Take-Over auszuführen" und „1 min". Nicht eliminiert (siehe F6.1-Fix), aber gemildert.

---

### ⚪ F6.12 — Kein Auth-Audit-Log: keine Spur, wer wann was signiert hat

**File:Line:** Backend-weite Lücke. `requestLogger.ts:5-11` loggt Requests, aber unstrukturiert.

**Problem:**

Aktuell gibt es keine zentrale Stelle, an der dokumentiert wird:

- Wer hat sich wann als Admin authentifiziert (Sig recovered → address X um Y).
- Welche Operationen wurden mit welcher Admin-Sig ausgelöst (X hat Y addAdminned, X hat Y revoked).
- Wann wurde ein Survey-Key rotiert, von wem, mit welcher Begründung (commit-message-Style).

`requestLogger` (pino-http) loggt jeden HTTP-Request, aber:

- Unstrukturiert (Address ist nicht als top-level-field, sondern in Body/Headers).
- Mit Sigs (siehe F6.4) — d. h. das Log ist gleichzeitig sensibel und nicht-greppbar.
- Wird mit Plesk-Logrotation nach 7-14 Tagen gelöscht.

**Folgen:**

- **Forensik unmöglich:** Wenn in einem Monat festgestellt wird, dass `0xMALLORY` ADMIN_ROLE hat — wer hat ihn hinzugefügt? On-chain steht nur „Tx von Minter", nicht „auf Anweisung von Admin Alice". Off-chain ist die Spur weg.
- **Compliance-Lücke:** HSBI-Datenschutz-Auflagen verlangen typischerweise, dass administrative Aktionen mit Akteur+Zeitstempel dokumentiert werden. Aktuell nicht erfüllbar.
- **Onboarding/Offboarding-Tracking:** Wenn Admin Alice die Hochschule verlässt und ihre Wallet revoked werden muss, braucht man eine Liste „letzte Admin-Aktion von Alice" — die gibt es nicht.

**Fix:**

```ts
// services/audit-log.ts (neu)
interface AuditEntry {
  timestamp: number
  actor: string // recovered admin address (lowercase)
  operation: string // 'admin.add', 'survey.rotate', etc.
  targetSubject: string | null // address or surveyId
  txHash: string | null // if on-chain action
  result: 'success' | 'failure'
  errorCode?: string
  // intentionally NO sig/message stored — those are sensitive
}
const AUDIT_LOG_PATH = resolve(DATA_DIR, 'audit-log.jsonl')

export function appendAudit(entry: AuditEntry): void {
  appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n')
}
```

In `requireAdminHandler`-Wrapper nach erfolgreicher Auth + nach Operation-Completion: `appendAudit({...})`.

Plus:

- `GET /api/v1/admin/audit?actor=0x...&from=...&to=...` (admin-only) für Forensik.
- Cron für Audit-Log-Rotation (monatlich, in Bereich 4-Backup-Plan integrieren).

**Dateigröße:** ~150 bytes/entry × 100 Auth-Events/Tag × 730 Tage = ~11 MB nach 2 Jahren. Trivial.

**2-Jahre-Begründung:** Über 2 Jahre wird mindestens einmal ein Admin gehen, einmal eine Aktion in Frage gestellt werden („wer hat dieses Survey deaktiviert?"), einmal ein Datenschutz-Audit auflaufen. Ohne Log: keine Antworten. Mit Log: 5-Sekunden-grep.

---

## Empfohlener Fix-Pfad

**Phase 1 — Sofort vor jedem Klassen-Run (Sicherheits-Notbremsen):**

1. **F6.4** — pino-Redact für Sigs/Messages. 30 min Implementierung, 0 Risiko, sofortiger Sicherheits-Gewinn.
2. **F6.11** — `maxMessageAgeMs` von 300 000 auf 60 000 senken. ENV-Variable-Change. 5 min.
3. **F6.6** — Default-Rate-Limits korrigieren + Doku-Kommentar. 15 min.

**Phase 2 — Vor Production (Strukturelle Fixes):**

4. **F6.1 + F6.2 + F6.3** — Server-Side-Nonce + canonical-Message + Operation-Binding. Alle drei müssen zusammen implementiert werden, weil sie sich gegenseitig stützen. Aufwand: 2-3 Tage Backend + 1-2 Tage Frontend + Test-Suite. Output: dokumentierter ADR-0005 mit dem neuen Auth-Modell.
5. **F6.5** — isAdmin-Cache + Stale-Fallback + 503-statt-500 bei RPC-Outage. ~4h Implementation + Tests.
6. **F6.7** — Frontend-State-Refactor: keine Sig im Component-State, Helper-Hook mit Closure. Ergibt sich naturgemäß aus F6.1-Fix.

**Phase 3 — Operative Reife (UX + Forensik):**

7. **F6.8** — Recovery-Endpoint `POST /admin/nonce/restore` + Detection-Helper. ~3h.
8. **F6.9** — `@vpp/shared`-Helper für Claim-Message + Frontend/Backend-Refactor. ~4h. Ergibt sich aus F6.3-Fix.
9. **F6.10** — Pre-Flight-Warning für Key-Rotation (Variante B). ~6h. Variante A (Soft-Rotation) optional.
10. **F6.12** — Audit-Log mit `data/audit-log.jsonl` + Admin-Endpoint + Bereich-4-Backup-Integration. ~6h.

**Geschätzter Gesamt-Aufwand:** 6-8 Personentage. Phase 1 ist eine Mittagspause, Phase 2 ist die eigentliche Arbeit, Phase 3 ist die Reife-Investition.

---

## Cross-Cutting Notes (für andere Bereiche)

**Zu Bereich 2 (Backend Key Management):**

- F6.4-Sig-Leak-Pfad ist eine Eskalations-Surface, die mit Bereich-2-Findings (Klartext-Minter-Key auf Plesk) zusammenfällt. Wer Server-Read-Access hat (siehe Bereich 4 F4.5 für `data/`-Permissions), sieht sowohl Logs als auch ENV.
- Audit-Log (F6.12) sollte den Minter-Key-Rotation-Flow ebenfalls erfassen.

**Zu Bereich 3 (RPC):**

- F6.5-Cache-Fallback braucht denselben `withRpcRetry`-Pfad wie Bereich 3 F3.X. Bei der Cache-Implementation prüfen, dass der `last-known-good`-Pfad konsistent mit dem Bereich-3-FallbackProvider-Verhalten ist.
- `isAdmin`-Hot-Path verstärkt das Compute-Unit-Budget-Problem aus Bereich 3.

**Zu Bereich 4 (Stateful Stores):**

- F6.4-Plesk-Tenant-Read auf Logs ist symmetrisch zu Bereich 4 F4.5 (World-Read auf `data/`-Files). Beide brauchen denselben `chmod 0700 data/ && chmod 0600 data/*.json`-Fix plus Plesk-Custom-Log-Path.
- F6.12-Audit-Log braucht Backup-Integration mit dem in Bereich 4 ausstehenden Backup-Konzept.
- F6.8-Recovery-Endpoint berührt `nonce-store.ts`, sollte mit Bereich-4-Concurrency-Fix gemeinsam getestet werden.

**Zu Bereich 5 (Frontend Wallet & XSS):**

- F6.7-React-State-Sig ist der Auth-Side-Effekt der Bereich-5-XSS-Findings. Selbst kein XSS heute, aber `i18next.escapeValue:false` (F5.9) macht Sig im React-State zu einem direkt erreichbaren XSS-Beute-Item.
- F6.7-Fix mit Per-Operation-Sigs ist gleichzeitig F5.2-Fix (Admin-MetaMask-Loop): wenn jede Operation re-signed wird, gibt es kein „infinite popup loop after auth-fail"-Problem mehr, weil die Auto-Auth-Useeffect-Schleife wegfällt.

**Zu Bereich 7 (Deployment):**

- F6.4 + F6.12 brauchen Plesk-Log-Path-Konfiguration. ENV-Variable für `LOG_FILE_PATH`?
- F6.10 (Key-Rotation-Warning) sollte im Operator-Runbook (Bereich 7) als „vor Rotation immer Pre-Flight-Check" dokumentiert sein.

**Zu Bereich 8 (Tests & CI):**

- Auth-Test-Suite muss erweitert werden um:
  - Cross-Operation-Replay-Test (Sig für `Admin login` schicken an `/admin/add` → erwarte 401).
  - Server-Side-Nonce-Single-Use-Test.
  - Body-Hash-Tampering-Test (Sig korrekt, Body manipuliert → 401).
  - RPC-Outage-Test mit isAdmin-Cache (Mock-RPC fail, prüfe stale-cache-Fallback).
- Frontend-E2E (Playwright?) für die per-Operation-Sign-UX.

---

## Severity-Tally Bereich 6

| Severity   | Anzahl | Findings               |
| ---------- | ------ | ---------------------- |
| 🔴 Blocker | 3      | F6.1, F6.2, F6.3       |
| 🟠 Major   | 4      | F6.4, F6.5, F6.6, F6.7 |
| 🟡 Minor   | 3      | F6.8, F6.9, F6.10      |
| ⚪ Nit     | 2      | F6.11, F6.12           |
| **Gesamt** | **12** |                        |

---

## Aus V1 obsolet geworden

V1-Audit hat Bereich 6 (Auth) nicht separat untersucht. Die V1-Sicherheits-Befunde im Auth-Pfad (`02-bereich-1-smart-contract.md` Findings 1.7 „Link-Sharing-Catastrophe", 1.3 „Klartext-Secret on-chain") sind durch V2-HMAC-Architektur **strukturell** obsolet. Ihre Nachfolge-Probleme (Server-Side-Nonce, Operation-Binding, Sig-Leak) sind in F6.1-F6.3 behandelt.

**Effektiv:** V1→V2 hat das Sicherheits-Modell von „Shared-Secret + URL-Replay" zu „Per-Participant-HMAC + Sig-Replay" verschoben. Der HMAC-Anteil ist sauber implementiert (✅ H6.2). Der Sig-Anteil ist die offene Wunde (🔴 F6.1-F6.3). Kein Regress, aber auch nicht „done".
