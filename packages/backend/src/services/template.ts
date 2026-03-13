import { config } from '../config.js'

export type TemplateFormat = 'sosci' | 'limesurvey'

function buildClaimUrl(surveyId: number, secret: string): string {
  return `${config.frontendUrl}/claim?surveyId=${surveyId}&secret=${encodeURIComponent(secret)}`
}

function buildClaimHtml(claimUrl: string, points: number): string {
  const pointLabel = points > 1 ? 'Versuchspersonenpunkte' : 'Versuchspersonenpunkt'
  return `<div style="max-width:480px;margin:2rem auto;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="font-size:2.5rem;margin-bottom:0.5rem;">&#10003;</div>
  <h2 style="margin:0 0 0.5rem;font-size:1.35rem;color:#111;">Vielen Dank f&#252;r deine Teilnahme!</h2>
  <p style="margin:0.75rem 0;color:#555;font-size:0.95rem;">
    Du erh&#228;ltst <strong>${points} ${pointLabel}</strong> f&#252;r diese Umfrage.
    Klicke auf den Button, um deine Punkte einzul&#246;sen.
  </p>
  <a href="${claimUrl}" style="display:inline-block;margin:1rem 0;padding:0.7rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:600;font-size:1rem;">
    Punkte jetzt einl&#246;sen &#8594;
  </a>
</div>`
}

/**
 * Generates a SoSci Survey project XML that can be imported directly.
 *
 * The file matches the native SoSci Survey export format (<surveyProject>).
 * Only the goodbye page is customised — it shows a styled "claim your points"
 * button linking to the VPP claim URL.
 */
export function generateSoSciTemplate(surveyId: number, secret: string, points: number): string {
  const claimUrl = buildClaimUrl(surveyId, secret)
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const goodbyeHtml = buildClaimHtml(claimUrl, points)

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

/**
 * Generates a LimeSurvey Question export (.lsq) that can be imported into
 * any LimeSurvey survey. The question uses type "X" (Boilerplate/Display)
 * which renders pure HTML — the styled claim button linking to the VPP
 * claim URL.
 *
 * Import instructions: Survey > Structure > Import question > upload .lsq
 */
export function generateLimeSurveyTemplate(
  surveyId: number,
  secret: string,
  points: number,
): string {
  const claimUrl = buildClaimUrl(surveyId, secret)
  const claimHtml = buildClaimHtml(claimUrl, points)

  return `<?xml version="1.0" encoding="UTF-8"?>
<document>
 <LimeSurveyDocType>Question</LimeSurveyDocType>
 <DBVersion>640</DBVersion>
 <languages>
  <language>de</language>
 </languages>
 <questions>
  <fields>
   <fieldname>qid</fieldname>
   <fieldname>parent_qid</fieldname>
   <fieldname>sid</fieldname>
   <fieldname>gid</fieldname>
   <fieldname>type</fieldname>
   <fieldname>title</fieldname>
   <fieldname>preg</fieldname>
   <fieldname>other</fieldname>
   <fieldname>mandatory</fieldname>
   <fieldname>encrypted</fieldname>
   <fieldname>question_order</fieldname>
   <fieldname>scale_id</fieldname>
   <fieldname>same_default</fieldname>
   <fieldname>relevance</fieldname>
   <fieldname>question_theme_name</fieldname>
   <fieldname>modulename</fieldname>
   <fieldname>same_script</fieldname>
  </fields>
  <rows>
   <row>
    <qid><![CDATA[0]]></qid>
    <parent_qid><![CDATA[0]]></parent_qid>
    <sid><![CDATA[0]]></sid>
    <gid><![CDATA[0]]></gid>
    <type><![CDATA[X]]></type>
    <title><![CDATA[VPP${surveyId}]]></title>
    <other><![CDATA[N]]></other>
    <mandatory><![CDATA[N]]></mandatory>
    <encrypted><![CDATA[N]]></encrypted>
    <question_order><![CDATA[999]]></question_order>
    <scale_id><![CDATA[0]]></scale_id>
    <same_default><![CDATA[0]]></same_default>
    <relevance><![CDATA[1]]></relevance>
    <question_theme_name><![CDATA[boilerplate]]></question_theme_name>
    <same_script><![CDATA[0]]></same_script>
   </row>
  </rows>
 </questions>
 <question_l10ns>
  <fields>
   <fieldname>id</fieldname>
   <fieldname>qid</fieldname>
   <fieldname>question</fieldname>
   <fieldname>help</fieldname>
   <fieldname>script</fieldname>
   <fieldname>language</fieldname>
  </fields>
  <rows>
   <row>
    <id><![CDATA[0]]></id>
    <qid><![CDATA[0]]></qid>
    <question><![CDATA[${claimHtml}]]></question>
    <help/>
    <script/>
    <language><![CDATA[de]]></language>
   </row>
  </rows>
 </question_l10ns>
</document>
`
}
