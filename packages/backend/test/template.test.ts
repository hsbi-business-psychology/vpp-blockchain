import { describe, it, expect } from 'vitest'
import { generateSoSciTemplate, generateLimeSurveyTemplate } from '../src/services/template.js'

// V2 templates embed a PHP snippet with the per-survey HMAC key. The
// PHP renders a one-time URL per participant — there is no plaintext
// secret in the URL anymore. The tests therefore look for the PHP
// scaffolding, the embedded key string, and the runtime URL builder.

describe('generateSoSciTemplate', () => {
  it('embeds the survey id, key, and PHP renderer', () => {
    const xml = generateSoSciTemplate(42, 'vpp-test-key', 2)

    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('surveyProject')
    expect(xml).toContain('VPP Survey 42')
    expect(xml).toContain('$VPP_SURVEY_ID = 42')
    expect(xml).toContain("$VPP_KEY_B64   = 'vpp-test-key'")
    expect(xml).toContain('hash_hmac')
    expect(xml).toContain('Versuchspersonenpunkte')
    expect(xml).toContain('Punkte jetzt einl')
  })

  it('uses singular label for 1 point', () => {
    const xml = generateSoSciTemplate(1, 'sec', 1)

    expect(xml).toContain('Versuchspersonenpunkt</strong>')
    expect(xml).not.toContain('Versuchspersonenpunkte')
  })

  it('writes the URL via $claim_url, not by string interpolation in the response', () => {
    // The HMAC key is embedded as a literal but the URL parameters
    // (s/n/t) are computed at PHP runtime. Make sure the template
    // builds the URL with the runtime variable instead of substituting
    // a fake nonce/token at template-generation time.
    const xml = generateSoSciTemplate(5, 'k', 3)

    expect(xml).toContain("'/claim'")
    expect(xml).toContain("'?s=' . $VPP_SURVEY_ID")
    expect(xml).toContain("'&n=' . $nonce")
    expect(xml).toContain("'&t=' . $token")
  })

  it('includes the goodbye section', () => {
    const xml = generateSoSciTemplate(10, 'k', 1)

    expect(xml).toContain('<attr id="goodbye">')
    expect(xml).toContain('Vielen Dank')
  })
})

describe('generateLimeSurveyTemplate', () => {
  it('emits valid LimeSurvey survey-structure XML', () => {
    const lss = generateLimeSurveyTemplate(7, 'ls-key', 1)

    expect(lss).toContain('<?xml version="1.0"')
    expect(lss).toContain('<LimeSurveyDocType>Survey</LimeSurveyDocType>')
    expect(lss).toContain('<DBVersion>640</DBVersion>')
  })

  it('includes a question group for adding questions', () => {
    const lss = generateLimeSurveyTemplate(1, 'k', 1)

    expect(lss).toContain('<group_name><![CDATA[Umfrage]]></group_name>')
  })

  it('keeps participants anonymous and disables auto-redirect', () => {
    const lss = generateLimeSurveyTemplate(1, 'k', 1)

    expect(lss).toContain('<anonymized><![CDATA[Y]]></anonymized>')
    expect(lss).toContain('<autoredirect><![CDATA[N]]></autoredirect>')
  })

  it('embeds the PHP snippet inside the survey end text', () => {
    const lss = generateLimeSurveyTemplate(42, 'lime-key', 3)

    expect(lss).toContain('surveyls_endtext')
    expect(lss).toContain('$VPP_SURVEY_ID = 42')
    expect(lss).toContain("$VPP_KEY_B64   = 'lime-key'")
    expect(lss).toContain('hash_hmac')
  })

  it('includes the German end-of-survey copy', () => {
    const lss = generateLimeSurveyTemplate(5, 'k', 2)

    expect(lss).toContain('Vielen Dank')
    expect(lss).toContain('Punkte jetzt einl')
    expect(lss).toContain('Versuchspersonenpunkte')
  })

  it('uses singular label for 1 point', () => {
    const lss = generateLimeSurveyTemplate(1, 'k', 1)

    expect(lss).toContain('Versuchspersonenpunkt</strong>')
    expect(lss).not.toContain('Versuchspersonenpunkte')
  })

  it('includes the survey ID in the survey title', () => {
    const lss = generateLimeSurveyTemplate(99, 'k', 1)

    expect(lss).toContain('<surveyls_title><![CDATA[VPP Umfrage 99]]></surveyls_title>')
  })

  it('sets survey language to German', () => {
    const lss = generateLimeSurveyTemplate(1, 'k', 1)

    expect(lss).toContain('<language>de</language>')
    expect(lss).toContain('<surveyls_language><![CDATA[de]]></surveyls_language>')
  })
})
