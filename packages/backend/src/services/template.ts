import { config } from '../config.js'

/**
 * Generates a SoSci Survey XML template snippet that redirects
 * participants to the VPP claim page after survey completion.
 *
 * The generated XML contains the final-page redirect configuration
 * with the surveyId and secret embedded as query parameters.
 */
export function generateSoSciTemplate(
  surveyId: number,
  secret: string,
  points: number,
): string {
  const claimUrl = `${config.frontendUrl}/claim?surveyId=${surveyId}&secret=${encodeURIComponent(secret)}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  VPP Survey Template
  ===================
  Survey ID: ${surveyId}
  Points:    ${points}

  Import this file into SoSci Survey to automatically redirect
  participants to the VPP claim page after survey completion.

  IMPORTANT: Keep the secret confidential. Anyone with the secret
  can claim points for this survey.
-->
<survey>
  <config>
    <surveyId>${surveyId}</surveyId>
    <points>${points}</points>
    <redirectUrl><![CDATA[${claimUrl}]]></redirectUrl>
  </config>

  <!-- Final page: redirect to VPP claim page -->
  <finalPage>
    <redirect url="${claimUrl}" />
    <text>
      Thank you for completing this survey!
      You are being redirected to claim your participation points.
      If you are not redirected automatically, please click the link below:
      ${claimUrl}
    </text>
  </finalPage>
</survey>
`
}
