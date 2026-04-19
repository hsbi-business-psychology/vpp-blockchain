# ADR 0006: Engine-Agnostic Launcher Link for Survey End-Pages (V2.3)

## Status

Accepted (2026-04-19, supersedes the V2.2 PHP/JS template split that
was introduced one day earlier as a stop-gap).

## Context

ADR-0004 introduced HMAC-signed claim URLs (`/claim?s=&n=&t=`) but
left the question of _how_ the URL is rendered on the survey end-page
to the templates produced by `services/template.ts`. Two failure
modes surfaced in production within the first 48 hours of V2:

1. **V2.0 — single PHP snippet (worked on SoSci, broke on LimeSurvey).**
   The survey end-text contained a `<?php ... ?>` block that ran on
   the survey engine's server, computed nonce + HMAC, and rendered
   the claim button. SoSci executes PHP in goodbye pages by default
   so this worked. **LimeSurvey 5.x and 6.x disable PHP execution in
   `surveyls_endtext` for XSS hardening** — the participant saw the
   raw `<?php` source as text, with the per-survey HMAC key visible
   in plain sight.

2. **V2.2 — engine-specific PHP/JS split (PHP for SoSci, browser-side
   JS for LimeSurvey).** The fix-attempt for #1: detect the format,
   ship a Web Crypto API JavaScript snippet to LimeSurvey, keep PHP
   for SoSci. **LimeSurvey HTMLPurifier strips `<script>` tags from
   `surveyls_endtext`** as part of the same XSS hardening — the JS
   block was simply removed at render time. The participant saw the
   loading text "Link wird vorbereitet…" forever, the button never
   appeared. As a regression the JS variant also leaked the HMAC key
   into the page source for LimeSurvey participants who viewed source.

The structural problem was that we were trying to compute a
cryptographic token in an environment we did not control — and every
survey engine has slightly different rules about what HTML/JS/PHP it
allows in goodbye pages, with no reliable way to detect or work
around per-engine purifier settings from inside our snippet. Each
new engine (Qualtrics, Google Forms, Unipark, ...) would have meant
yet another snippet variant + per-engine acceptance test.

We also wanted the per-survey HMAC key to **never** reach a
participant browser, which the V2.2 LimeSurvey-JS variant violated.

## Decision

Move nonce + HMAC token generation **back to the backend** behind a
new endpoint and ship a single engine-agnostic snippet to all survey
engines:

```
GET /api/v1/claim/launch/:surveyId
   → 302 Location: /claim?s=:id&n=<fresh-nonce>&t=<hmac-token>
```

The survey end-page snippet becomes a plain styled `<a href>` link to
the launcher route. No `<script>`, no `<?php>`, no per-engine
configuration:

```html
<div style="...styled card...">
  <h2>Vielen Dank für deine Teilnahme!</h2>
  <p>Du erhältst <strong>1 Versuchspersonenpunkt</strong> für diese Umfrage.</p>
  <a href="https://vpstunden.hsbi.de/api/v1/claim/launch/1" rel="noopener" style="...">
    Punkte jetzt einlösen →
  </a>
</div>
```

The backend launcher (`packages/backend/src/routes/claim.ts`):

1. Parses and validates `surveyId` (positive integer, ≤ 1e6).
2. Looks up the per-survey HMAC key from `services/survey-keys.ts`
   (404 if missing).
3. Generates a fresh 16-byte nonce (`crypto.randomBytes`).
4. Computes the HMAC token via `services/hmac.ts#buildClaimUrl`
   (same `v1|<surveyId>|<nonce>` canonical message that the
   verifier in `POST /claim` reconstructs).
5. Sets `Cache-Control: no-store` so CDNs and browser back/forward
   navigation cannot pin a stale nonce.
6. Returns `302 Location: ${frontendUrl}/claim?s=&n=&t=`.

Both `generateSoSciTemplate` and `generateLimeSurveyTemplate` now
emit the **identical** snippet — the only template-format-specific
content is the surrounding XML wrapper required by each engine's
import file format.

## Consequences

### Security

- **HMAC key never reaches the browser.** Strict improvement over
  V2.0 (key-in-URL-after-PHP-render-was-fine) and V2.2 (key in JS
  page source for LimeSurvey). The key now lives only in
  `data/survey-keys.json` and only the backend reads it.
- **Replay model unchanged.** Each nonce is single-use via
  `services/nonce-store.ts` (atomic check-and-set, disk-backed).
  The on-chain `_claimed[surveyId][wallet]` guard in
  `SurveyPointsV2` still enforces one claim per (wallet, survey)
  regardless of nonce reuse attempts. The `MAX_MESSAGE_AGE_MS`
  freshness check on the EIP-191 sign-message is unchanged.
- **Trust boundary clarification.** Anyone with a launcher URL
  (i.e. anyone who can reach the survey end-page) can mint as many
  fresh `(nonce, token)` pairs as they like, but each pair only
  entitles the holder to one POST /claim. This is the same
  property the V2.0/V2.2 snippets had — a participant who refreshed
  the goodbye page got a new nonce each time. The launcher does
  not make this any worse.
- **No JS/PHP execution requirements on participant browsers.** The
  Web Crypto API dependency from V2.2 (Safari ≥ 11, etc.) is gone;
  the snippet works on any browser that can render `<a href>`.

### Operations

- **Single source of truth for survey-end snippet.** No more "which
  engine ships which snippet" branching in `template.ts`. Future
  engines (Qualtrics, Unipark, Google Forms, custom WordPress
  pages) work without code changes — operators just paste the
  same `<a href>` block.
- **No operator configuration required.** Pre-V2.3 operators had to
  ensure their LimeSurvey instance had XSS filtering disabled for
  SuperAdmins — fragile, undocumented, broke after every LimeSurvey
  update. V2.3 only requires `<a>` + inline `style` to survive the
  purifier, which every default HTMLPurifier config allows.
- **Rate-limit shared with `POST /claim`.** The launcher uses
  `claimLimiter` (500 req/min/IP default — sized for a 100-student
  cohort behind a single NAT IP). Token-mint floods from a single
  source are blunted, but the real abuse defence remains the
  single-use nonce store and the on-chain claim guard.
- **Cache-Control: no-store + Pragma: no-cache** on the redirect.
  Without these, a CDN cache between the launcher and the
  participant could pin a single nonce to all visitors, leading
  to NONCE_USED on every second click. Verified live with two
  consecutive `curl` calls returning distinct redirect URLs.

### Trade-offs

- **Slightly more backend traffic.** Each survey end-page click now
  hits the backend twice — once for `/claim/launch/:id` and once
  for `POST /claim`. Pre-V2.3 it was one POST. At 100 students per
  cohort × 4 cohorts/year × 1 click per student this is negligible
  (~400 extra requests/year, less than a single UptimeRobot
  health-check minute).
- **No client-side computation for graceful failure.** The V2.2 JS
  variant could show "Web Crypto API unavailable" inline; the V2.3
  snippet shows nothing if the launcher endpoint is down. This is
  acceptable because the launcher being down is a P0 incident
  caught by `health/ready` monitoring (UptimeRobot every 5 min,
  see ADR-0004 Operations section).
- **Backend availability is now in the critical path of every
  claim.** Same as for `POST /claim` itself — the project is
  already a backend-mediated relayer, so this does not change the
  effective availability SLO.

### Test coverage

- `packages/backend/test/template.test.ts` (17 tests) verifies that
  both engines emit the identical launcher link, that no PHP/JS/key
  ever appears in either template, and that the snippet survives
  CDATA-wrapping for LimeSurvey import.
- `packages/backend/test/claim.test.ts` (8 launcher tests) verifies:
  - 302 redirect with well-shaped `?s=&n=&t=` URL
  - **Round-trip launch → POST /claim succeeds** (proves the
    issued token is backend-valid, not just well-shaped)
  - Two consecutive launches produce distinct nonces
  - `Cache-Control: no-store` is set
  - 404 for unregistered surveys
  - 400 for non-numeric or non-positive `surveyId`
  - HMAC key never appears in the redirect URL or response body

## Migration

V2.3 is backwards-compatible at the protocol level — the
`/claim?s=&n=&t=` URL format that the participant lands on is
unchanged, so any in-flight V2.0/V2.2 link issued before the
deploy still works. Operators must regenerate their templates via
the admin UI to get the new snippet; old templates still function
via the old code paths but degrade as described in the Context
section above (PHP-source-as-text, missing button, key leak).

The `generateSoSciTemplate` and `generateLimeSurveyTemplate` API
signatures are unchanged for binary compatibility with existing
admin-UI code; the `surveyKey` argument is now ignored by the
template builder (the launcher looks the key up server-side).

## References

- Implementation: `packages/backend/src/routes/claim.ts` (launcher
  route) and `packages/backend/src/services/template.ts` (snippet
  builder).
- Unit + integration tests: `packages/backend/test/claim.test.ts`,
  `packages/backend/test/template.test.ts`,
  `packages/backend/test/surveys.test.ts`.
- Operator runbook: `docs/runbooks/sosci-onboarding.md` (V2.3
  notice + troubleshooting table).
- Audit context: `docs/audit/v2/06-bereich-6-auth-replay.md` (M17
  HMAC-trust-boundary finding) — the launcher closes M17 for both
  engines simultaneously.
- Live verification: production launch tested 2026-04-19 19:09 UTC
  with TX `0xfd70e7d88b7f8b0285f3d9da5f716b7209bf15316b56999dcec3758d608b41b6`
  on Base mainnet, `awardPoints(0x6f9b...be37, surveyId=1)`,
  status SUCCESS.
