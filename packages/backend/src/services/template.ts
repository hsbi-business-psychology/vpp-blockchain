/**
 * @module template
 *
 * Generates downloadable survey templates for SoSci Survey (.xml) and
 * LimeSurvey (.lss). Each template embeds a styled "claim your points"
 * button on the goodbye / end-text page.
 *
 * V2.3 design — engine-agnostic launcher link:
 *
 *   Both engines render a single, identical HTML snippet that boils
 *   down to a styled `<a href>` link pointing at the backend launcher
 *   route `GET /api/v1/claim/launch/:surveyId`. The launcher is what
 *   computes the per-click nonce + HMAC token server-side and 302-
 *   redirects to the wallet sign page.
 *
 *   |                       | V2.2 (PHP+JS split) | V2.3 (launcher link) |
 *   | --------------------- | ------------------- | -------------------- |
 *   | LimeSurvey 5/6 works  | NO (script stripped)| YES (`<a>` survives) |
 *   | SoSci Survey works    | yes (PHP runs)      | yes (`<a>` always)   |
 *   | Other engines         | per-engine snippet  | universal `<a>`      |
 *   | HMAC key in browser   | yes for LimeSurvey  | NEVER                |
 *   | Snippet variants      | 2 (PHP and JS)      | 1 (plain HTML link)  |
 *   | Per-engine workarounds| required            | none                 |
 *
 *   Why the change:
 *     The PHP variant for SoSci worked, but the JS variant for
 *     LimeSurvey did not — modern LimeSurvey HTMLPurifier strips
 *     `<script>` tags from `surveyls_endtext` for XSS hardening. We
 *     could have asked operators to disable the XSS filter, but that
 *     is a fragile per-engine workaround that breaks portability and
 *     drags the OSS deployment story into engine-specific quirks.
 *     A plain `<a href>` link survives every survey engine's HTML
 *     purifier with no operator configuration.
 *
 *   Security model unchanged from V2.2:
 *     - Nonce is single-use (backend nonce store, atomic check-and-set).
 *     - On-chain `_claimed[surveyId][wallet]` enforces one claim per
 *       wallet per survey regardless of nonce reuse attempts.
 *     - `MAX_MESSAGE_AGE_MS` enforces sign-window freshness.
 *     - HMAC key now stays strictly server-side in BOTH engines
 *       (improvement over V2.2 LimeSurvey-JS variant which leaked
 *       the key into page source).
 *     - Anyone reaching the survey end-page can refresh to mint
 *       additional (nonce, token) pairs, but each pair only entitles
 *       the holder to one POST /claim — same property the JS/PHP
 *       variants had.
 *
 * Supported formats:
 *   - **SoSci Survey** – project XML (<surveyProject>) with the link
 *                        snippet on the goodbye page.
 *   - **LimeSurvey**   – survey structure (.lss) with the link snippet
 *                        in the survey end message (surveyls_endtext).
 */
import { config } from '../config.js'

export type TemplateFormat = 'sosci' | 'limesurvey'

/**
 * Engine-agnostic claim link snippet. Generates the same HTML for
 * SoSci Survey and LimeSurvey — both engines render a plain
 * `<a href>` link that hits the backend launcher route, which is
 * where nonce + HMAC token generation actually happens.
 *
 * No `<script>`, no `<?php>`, no engine-specific configuration. The
 * snippet is a plain HTML fragment that survives every known survey
 * engine's HTML purifier and CSP.
 *
 * Inputs:
 *   - surveyId – numeric, used in both the URL and the visible text.
 *
 * The HMAC key is intentionally NOT embedded — the launcher route
 * looks it up server-side from the per-survey key store.
 */
function buildLinkSnippet(surveyId: number, points: number): string {
  const pointLabel = points > 1 ? 'Versuchspersonenpunkte' : 'Versuchspersonenpunkt'
  const launchUrl = `${config.frontendUrl}/api/v1/claim/launch/${surveyId}`
  return `<div style="max-width:480px;margin:2rem auto;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="font-size:2.5rem;margin-bottom:0.5rem;">&#10003;</div>
  <h2 style="margin:0 0 0.5rem;font-size:1.35rem;color:#111;">Vielen Dank f&#252;r deine Teilnahme!</h2>
  <p style="margin:0.75rem 0;color:#555;font-size:0.95rem;">
    Du erh&#228;ltst <strong>${points} ${pointLabel}</strong> f&#252;r diese Umfrage.
    Klicke auf den Button, um deine Punkte einzul&#246;sen.
  </p>
  <a href="${launchUrl}" rel="noopener" style="display:inline-block;margin:1rem 0;padding:0.7rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:600;font-size:1rem;">
    Punkte jetzt einl&#246;sen &#8594;
  </a>
  <p style="margin-top:1.5rem;color:#888;font-size:0.8rem;">
    Der Link ist nur einmal g&#252;ltig. Bitte gib ihn nicht weiter.
  </p>
</div>
`
}

/**
 * Generates a SoSci Survey project XML that can be imported directly.
 * The goodbye page contains a plain HTML link snippet that hits the
 * backend launcher route — no PHP execution required.
 *
 * Import: SoSci Admin > Project > Import (project file).
 *
 * Note: the `surveyKey` argument is retained for API compatibility
 * with the admin UI. It is no longer interpolated into the template
 * because the HMAC key now stays strictly server-side and is looked
 * up by the launcher route at click time. The argument can be passed
 * as the empty string by callers that want to avoid loading the key.
 */
export function generateSoSciTemplate(
  surveyId: number,
  _surveyKey: string,
  points: number,
): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const goodbyeHtml = buildLinkSnippet(surveyId, points)

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
 * Generates a LimeSurvey Survey Structure (.lss) that can be imported
 * via "Create survey > Import". The end message (surveyls_endtext)
 * contains a plain HTML link snippet — no `<script>`, no PHP, no
 * XSS-filter overrides required.
 *
 * Why this works where the V2.2 JS variant did not: LimeSurvey 5.x and
 * 6.x apply HTMLPurifier to `surveyls_endtext` when rendering, which
 * strips `<script>` tags as a hardcoded XSS protection. The plain
 * `<a href>` element survives the purifier on default settings,
 * including the styling attributes (HTMLPurifier has a permissive
 * default for the inline `style` attribute).
 */
export function generateLimeSurveyTemplate(
  surveyId: number,
  _surveyKey: string,
  points: number,
): string {
  const claimHtml = buildLinkSnippet(surveyId, points)

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
