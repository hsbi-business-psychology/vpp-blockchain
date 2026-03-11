import { config } from '../config.js'

/**
 * Generates a SoSci Survey project XML that can be imported directly.
 *
 * The file matches the native SoSci Survey export format (<surveyProject>).
 * Only the goodbye page is customised — it shows a styled "claim your points"
 * button and auto-redirects to the VPP claim URL after 8 seconds.
 */
export function generateSoSciTemplate(
  surveyId: number,
  secret: string,
  points: number,
): string {
  const claimUrl = `${config.frontendUrl}/claim?surveyId=${surveyId}&secret=${encodeURIComponent(secret)}`
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const pointLabel = points > 1 ? 'Versuchspersonenpunkte' : 'Versuchspersonenpunkt'

  const goodbyeHtml = `<div style="max-width:480px;margin:2rem auto;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="font-size:2.5rem;margin-bottom:0.5rem;">&#10003;</div>
  <h2 style="margin:0 0 0.5rem;font-size:1.35rem;color:#111;">Vielen Dank f&#252;r deine Teilnahme!</h2>
  <p style="margin:0.75rem 0;color:#555;font-size:0.95rem;">
    Du erh&#228;ltst <strong>${points} ${pointLabel}</strong> f&#252;r diese Umfrage.
    Klicke auf den Button, um deine Punkte einzul&#246;sen.
  </p>
  <a href="${claimUrl}" style="display:inline-block;margin:1rem 0;padding:0.7rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:600;font-size:1rem;">
    Punkte jetzt einl&#246;sen &#8594;
  </a>
  <p style="margin-top:1.25rem;font-size:0.8rem;color:#999;">
    Du wirst in 8 Sekunden automatisch weitergeleitet.<br/>
    <a href="${claimUrl}" style="color:#2563eb;word-break:break-all;">${claimUrl}</a>
  </p>
  <meta http-equiv="refresh" content="8;url=${claimUrl}" />
</div>`

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE surveyProject SYSTEM "doctype.survey.dtd">
<surveyProject version="2.4" timestamp="${timestamp}" program="oFb" progversion="3.8.03 1410">
<title>VPP Survey ${surveyId}</title>
<description />
<attributes.specific program="ofb">
<attr id="language">deu</attr>
</attributes.specific>
<questionnaire>
<title>Fragebogen</title>
<attributes.specific program="ofb">
<attr id="id">base</attr>
<attr id="content">
<![CDATA[<?xml version="1.0"?>
<questionnaire>

<!-- Seite 1 -->
<page intID="1">
</page>


</questionnaire>]]>
</attr>
<attr id="goodbye">
<![CDATA[${goodbyeHtml}]]>
</attr>
<attr id="selection">1</attr>
</attributes.specific>
</questionnaire>
</surveyProject>
`
}
