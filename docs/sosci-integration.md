# SoSci Survey Integration

This guide explains how to connect SoSci Survey to VPP so that participants automatically receive blockchain-based participation points after completing a survey.

## Overview

The integration works through a **redirect**: when a participant finishes a survey in SoSci Survey, they are redirected to the VPP claim page with the survey ID and secret embedded in the URL.

```
Participant completes survey
         │
         ▼
SoSci Survey redirects to:
https://vpp.example.de/claim?surveyId=42&secret=VPP-x8k2m9
         │
         ▼
VPP claim page opens
→ Participant creates/loads wallet
→ Clicks "Claim Points"
→ Points are recorded on blockchain
```

## Step-by-Step Setup

### 1. Register the Survey

In the VPP Admin Dashboard (`/admin`):

1. Click **"Register Survey"**
2. Fill in:
   - **Survey ID**: A unique number (e.g., `42`)
   - **Secret**: A random string (e.g., `VPP-x8k2m9`) — keep this confidential
   - **Points**: How many points to award (1–255)
   - **Max Claims**: Maximum number of participants (0 = unlimited)
3. Sign the transaction with your admin wallet
4. Download the generated XML template

### 2. Import Template into SoSci Survey

The downloaded XML template contains the redirect configuration. To use it:

1. Open your SoSci Survey project
2. Navigate to **Questionnaire** → **Final Page**
3. Configure the redirect URL:
   ```
   https://your-vpp-domain.edu/claim?surveyId=42&secret=VPP-x8k2m9
   ```
4. Enable **automatic redirect** at the end of the survey

### 3. Template Format

The generated template is a standard XML file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<survey>
  <config>
    <surveyId>42</surveyId>
    <points>2</points>
    <redirectUrl><![CDATA[https://vpp.example.de/claim?surveyId=42&secret=VPP-x8k2m9]]></redirectUrl>
  </config>

  <finalPage>
    <redirect url="https://vpp.example.de/claim?surveyId=42&secret=VPP-x8k2m9" />
    <text>
      Thank you for completing this survey!
      You are being redirected to claim your participation points.
      If you are not redirected automatically, please click the link below:
      https://vpp.example.de/claim?surveyId=42&secret=VPP-x8k2m9
    </text>
  </finalPage>
</survey>
```

### 4. Test the Integration

Before going live, verify the complete flow:

1. **Register** a test survey in the admin dashboard
2. **Create** a test survey in SoSci Survey with the redirect URL
3. **Complete** the test survey as a participant
4. **Verify** the redirect lands on the VPP claim page with correct parameters
5. **Create** a test wallet and claim the points
6. **Check** that points appear on the blockchain

## URL Parameters

The redirect URL uses two query parameters:

| Parameter | Description | Example |
|---|---|---|
| `surveyId` | Numeric survey identifier | `42` |
| `secret` | Survey secret for verification | `VPP-x8k2m9` |

## Security Considerations

- **Keep the secret confidential**: Anyone with the secret can claim points. Only share it through the SoSci Survey redirect URL.
- The secret is stored as a **keccak256 hash** on-chain — it cannot be reverse-engineered from the blockchain.
- Each wallet can only claim **once per survey** (enforced on-chain).
- The secret should be **randomly generated** and not guessable.

## Troubleshooting

| Problem | Solution |
|---|---|
| Redirect does not work | Check that the final page in SoSci Survey is configured with the correct URL |
| "Survey not found" error | Verify that the survey ID matches the one registered in VPP |
| "Invalid secret" error | Ensure the secret in the URL matches the one used during registration |
| "Already claimed" error | The wallet has already claimed this survey — this is expected behavior |
| Participant sees blank page | Check that the VPP frontend is deployed and accessible |

## Alternative Survey Tools

While VPP is optimized for SoSci Survey, any survey tool that supports **redirect URLs** at the end of a survey can be integrated. The only requirement is:

1. The survey tool redirects to a configurable URL after completion
2. The URL includes `surveyId` and `secret` as query parameters

Compatible alternatives include LimeSurvey, Qualtrics, and Google Forms (with custom redirect).
