import { describe, it, expect } from 'vitest'
import { generateSoSciTemplate, generateLimeSurveyTemplate } from '../src/services/template.js'

// V2.3 templates ship a single engine-agnostic snippet that boils down
// to a plain `<a href>` link pointing at the backend launcher route
//   GET /api/v1/claim/launch/:surveyId
// The launcher generates nonce + HMAC server-side and 302-redirects to
// /claim?s=&n=&t=. This removes the per-engine PHP/JS split (which
// the LimeSurvey HTMLPurifier broke by stripping <script>) and keeps
// the HMAC key strictly server-side for both engines.

const ORIGIN = 'http://localhost:5173' // matches default config.frontendUrl in tests

describe('generateSoSciTemplate', () => {
  it('embeds the survey id and the launcher link on the goodbye page', () => {
    const xml = generateSoSciTemplate(42, 'unused-key', 2)

    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('surveyProject')
    expect(xml).toContain('VPP Survey 42')
    expect(xml).toContain(`href="${ORIGIN}/api/v1/claim/launch/42"`)
    expect(xml).toContain('Versuchspersonenpunkte')
    expect(xml).toContain('Punkte jetzt einl')
  })

  it('uses singular label for 1 point', () => {
    const xml = generateSoSciTemplate(1, 'k', 1)

    expect(xml).toContain('Versuchspersonenpunkt</strong>')
    expect(xml).not.toContain('Versuchspersonenpunkte')
  })

  it('includes the goodbye section', () => {
    const xml = generateSoSciTemplate(10, 'k', 1)

    expect(xml).toContain('<attr id="goodbye">')
    expect(xml).toContain('Vielen Dank')
  })

  it('does NOT embed PHP, scripts, or the HMAC key (V2.3 invariants)', () => {
    // The launcher route handles HMAC server-side. The template must
    // never inline PHP, JS, or the per-survey key — those are V2.2
    // anti-patterns we deliberately removed.
    const xml = generateSoSciTemplate(1, 'super-secret-key', 1)

    expect(xml).not.toContain('<?php')
    expect(xml).not.toContain('hash_hmac')
    expect(xml).not.toContain('<script>')
    expect(xml).not.toContain('crypto.subtle')
    expect(xml).not.toContain('KEY_B64URL')
    expect(xml).not.toContain('VPP_KEY_B64')
    expect(xml).not.toContain('super-secret-key')
  })

  it('does not contain the CDATA terminator inside the goodbye fragment', () => {
    // The goodbye snippet is wrapped in <![CDATA[...]]> — if the
    // snippet contained "]]>" it would prematurely close CDATA and
    // break the SoSci import.
    const xml = generateSoSciTemplate(99, 'k', 1)
    const goodbyeOpen = '<attr id="goodbye">\n<![CDATA['
    const goodbyeStart = xml.indexOf(goodbyeOpen)
    expect(goodbyeStart).toBeGreaterThan(-1)
    // Search for the CDATA close marker AFTER goodbyeStart — the
    // template also has a content CDATA block earlier in the file
    // that would match a global indexOf.
    const goodbyeEnd = xml.indexOf(']]>\n</attr>', goodbyeStart)
    expect(goodbyeEnd).toBeGreaterThan(goodbyeStart)
    const inner = xml.slice(goodbyeStart + goodbyeOpen.length, goodbyeEnd)
    expect(inner.includes(']]>')).toBe(false)
  })
})

describe('generateLimeSurveyTemplate', () => {
  it('emits valid LimeSurvey survey-structure XML', () => {
    const lss = generateLimeSurveyTemplate(7, 'k', 1)

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

  it('embeds the launcher link inside the survey end text', () => {
    const lss = generateLimeSurveyTemplate(42, 'unused-key', 3)

    expect(lss).toContain('surveyls_endtext')
    expect(lss).toContain(`href="${ORIGIN}/api/v1/claim/launch/42"`)
  })

  it('does NOT embed PHP, scripts, or the HMAC key (V2.3 invariants)', () => {
    // LimeSurvey 5/6 strips <script> via HTMLPurifier, which is why
    // the V2.2 JS variant did not work. The launcher link sidesteps
    // that. Equally important: the per-survey HMAC key must never
    // reach the browser, even via inline JS.
    const lss = generateLimeSurveyTemplate(1, 'super-secret-key', 1)

    expect(lss).not.toContain('<?php')
    expect(lss).not.toContain('hash_hmac')
    expect(lss).not.toContain('<script>')
    expect(lss).not.toContain('crypto.subtle')
    expect(lss).not.toContain('KEY_B64URL')
    expect(lss).not.toContain('super-secret-key')
  })

  it('does not contain the CDATA terminator inside the snippet', () => {
    const lss = generateLimeSurveyTemplate(99, 'k', 1)
    const endtextStart = lss.indexOf('<surveyls_endtext><![CDATA[')
    const endtextEnd = lss.indexOf(']]></surveyls_endtext>')
    expect(endtextStart).toBeGreaterThan(-1)
    expect(endtextEnd).toBeGreaterThan(endtextStart)
    const inner = lss.slice(endtextStart + '<surveyls_endtext><![CDATA['.length, endtextEnd)
    expect(inner.includes(']]>')).toBe(false)
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

describe('SoSci ↔ LimeSurvey template parity', () => {
  // Both engines now ship the exact same snippet — proving that
  // single source of truth is enforced.
  it('renders the identical launcher URL in both formats', () => {
    const xml = generateSoSciTemplate(123, 'k', 1)
    const lss = generateLimeSurveyTemplate(123, 'k', 1)

    const expectedHref = `href="${ORIGIN}/api/v1/claim/launch/123"`
    expect(xml).toContain(expectedHref)
    expect(lss).toContain(expectedHref)
  })

  it('renders the identical visible button copy in both formats', () => {
    const xml = generateSoSciTemplate(1, 'k', 5)
    const lss = generateLimeSurveyTemplate(1, 'k', 5)

    for (const fragment of ['Vielen Dank', 'Punkte jetzt einl', '5 Versuchspersonenpunkte']) {
      expect(xml).toContain(fragment)
      expect(lss).toContain(fragment)
    }
  })
})
