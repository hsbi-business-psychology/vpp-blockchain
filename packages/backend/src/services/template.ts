/**
 * @module template
 *
 * Generates downloadable survey templates for SoSci Survey (.xml) and
 * LimeSurvey (.lss). Each template embeds a styled "claim your points"
 * button that links back to the VPP frontend.
 *
 * Supported formats:
 *   - **SoSci Survey** – project XML with the claim button on the goodbye page.
 *   - **LimeSurvey**   – survey structure (.lss) with the claim button as the
 *                        survey's end message. Imported via "Create survey > Import".
 */
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
 * Generates a LimeSurvey Survey Structure (.lss) that can be imported via
 * "Create survey > Import". The claim button HTML is embedded in the
 * survey's end message (surveyls_endtext). The survey contains one empty
 * question group where the admin adds their actual questions.
 *
 * Import: LimeSurvey > Create survey > Import > choose .lss file
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
 <LimeSurveyDocType>Survey</LimeSurveyDocType>
 <DBVersion>640</DBVersion>
 <languages>
  <language>de</language>
 </languages>
 <groups>
  <fields>
   <fieldname>gid</fieldname>
   <fieldname>sid</fieldname>
   <fieldname>group_order</fieldname>
   <fieldname>randomization_group</fieldname>
   <fieldname>grelevance</fieldname>
  </fields>
  <rows>
   <row>
    <gid><![CDATA[1]]></gid>
    <sid><![CDATA[0]]></sid>
    <group_order><![CDATA[1]]></group_order>
    <randomization_group/>
    <grelevance><![CDATA[1]]></grelevance>
   </row>
  </rows>
 </groups>
 <group_l10ns>
  <fields>
   <fieldname>id</fieldname>
   <fieldname>gid</fieldname>
   <fieldname>group_name</fieldname>
   <fieldname>description</fieldname>
   <fieldname>language</fieldname>
  </fields>
  <rows>
   <row>
    <id><![CDATA[1]]></id>
    <gid><![CDATA[1]]></gid>
    <group_name><![CDATA[Umfrage]]></group_name>
    <description><![CDATA[F\u00fcge hier deine Fragen hinzu.]]></description>
    <language><![CDATA[de]]></language>
   </row>
  </rows>
 </group_l10ns>
 <surveys>
  <fields>
   <fieldname>sid</fieldname>
   <fieldname>gsid</fieldname>
   <fieldname>admin</fieldname>
   <fieldname>active</fieldname>
   <fieldname>anonymized</fieldname>
   <fieldname>format</fieldname>
   <fieldname>language</fieldname>
   <fieldname>datestamp</fieldname>
   <fieldname>usecookie</fieldname>
   <fieldname>showwelcome</fieldname>
   <fieldname>autoredirect</fieldname>
  </fields>
  <rows>
   <row>
    <sid><![CDATA[0]]></sid>
    <gsid><![CDATA[1]]></gsid>
    <admin><![CDATA[Admin]]></admin>
    <active><![CDATA[N]]></active>
    <anonymized><![CDATA[Y]]></anonymized>
    <format><![CDATA[G]]></format>
    <language><![CDATA[de]]></language>
    <datestamp><![CDATA[N]]></datestamp>
    <usecookie><![CDATA[N]]></usecookie>
    <showwelcome><![CDATA[Y]]></showwelcome>
    <autoredirect><![CDATA[N]]></autoredirect>
   </row>
  </rows>
 </surveys>
 <surveys_languagesettings>
  <fields>
   <fieldname>surveyls_survey_id</fieldname>
   <fieldname>surveyls_language</fieldname>
   <fieldname>surveyls_title</fieldname>
   <fieldname>surveyls_description</fieldname>
   <fieldname>surveyls_welcometext</fieldname>
   <fieldname>surveyls_endtext</fieldname>
   <fieldname>surveyls_dateformat</fieldname>
   <fieldname>surveyls_numberformat</fieldname>
  </fields>
  <rows>
   <row>
    <surveyls_survey_id><![CDATA[0]]></surveyls_survey_id>
    <surveyls_language><![CDATA[de]]></surveyls_language>
    <surveyls_title><![CDATA[VPP Umfrage ${surveyId}]]></surveyls_title>
    <surveyls_description/>
    <surveyls_welcometext><![CDATA[Willkommen zur Umfrage. Deine Antworten werden anonym erfasst.]]></surveyls_welcometext>
    <surveyls_endtext><![CDATA[${claimHtml}]]></surveyls_endtext>
    <surveyls_dateformat><![CDATA[1]]></surveyls_dateformat>
    <surveyls_numberformat><![CDATA[0]]></surveyls_numberformat>
   </row>
  </rows>
 </surveys_languagesettings>
</document>
`
}
