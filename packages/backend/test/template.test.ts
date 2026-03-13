import { describe, it, expect } from 'vitest'
import { generateSoSciTemplate, generateLimeSurveyTemplate } from '../src/services/template.js'

describe('generateSoSciTemplate', () => {
  it('should generate valid XML with claim URL', () => {
    const xml = generateSoSciTemplate(42, 'vpp-test-secret', 2)

    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('surveyProject')
    expect(xml).toContain('VPP Survey 42')
    expect(xml).toContain('surveyId=42')
    expect(xml).toContain('secret=vpp-test-secret')
    expect(xml).toContain('2 Versuchspersonenpunkte')
    expect(xml).toContain('Punkte jetzt einl')
  })

  it('should use singular label for 1 point', () => {
    const xml = generateSoSciTemplate(1, 'sec', 1)

    expect(xml).toContain('1 Versuchspersonenpunkt')
    expect(xml).not.toContain('Versuchspersonenpunkte')
  })

  it('should encode special characters in the secret', () => {
    const xml = generateSoSciTemplate(5, 'a secret with spaces & stuff', 3)

    expect(xml).toContain('a%20secret%20with%20spaces%20%26%20stuff')
  })

  it('should include the goodbye section', () => {
    const xml = generateSoSciTemplate(10, 'sec', 1)

    expect(xml).toContain('<attr id="goodbye">')
    expect(xml).toContain('Vielen Dank')
  })
})

describe('generateLimeSurveyTemplate', () => {
  it('should generate valid LimeSurvey survey structure XML', () => {
    const lss = generateLimeSurveyTemplate(7, 'ls-secret-123', 1)

    expect(lss).toContain('<?xml version="1.0"')
    expect(lss).toContain('<LimeSurveyDocType>Survey</LimeSurveyDocType>')
    expect(lss).toContain('<DBVersion>640</DBVersion>')
  })

  it('should include a question group for adding questions', () => {
    const lss = generateLimeSurveyTemplate(1, 'sec', 1)

    expect(lss).toContain('<group_name><![CDATA[Umfrage]]></group_name>')
  })

  it('should include survey settings with anonymization enabled', () => {
    const lss = generateLimeSurveyTemplate(1, 'sec', 1)

    expect(lss).toContain('<anonymized><![CDATA[Y]]></anonymized>')
    expect(lss).toContain('<autoredirect><![CDATA[N]]></autoredirect>')
  })

  it('should include the claim URL with survey ID and secret in end text', () => {
    const lss = generateLimeSurveyTemplate(42, 'vpp-my-secret', 3)

    expect(lss).toContain('surveyId=42')
    expect(lss).toContain('secret=vpp-my-secret')
    expect(lss).toContain('surveyls_endtext')
  })

  it('should include the claim button HTML in the survey end message', () => {
    const lss = generateLimeSurveyTemplate(5, 'sec', 2)

    expect(lss).toContain('Vielen Dank')
    expect(lss).toContain('Punkte jetzt einl')
    expect(lss).toContain('2 Versuchspersonenpunkte')
  })

  it('should use singular label for 1 point', () => {
    const lss = generateLimeSurveyTemplate(1, 'sec', 1)

    expect(lss).toContain('1 Versuchspersonenpunkt')
    expect(lss).not.toContain('Versuchspersonenpunkte')
  })

  it('should include the survey ID in the survey title', () => {
    const lss = generateLimeSurveyTemplate(99, 'sec', 1)

    expect(lss).toContain('<surveyls_title><![CDATA[VPP Umfrage 99]]></surveyls_title>')
  })

  it('should set survey language to German', () => {
    const lss = generateLimeSurveyTemplate(1, 'sec', 1)

    expect(lss).toContain('<language>de</language>')
    expect(lss).toContain('<surveyls_language><![CDATA[de]]></surveyls_language>')
  })

  it('should encode special characters in the secret', () => {
    const lss = generateLimeSurveyTemplate(1, 'a b&c', 1)

    expect(lss).toContain('a%20b%26c')
  })
})
