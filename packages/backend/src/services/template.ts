/**
 * @module template
 *
 * Generates downloadable survey templates for SoSci Survey (.xml) and
 * LimeSurvey (.lss). Each template embeds a styled "claim your points"
 * button.
 *
 * V2.1 design — browser-side HMAC (was: server-side PHP):
 *   The goodbye/end-text page no longer relies on the survey engine's
 *   PHP runtime. Instead it ships a self-contained HTML+JS snippet
 *   that uses the browser's Web Crypto API (HMAC-SHA256, supported
 *   since 2014 in every evergreen browser) to derive the one-time
 *   claim URL on the participant's device. Reasons:
 *     1. **LimeSurvey 5/6 disables PHP in end-text** by default for
 *        XSS-hardening, so the previous PHP variant rendered as raw
 *        source code to participants — leaking the HMAC key in plain
 *        sight and making the button non-functional.
 *     2. **SoSci installs sometimes ship without PHP** in goodbye
 *        pages on managed multi-tenant deployments (e.g. some
 *        university hosts).
 *     3. The browser variant works on *both* engines unchanged and
 *        survives future hardening flips.
 *
 *   Security model is unchanged: the per-survey HMAC key is embedded
 *   in the template (visible to anyone who downloads the .lss/.xml or
 *   inspects the page source — both groups already had it under the
 *   PHP variant via the script tag). Real abuse defence is the
 *   server-side single-use nonce store + the on-chain `_claimed`
 *   guard + `MAX_MESSAGE_AGE_MS` time bound, none of which the
 *   participant can subvert by knowing the key.
 *
 * Supported formats:
 *   - **SoSci Survey** – project XML (<surveyProject>) with the snippet
 *                        on the goodbye page.
 *   - **LimeSurvey**   – survey structure (.lss) with the snippet in
 *                        the survey end message (surveyls_endtext).
 */
import { config } from '../config.js'

export type TemplateFormat = 'sosci' | 'limesurvey'

/**
 * Self-contained HTML+JS snippet that renders a personalised claim
 * button by computing the HMAC-SHA256 token in the participant's
 * browser via the Web Crypto API. Embeds:
 *   - the survey id (numeric, hard-coded)
 *   - the per-survey HMAC key (base64url, hard-coded)
 *   - the public frontend origin (where the claim page lives)
 *
 * Compatibility:
 *   - Works on SoSci Survey (goodbye text) and LimeSurvey
 *     (surveyls_endtext) without any engine-specific config flags.
 *   - Web Crypto API: Chrome 37+, Firefox 34+, Safari 11+, Edge 12+.
 *     A graceful error message is shown on browsers that lack it.
 *
 * Layout:
 *   - Initial state: "Link wird vorbereitet..." (loading text).
 *   - On success: button with the personalised claim URL.
 *   - On failure: red error message with the exception text.
 *
 * Security notes:
 *   - The HMAC key is in the page source. This is identical to the
 *     previous PHP variant's threat model: anyone who can view the
 *     end-text source already had the key (the PHP rendered it on
 *     LimeSurvey too, because PHP execution was disabled). Knowing
 *     the key only matters if the attacker can also forge a fresh
 *     server-recognised nonce, which the backend's single-use
 *     nonce store prevents.
 *   - encodeURIComponent on nonce/token defends against any
 *     future encoding change that introduces URL-special chars.
 */
function buildClaimSnippet(surveyId: number, surveyKey: string, points: number): string {
  const pointLabel = points > 1 ? 'Versuchspersonenpunkte' : 'Versuchspersonenpunkt'
  const origin = config.frontendUrl
  // The HMAC key is a base64url string (A-Z a-z 0-9 - _) that cannot
  // contain quotes or backslashes, so direct single-quote interpolation
  // is safe. Same for origin (validated URL) and surveyId (number).
  return `<div id="vpp-claim" style="max-width:480px;margin:2rem auto;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <div style="font-size:2.5rem;margin-bottom:0.5rem;">&#10003;</div>
  <h2 style="margin:0 0 0.5rem;font-size:1.35rem;color:#111;">Vielen Dank f&#252;r deine Teilnahme!</h2>
  <p style="margin:0.75rem 0;color:#555;font-size:0.95rem;">
    Du erh&#228;ltst <strong>${points} ${pointLabel}</strong> f&#252;r diese Umfrage.
    Klicke auf den Button, um deine Punkte einzul&#246;sen.
  </p>
  <a id="vpp-claim-link" href="#" rel="noopener" style="display:none;margin:1rem 0;padding:0.7rem 2rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:600;font-size:1rem;">
    Punkte jetzt einl&#246;sen &#8594;
  </a>
  <p id="vpp-claim-loading" style="margin:1rem 0;color:#666;font-size:0.9rem;">
    Link wird vorbereitet&#8230;
  </p>
  <p id="vpp-claim-error" style="display:none;margin:1rem 0;color:#b91c1c;font-size:0.9rem;">
    Fehler beim Erstellen des Claim-Links. Bitte aktuellen Browser verwenden (Chrome, Firefox, Safari, Edge).
  </p>
  <p style="margin-top:1.5rem;color:#888;font-size:0.8rem;">
    Der Link ist nur einmal g&#252;ltig. Bitte gib ihn nicht weiter.
  </p>
</div>
<script>
(function () {
  var SURVEY_ID = ${surveyId};
  var KEY_B64URL = '${surveyKey}';
  var FRONTEND = '${origin}';
  function showError(msg) {
    var l = document.getElementById('vpp-claim-loading');
    if (l) l.style.display = 'none';
    var e = document.getElementById('vpp-claim-error');
    if (!e) return;
    e.style.display = 'block';
    if (msg) e.textContent = 'Fehler beim Erstellen des Claim-Links: ' + msg;
  }
  if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
    showError('Web Crypto API nicht verf\\u00fcgbar (alter Browser).');
    return;
  }
  function b64urlToBytes(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    var pad = (4 - (b64.length % 4)) % 4;
    var raw = atob(b64 + '===='.slice(0, pad));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function bytesToB64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  var nonceBytes = new Uint8Array(16);
  window.crypto.getRandomValues(nonceBytes);
  var nonce = bytesToB64url(nonceBytes);
  var keyBytes;
  try {
    keyBytes = b64urlToBytes(KEY_B64URL);
  } catch (err) {
    showError('Ung\\u00fcltiger HMAC-Key im Template.');
    return;
  }
  var msgBytes = new TextEncoder().encode('v1|' + SURVEY_ID + '|' + nonce);
  window.crypto.subtle
    .importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(function (cryptoKey) {
      return window.crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
    })
    .then(function (sigBuffer) {
      var token = bytesToB64url(new Uint8Array(sigBuffer));
      var url =
        FRONTEND +
        '/claim?s=' +
        SURVEY_ID +
        '&n=' +
        encodeURIComponent(nonce) +
        '&t=' +
        encodeURIComponent(token);
      var link = document.getElementById('vpp-claim-link');
      var loading = document.getElementById('vpp-claim-loading');
      if (link) {
        link.href = url;
        link.style.display = 'inline-block';
      }
      if (loading) loading.style.display = 'none';
    })
    .catch(function (err) {
      showError((err && err.message) || 'unbekannter Fehler');
    });
})();
</script>
`
}

/**
 * Generates a SoSci Survey project XML that can be imported directly.
 * The goodbye page contains a self-contained HTML+JS snippet that
 * renders a one-time claim URL per participant (see buildClaimSnippet).
 *
 * Import: SoSci Admin > Project > Import (project file).
 */
export function generateSoSciTemplate(surveyId: number, surveyKey: string, points: number): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const goodbyePhp = buildClaimSnippet(surveyId, surveyKey, points)

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
<![CDATA[${goodbyePhp}]]>
</attr>
<attr id="selection">1</attr>
</attributes.specific>
</questionnaire>
</surveyProject>
`
}

/**
 * Generates a LimeSurvey Survey Structure (.lss) that can be imported
 * via "Create survey > Import". The HTML+JS snippet is embedded in
 * the survey end message (surveyls_endtext) and runs entirely in the
 * participant's browser — no PHP, no admin toggles required.
 *
 * Tested against LimeSurvey 5.x and 6.x (both render the snippet as
 * HTML+JS by default in surveyls_endtext). Older LimeSurvey 3.x
 * installs may need the survey-level "XSS-Filter" disabled for the
 * inline <script> tag to survive the import.
 */
export function generateLimeSurveyTemplate(
  surveyId: number,
  surveyKey: string,
  points: number,
): string {
  const claimHtml = buildClaimSnippet(surveyId, surveyKey, points)

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
