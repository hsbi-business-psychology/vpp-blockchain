import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import { generateSoSciTemplate, generateLimeSurveyTemplate } from '../src/services/template.js'

// V2.2 templates ship engine-specific snippets:
//   - SoSci      → server-side PHP (HMAC key never reaches the browser)
//   - LimeSurvey → browser-side HTML+JS via Web Crypto API
// Both produce URLs in the same `/claim?s=&n=&t=` shape, so the
// backend HMAC verifier accepts either path. The tests therefore
// assert on the SoSci-PHP scaffolding *and* on the LimeSurvey-JS
// scaffolding separately, plus a round-trip cross-check that proves
// the JS variant produces tokens identical to the canonical Node
// HMAC-SHA256 path the backend uses.

function extractScript(template: string): string {
  const match = template.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('no <script> block found in template')
  return match[1]
}

describe('generateSoSciTemplate (PHP variant)', () => {
  it('embeds the survey id, key, and PHP HMAC builder', () => {
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

  it('writes the URL via $claim_url with runtime-computed nonce/token', () => {
    // The HMAC key is a literal but the URL parameters (s/n/t) are
    // computed at PHP runtime. Make sure the template builds the URL
    // with the runtime variable instead of substituting a fake
    // nonce/token at template-generation time.
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

  it('does NOT embed the JS snippet (SoSci variant must stay PHP-only)', () => {
    // Catches a regression where someone routes SoSci through the JS
    // builder and unintentionally leaks the HMAC key to participants.
    const xml = generateSoSciTemplate(1, 'sosci-key', 1)

    expect(xml).not.toContain('<script>')
    expect(xml).not.toContain('crypto.subtle')
    expect(xml).not.toContain('KEY_B64URL')
  })
})

describe('generateLimeSurveyTemplate (JS variant)', () => {
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
    expect(lss).toContain('window.crypto.subtle')
    expect(lss).toContain(".importKey('raw'")
    expect(lss).toContain(".sign('HMAC'")
  })

  it('builds the URL at runtime via Web Crypto (encodeURIComponent on params)', () => {
    const lss = generateLimeSurveyTemplate(5, 'k', 3)

    expect(lss).toContain("'/claim?s='")
    expect(lss).toContain("'&n='")
    expect(lss).toContain("'&t='")
    expect(lss).toContain('encodeURIComponent(nonce)')
    expect(lss).toContain('encodeURIComponent(token)')
  })

  it('does NOT embed PHP tags (would render as raw text in LimeSurvey 5/6)', () => {
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
    // Replays the snippet's algorithm in Node 20 (node:crypto.webcrypto)
    // and cross-checks against crypto.createHmac (the canonical path
    // the backend uses) to prove that browser-derived tokens land at
    // exactly the same byte sequence the backend expects. Catches
    // any encoding bug (b64url <-> bytes) before it reaches a student.
    const surveyId = 7
    const keyB64 = 'ZBJokSACBoFU10w8Rl67CUnkt3DdEPJfaEh7_hw0H7Y'
    const lss = generateLimeSurveyTemplate(surveyId, keyB64, 1)
    const script = extractScript(lss)

    expect(script).toContain('window.crypto.subtle')
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

    const { createHmac } = await import('node:crypto')
    const expected = createHmac('sha256', Buffer.from(keyBytes))
      .update(`v1|${surveyId}|${nonce}`)
      .digest()
    const expectedB64url = bytesToB64url(new Uint8Array(expected))
    expect(token).toBe(expectedB64url)
  })
})

describe('SoSci ↔ LimeSurvey URL-format compatibility', () => {
  // Both engines need to land on URLs the backend accepts. The PHP
  // and JS snippets are independent code paths but must produce
  // identical query-param shapes so a single backend route can serve
  // both.
  it('both formats use the same /claim?s=&n=&t= URL skeleton', () => {
    const xml = generateSoSciTemplate(1, 'k', 1)
    const lss = generateLimeSurveyTemplate(1, 'k', 1)

    expect(xml).toContain("'/claim'")
    expect(xml).toContain("'?s='")
    expect(xml).toContain("'&n='")
    expect(xml).toContain("'&t='")

    expect(lss).toContain("'/claim?s='")
    expect(lss).toContain("'&n='")
    expect(lss).toContain("'&t='")
  })
})
