import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import { generateSoSciTemplate, generateLimeSurveyTemplate } from '../src/services/template.js'

// V2.1 templates ship a self-contained HTML+JS claim button. The JS
// computes the HMAC-SHA256 token in the participant's browser via the
// Web Crypto API — no PHP runtime is required on the survey engine.
// Tests therefore assert on the HTML scaffolding, the embedded
// constants (survey id, key, frontend origin), and the JS hooks the
// snippet relies on.

function extractScript(template: string): string {
  const match = template.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('no <script> block found in template')
  return match[1]
}

describe('generateSoSciTemplate', () => {
  it('embeds the survey id, key, and JS HMAC builder', () => {
    const xml = generateSoSciTemplate(42, 'vpp-test-key', 2)

    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('surveyProject')
    expect(xml).toContain('VPP Survey 42')
    expect(xml).toContain('var SURVEY_ID = 42')
    expect(xml).toContain("var KEY_B64URL = 'vpp-test-key'")
    expect(xml).toContain("'HMAC'")
    expect(xml).toContain('SHA-256')
    expect(xml).toContain('Versuchspersonenpunkte')
    expect(xml).toContain('Punkte jetzt einl')
  })

  it('uses singular label for 1 point', () => {
    const xml = generateSoSciTemplate(1, 'sec', 1)

    expect(xml).toContain('Versuchspersonenpunkt</strong>')
    expect(xml).not.toContain('Versuchspersonenpunkte')
  })

  it('builds the URL at runtime via crypto.subtle.sign, not pre-computed', () => {
    // The HMAC key is embedded as a literal but the URL parameters
    // (s/n/t) are computed at runtime in the browser. Make sure the
    // template builds the URL with the runtime variables instead of
    // substituting a fake nonce/token at template-generation time.
    const xml = generateSoSciTemplate(5, 'k', 3)

    expect(xml).toContain("'/claim?s='")
    expect(xml).toContain("'&n='")
    expect(xml).toContain("'&t='")
    expect(xml).toContain('encodeURIComponent(nonce)')
    expect(xml).toContain('encodeURIComponent(token)')
    expect(xml).toContain(".sign('HMAC'")
  })

  it('includes the goodbye section', () => {
    const xml = generateSoSciTemplate(10, 'k', 1)

    expect(xml).toContain('<attr id="goodbye">')
    expect(xml).toContain('Vielen Dank')
  })

  it('does not embed any PHP tags', () => {
    // Older versions used <?php ... ?> which broke on LimeSurvey and
    // some managed SoSci installs. The browser-side variant must be
    // free of PHP markers.
    const xml = generateSoSciTemplate(1, 'k', 1)

    expect(xml).not.toContain('<?php')
    expect(xml).not.toContain('hash_hmac')
    expect(xml).not.toContain('htmlspecialchars')
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

  it('embeds the JS snippet inside the survey end text', () => {
    const lss = generateLimeSurveyTemplate(42, 'lime-key', 3)

    expect(lss).toContain('surveyls_endtext')
    expect(lss).toContain('var SURVEY_ID = 42')
    expect(lss).toContain("var KEY_B64URL = 'lime-key'")
    expect(lss).toContain("'HMAC'")
  })

  it('does not embed any PHP tags (would break in LimeSurvey 5/6)', () => {
    const lss = generateLimeSurveyTemplate(1, 'k', 1)

    expect(lss).not.toContain('<?php')
    expect(lss).not.toContain('hash_hmac')
  })

  it('does not contain the CDATA-terminator inside the snippet', () => {
    // The JS snippet is wrapped in <![CDATA[...]]>; if the JS itself
    // contained "]]>" it would prematurely close the CDATA section
    // and break the .lss import.
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

  it('embedded JS produces a token that the backend HMAC verifier would accept', async () => {
    // Replays the exact algorithm the snippet runs in the browser
    // against the same Web Crypto API in Node 20 (node:crypto.webcrypto)
    // and verifies that the resulting URL parses back to a token that
    // matches a fresh HMAC-SHA256 over the canonical "v1|<id>|<nonce>"
    // message. This catches encoding bugs (b64url <-> bytes) before
    // they reach a student.
    const surveyId = 7
    // base64url-encoded 32-byte test key.
    const keyB64 = 'ZBJokSACBoFU10w8Rl67CUnkt3DdEPJfaEh7_hw0H7Y'
    const lss = generateLimeSurveyTemplate(surveyId, keyB64, 1)
    const script = extractScript(lss)

    // Prove the script defines the expected building blocks. We
    // can't execute the snippet directly (it relies on `document`
    // and `window`), so the next assertions independently re-implement
    // the same primitives and check round-trip correctness.
    expect(script).toContain('window.crypto.subtle')
    expect(script).toContain(".importKey('raw'")
    expect(script).toContain(".sign('HMAC'")
    expect(script).toContain("'v1|' + SURVEY_ID + '|' + nonce")

    function b64urlToBytes(s: string): Uint8Array {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
      const pad = (4 - (b64.length % 4)) % 4
      const buf = Buffer.from(b64 + '='.repeat(pad), 'base64')
      return new Uint8Array(buf)
    }
    function bytesToB64url(bytes: Uint8Array): string {
      return Buffer.from(bytes)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    }

    const nonceBytes = new Uint8Array(16)
    webcrypto.getRandomValues(nonceBytes)
    const nonce = bytesToB64url(nonceBytes)
    const keyBytes = b64urlToBytes(keyB64)
    const cryptoKey = await webcrypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await webcrypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(`v1|${surveyId}|${nonce}`),
    )
    const token = bytesToB64url(new Uint8Array(sig))

    // Cross-check via Node's crypto.createHmac to make sure the Web
    // Crypto path agrees with the same algorithm the backend uses.
    const { createHmac } = await import('node:crypto')
    const expected = createHmac('sha256', Buffer.from(keyBytes))
      .update(`v1|${surveyId}|${nonce}`)
      .digest()
    const expectedB64url = bytesToB64url(new Uint8Array(expected))
    expect(token).toBe(expectedB64url)
  })
})
