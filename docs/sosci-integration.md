# SoSci Survey & LimeSurvey Integration

This guide explains how to connect SoSci Survey (or LimeSurvey) to VPP so that participants automatically receive blockchain-based participation points after completing a study.

> **V2 update (April 2026):** This guide describes the current HMAC-token flow that ships with `SurveyPointsV2`. The earlier "shared secret in the URL" approach (V1) has been retired — see [ADR 0004](adr/0004-hmac-claim-tokens-and-upgradeable-contract.md) for the security rationale.

## Overview

When a participant finishes a study, the survey tool's end page runs a small **PHP snippet** that mints a unique, single-use claim link for that participant and renders it as a styled "Punkte jetzt einlösen" button:

```
Participant completes survey
         │
         ▼
SoSci/LimeSurvey end page renders PHP:
  - Generates 16 random bytes  →  nonce
  - Computes HMAC-SHA256("v1|<surveyId>|<nonce>", surveyKey)  →  token
  - Builds: https://vpstunden.hsbi.de/claim?s=42&n=<nonce>&t=<token>
         │
         ▼
Participant clicks the button → VPP claim page opens
  → backend verifies HMAC + marks nonce consumed
  → backend submits awardPoints(wallet, surveyId) to the smart contract
  → participant sees confirmation
```

Three properties matter:

1. **The claim URL is single-use per participant.** Sharing it on a private channel does not let anyone else claim — the backend rejects the second use with `409 NONCE_USED`.
2. **The HMAC key never leaves the survey server.** It lives in PHP code only the survey operator can read. Participants see only `nonce` + `token`.
3. **Compromising one survey's key compromises only that survey's pool.** Operators can rotate a key with one click in the admin UI; previously distributed links become invalid the moment they hit "Rotate".

## Step-by-Step Setup

### 1. Register the survey in the VPP Admin Dashboard

Open `https://vpstunden.hsbi.de/admin`, sign in with your admin wallet, then:

1. Click **"Umfrage registrieren"** ("Register survey").
2. Fill in **title**, **points per claim** (1–255), and accept the auto-generated **survey ID** (or pick your own).
3. Sign the registration transaction with your admin wallet.
4. The dashboard shows the **HMAC key** in a dialog **once**. Copy it (the dialog has a copy button) and **store it in a password manager**. You will need it in step 3.

The key looks like a 43-character base64url string, e.g. `Hk3Pj8s9...EXAMPLE...x4QZ2`.

### 2. Download the template

In the surveys table, open the row menu (`⋯`) for your survey and click **"Vorlage herunterladen"**:

- **SoSci Survey** → `.xml` (project export with end-page snippet)
- **LimeSurvey** → `.lss` (survey structure with snippet in `surveyls_endtext`)

The downloaded file already includes the HMAC key for this survey — you do not have to paste it manually unless you rotate later.

### 3. Import into your survey tool

#### SoSci Survey

1. **Survey Projects → Import project** → upload the `.xml`.
2. SoSci creates a new project with the goodbye page pre-configured.
3. Add your questionnaire as usual.
4. Open the **goodbye page** in the questionnaire editor. You should see a `<?php … ?>` block followed by the styled HTML button.
5. **Important:** confirm SoSci has **PHP execution enabled on the goodbye page** (it is enabled by default; only locked-down installations have it off).
6. Activate the project.

#### LimeSurvey

1. **Surveys → Create new survey → Import** → upload the `.lss`.
2. The end page (`surveyls_endtext`) already contains the snippet.
3. **Survey settings → General settings → Show "no answer"** is irrelevant here, but make sure **"PHP code allowed in the survey"** (Survey settings → Presentation) is enabled.
4. Activate the survey.

### 4. Test the integration end-to-end

Before sending students the link:

1. **Run** the survey yourself with a fresh wallet.
2. After clicking the claim button, **complete the claim flow** (`/claim?s=…&n=…&t=…`).
3. Confirm the points show up in the **Admin → System status** dashboard (`claimCount` increments, the matching `PointsAwarded` event lists your wallet).
4. **Click the claim link a second time** (e.g. by hitting the browser back button) — you should see `Dieser Claim-Link wurde bereits benutzt` (`NONCE_USED`).

If anything looks off, see Troubleshooting below.

## URL Parameters

After the PHP snippet runs, the participant's URL looks like:

```
https://vpstunden.hsbi.de/claim?s=42&n=<nonce>&t=<token>
```

| Parameter | Description                         | Example length        |
| --------- | ----------------------------------- | --------------------- |
| `s`       | Numeric survey ID                   | 1–6 digits            |
| `n`       | Single-use random nonce (base64url) | 16–128 characters     |
| `t`       | HMAC-SHA256 token (base64url)       | exactly 43 characters |

The frontend rejects malformed values immediately with `INVALID_NONCE_FORMAT` / `INVALID_TOKEN_FORMAT` so a participant who manually types the URL gets a clear error rather than a vague backend failure.

## Rotating an HMAC Key

If a key is suspected leaked (e.g. a screenshot of the survey template ended up in a public chat), rotate it from the Admin Dashboard:

1. Open the row menu for the survey → **"HMAC-Schlüssel anzeigen"**.
2. Click **"Neuen Schlüssel erzeugen (rotieren)"** and confirm.
3. **Immediately update** the SoSci/LimeSurvey template by re-downloading it (see step 2 above) and re-importing **only the goodbye page**, or by replacing the `$VPP_KEY_B64 = '…'` line in PHP by hand.

> **All previously distributed claim links become invalid the moment you click rotate.** Participants who already saw the old end page but have not yet clicked the button will see `INVALID_TOKEN`. If you have an active study running, rotate **after** the data collection window closes, not in the middle of it.

## Security Considerations

- **The HMAC key is sensitive.** Anyone who has it can mint valid claim links until you rotate. Treat it like an API secret: password manager, no email/chat, no committing to public Git.
- **The key is shown once.** If you lose it, register a new survey or use the rotate flow. The backend can re-issue, but only an authenticated admin can fetch it via `GET /api/v1/surveys/:id/key`.
- **Replay protection is fail-closed.** The backend marks the nonce consumed before broadcasting the on-chain TX. If the TX later fails for any reason (e.g. the participant's wallet is the zero address), the nonce is still gone — they have to re-take the survey, which is the correct behaviour for an at-most-once semantic.
- **Each wallet can still claim only once per survey** (enforced on-chain by `_claimed[wallet][surveyId]`). The HMAC layer prevents one _URL_ from being reused; the contract layer prevents one _wallet_ from collecting twice.

## Troubleshooting

| Problem                                                                | What to check                                                                                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goodbye page shows literal `<?php` text                                | PHP execution is disabled on the SoSci/LimeSurvey end page — enable it in the project settings.                                                                             |
| Participants see `INVALID_TOKEN`                                       | The HMAC key in the template no longer matches the one on the backend — the operator rotated. Re-download the template and re-import.                                       |
| Participants see `NONCE_USED`                                          | The link was clicked twice (browser back button, refresh, or someone else used it). Expected behaviour.                                                                     |
| Participants see `INVALID_NONCE_FORMAT`                                | The PHP snippet did not run — the URL contains `<?php` instead of a real nonce. Check PHP is enabled.                                                                       |
| Participants see `SURVEY_INACTIVE` (HTTP 410)                          | An admin deactivated the survey. Reactivate via the row menu if this was unintentional.                                                                                     |
| Participants see `ALREADY_CLAIMED`                                     | The wallet has already claimed this survey. They need to use a different wallet to claim again.                                                                             |
| `Dieser Link ist nur einmal gültig` warning, but no claim went through | Check the backend `data/used-nonces.json` for an entry with the participant's nonce. If present, the nonce was consumed; the participant needs a new SoSci end-page render. |

## Alternative Survey Tools

Any survey tool that supports **PHP on the end page** can be integrated by reusing the snippet from the generated SoSci template — the relevant block is:

```php
<?php
$VPP_FRONTEND  = 'https://vpstunden.hsbi.de';
$VPP_SURVEY_ID = <surveyId>;
$VPP_KEY_B64   = '<paste HMAC key here>';
$VPP_POINTS    = <pointsPerClaim>;

$nonce_raw = function_exists('random_bytes') ? random_bytes(16) : openssl_random_pseudo_bytes(16);
$nonce = rtrim(strtr(base64_encode($nonce_raw), '+/', '-_'), '=');

$key_raw = base64_decode(strtr($VPP_KEY_B64, '-_', '+/'));
$mac_raw = hash_hmac('sha256', 'v1|' . $VPP_SURVEY_ID . '|' . $nonce, $key_raw, true);
$token = rtrim(strtr(base64_encode($mac_raw), '+/', '-_'), '=');

$claim_url = $VPP_FRONTEND . '/claim?s=' . $VPP_SURVEY_ID . '&n=' . $nonce . '&t=' . $token;
?>
<a href="<?= htmlspecialchars($claim_url, ENT_QUOTES, 'UTF-8'); ?>">Punkte jetzt einlösen →</a>
```

Tools without server-side scripting (e.g. Google Forms) **cannot** be integrated this way without a small relay — the entire point of the snippet is that the HMAC key never reaches the participant's browser. A static URL would re-introduce the V1 link-sharing vulnerability.
