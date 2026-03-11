import { config } from '../config.js'

/**
 * Generates a SoSci Survey XML questionnaire fragment.
 *
 * The file is designed to be imported into SoSci Survey as a questionnaire
 * element on the final page. It contains:
 *   - A "thank you" text with a claim button
 *   - An automatic redirect (meta-refresh) to the VPP claim URL
 *   - The full claim URL for manual use
 */
export function generateSoSciTemplate(
  surveyId: number,
  secret: string,
  points: number,
): string {
  const claimUrl = `${config.frontendUrl}/claim?surveyId=${surveyId}&secret=${encodeURIComponent(secret)}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ╔══════════════════════════════════════════════════════════════╗
  ║  VPP Blockchain – SoSci Survey Template                    ║
  ╠══════════════════════════════════════════════════════════════╣
  ║  Umfrage-ID:  ${String(surveyId).padEnd(45)}║
  ║  Punkte:      ${String(points).padEnd(45)}║
  ╠══════════════════════════════════════════════════════════════╣
  ║  ANLEITUNG                                                 ║
  ║                                                            ║
  ║  1. Öffne SoSci Survey und gehe zu deiner Umfrage.         ║
  ║  2. Erstelle auf der letzten Seite ein HTML-Element.       ║
  ║  3. Kopiere den HTML-Code aus dem <htmlSnippet>-Block      ║
  ║     in das HTML-Element.                                   ║
  ║  4. Alternativ: Setze die Redirect-URL in den              ║
  ║     Umfrage-Einstellungen unter "Endseite".                ║
  ║                                                            ║
  ║  WICHTIG: Das Secret ist vertraulich. Jeder mit dem        ║
  ║  Secret kann Punkte für diese Umfrage einlösen.            ║
  ╚══════════════════════════════════════════════════════════════╝
-->
<vppSurveyTemplate version="1.0">
  <meta>
    <surveyId>${surveyId}</surveyId>
    <points>${points}</points>
    <claimUrl><![CDATA[${claimUrl}]]></claimUrl>
    <generated>${new Date().toISOString()}</generated>
  </meta>

  <!--
    Redirect-URL für die SoSci-Survey-Einstellung "Endseite → Weiterleitung":
    ${claimUrl}
  -->
  <redirectUrl><![CDATA[${claimUrl}]]></redirectUrl>

  <!--
    HTML-Snippet für die letzte Umfrageseite.
    Kopiere alles zwischen den CDATA-Klammern in ein SoSci-HTML-Element.
  -->
  <htmlSnippet><![CDATA[
<div style="text-align:center; padding:2rem; font-family:system-ui,sans-serif;">
  <h2>Vielen Dank für deine Teilnahme!</h2>
  <p style="margin:1rem 0;">
    Klicke auf den Button, um deine <strong>${points} Versuchspersonenpunkt${points > 1 ? 'e' : ''}</strong> einzulösen.
  </p>
  <a href="${claimUrl}"
     style="display:inline-block; padding:0.75rem 2rem; background:#2563eb; color:#fff;
            text-decoration:none; border-radius:0.5rem; font-weight:600; font-size:1rem;">
    Punkte jetzt einlösen
  </a>
  <p style="margin-top:1.5rem; font-size:0.85rem; color:#666;">
    Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br/>
    <code style="word-break:break-all;">${claimUrl}</code>
  </p>
  <meta http-equiv="refresh" content="10;url=${claimUrl}" />
</div>
  ]]></htmlSnippet>
</vppSurveyTemplate>
`
}
