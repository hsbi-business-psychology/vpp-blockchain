// @vitest-environment node
//
// Wallet helpers are pure crypto (ethers + WebCrypto/Node crypto) and do
// not need a DOM. We deliberately opt out of jsdom here because ethers v6
// hits a realm-mismatch bug when its internal `randomBytes()` returns a
// Node `Buffer` that fails jsdom's `instanceof Uint8Array` check.
import { describe, it, expect, beforeEach } from 'vitest'
import { ethers } from 'ethers'
import {
  BIP39_WORDLIST,
  createWallet,
  getRandomVerifyIndices,
  importFromMnemonic,
  importWallet,
  isValidAddress,
  isValidMnemonic,
  isValidPrivateKey,
  loadWallet,
  normalizeMnemonic,
  saveWallet,
  deleteWallet,
  signMessage,
} from '@/lib/wallet'

// Deterministic test key (never used on any real chain)
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

describe('wallet utilities', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('importWallet', () => {
    it('imports a wallet from a valid private key', () => {
      const wallet = importWallet(TEST_KEY)
      expect(wallet.address).toBe(TEST_ADDRESS)
      expect(wallet.privateKey).toBe(TEST_KEY)
    })

    it('handles private keys without 0x prefix', () => {
      const wallet = importWallet(TEST_KEY.slice(2))
      expect(wallet.address).toBe(TEST_ADDRESS)
    })

    it('throws for invalid private keys', () => {
      expect(() => importWallet('invalid')).toThrow()
    })
  })

  describe('isValidPrivateKey', () => {
    it('returns true for a valid key', () => {
      expect(isValidPrivateKey(TEST_KEY)).toBe(true)
    })

    it('returns false for invalid keys', () => {
      expect(isValidPrivateKey('not-a-key')).toBe(false)
      expect(isValidPrivateKey('')).toBe(false)
      expect(isValidPrivateKey('0x123')).toBe(false)
    })
  })

  describe('isValidAddress', () => {
    it('returns true for a valid address', () => {
      expect(isValidAddress(TEST_ADDRESS)).toBe(true)
    })

    it('returns false for invalid addresses', () => {
      expect(isValidAddress('not-an-address')).toBe(false)
      expect(isValidAddress('')).toBe(false)
      expect(isValidAddress('0x123')).toBe(false)
    })
  })

  describe('localStorage persistence', () => {
    it('saves and loads a wallet', () => {
      const wallet = { address: TEST_ADDRESS, privateKey: TEST_KEY, type: 'local' as const }
      saveWallet(wallet)
      const loaded = loadWallet()
      expect(loaded).toEqual(wallet)
    })

    it('migrates old wallets without type to local', () => {
      localStorage.setItem(
        'vpp-wallet',
        JSON.stringify({ address: TEST_ADDRESS, privateKey: TEST_KEY }),
      )
      const loaded = loadWallet()
      expect(loaded).toEqual({ address: TEST_ADDRESS, privateKey: TEST_KEY, type: 'local' })
    })

    it('returns null when no wallet is stored', () => {
      expect(loadWallet()).toBeNull()
    })

    it('deletes a stored wallet', () => {
      saveWallet({ address: TEST_ADDRESS, privateKey: TEST_KEY, type: 'local' })
      deleteWallet()
      expect(loadWallet()).toBeNull()
    })

    it('loads a metamask wallet (no privateKey)', () => {
      const wallet = { address: TEST_ADDRESS, privateKey: '', type: 'metamask' as const }
      saveWallet(wallet)
      const loaded = loadWallet()
      expect(loaded).toEqual(wallet)
    })

    it('handles corrupted localStorage data', () => {
      localStorage.setItem('vpp-wallet', 'not-json')
      expect(loadWallet()).toBeNull()
    })

    it('round-trips a mnemonic-bearing wallet', () => {
      const wallet = createWallet()
      saveWallet(wallet)
      const loaded = loadWallet()
      expect(loaded).toEqual(wallet)
      expect(loaded?.mnemonic).toBe(wallet.mnemonic)
    })

    it('keeps backward-compatibility for wallets without mnemonic', () => {
      const legacy = { address: TEST_ADDRESS, privateKey: TEST_KEY, type: 'local' as const }
      saveWallet(legacy)
      const loaded = loadWallet()
      expect(loaded?.mnemonic).toBeUndefined()
    })
  })

  describe('createWallet', () => {
    it('returns a fresh wallet with mnemonic phrase', () => {
      const wallet = createWallet()
      expect(wallet.type).toBe('local')
      expect(ethers.isAddress(wallet.address)).toBe(true)
      expect(wallet.privateKey).toMatch(/^0x[0-9a-f]{64}$/)
      expect(wallet.mnemonic).toBeDefined()
      expect(wallet.mnemonic!.split(' ')).toHaveLength(12)
    })

    it('mnemonic re-derives the same address (BIP-44 m/44H/60H/0H/0/0)', () => {
      const wallet = createWallet()
      const restored = ethers.Wallet.fromPhrase(wallet.mnemonic!)
      expect(restored.address).toBe(wallet.address)
      expect(restored.privateKey).toBe(wallet.privateKey)
    })

    it('produces unique mnemonics across calls', () => {
      const a = createWallet()
      const b = createWallet()
      expect(a.mnemonic).not.toBe(b.mnemonic)
    })
  })

  describe('importFromMnemonic', () => {
    it('round-trips through createWallet → importFromMnemonic', () => {
      const created = createWallet()
      const restored = importFromMnemonic(created.mnemonic!)
      expect(restored.address).toBe(created.address)
      expect(restored.privateKey).toBe(created.privateKey)
      expect(restored.mnemonic).toBe(created.mnemonic)
      expect(restored.type).toBe('local')
    })

    it('produces the canonical MetaMask test-vector address', () => {
      // BIP-39 test vector reused by MetaMask, Trust, Rabby, Coinbase Wallet.
      // m/44'/60'/0'/0/0 of "test test test ... junk" must always derive
      // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266.
      const phrase = 'test test test test test test test test test test test junk'
      const wallet = importFromMnemonic(phrase)
      expect(wallet.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    })

    it('normalizes whitespace and case', () => {
      const phrase = 'test test test test test test test test test test test junk'
      const messy = `  TEST  test  test\ttest test test test test test test test JUNK  `
      const a = importFromMnemonic(phrase)
      const b = importFromMnemonic(messy)
      expect(a.address).toBe(b.address)
    })

    it('rejects mnemonics with bad checksum', () => {
      // Valid words but invalid checksum (last word swapped).
      expect(() =>
        importFromMnemonic('test test test test test test test test test test test test'),
      ).toThrow()
    })

    it('rejects mnemonics with unknown words', () => {
      expect(() =>
        importFromMnemonic('not real bip39 words here at all please fail loudly now'),
      ).toThrow()
    })
  })

  describe('isValidMnemonic', () => {
    it('accepts a freshly generated 12-word phrase', () => {
      const wallet = createWallet()
      expect(isValidMnemonic(wallet.mnemonic!)).toBe(true)
    })

    it('rejects checksum failures', () => {
      expect(isValidMnemonic('test test test test test test test test test test test test')).toBe(
        false,
      )
    })

    it('rejects wrong word count (11)', () => {
      expect(isValidMnemonic('test test test test test test test test test test test')).toBe(false)
    })

    it('rejects wrong word count (24)', () => {
      // A valid 24-word phrase is rejected — we only support 12-word entropy.
      const phrase24 = ethers.Mnemonic.fromEntropy(ethers.randomBytes(32)).phrase
      expect(phrase24.split(' ')).toHaveLength(24)
      expect(isValidMnemonic(phrase24)).toBe(false)
    })

    it('rejects empty / non-string inputs', () => {
      expect(isValidMnemonic('')).toBe(false)
      expect(isValidMnemonic('   ')).toBe(false)
    })

    it('rejects unknown words', () => {
      expect(
        isValidMnemonic('foo bar baz qux quux quuux corge grault garply waldo fred plugh'),
      ).toBe(false)
    })
  })

  describe('normalizeMnemonic', () => {
    it('collapses whitespace, trims, and lowercases', () => {
      expect(normalizeMnemonic('  Hello   World\tFoo\n')).toBe('hello world foo')
    })
  })

  describe('getRandomVerifyIndices', () => {
    it('returns 3 distinct indices in 0..11 by default', () => {
      const out = getRandomVerifyIndices()
      expect(out).toHaveLength(3)
      expect(new Set(out).size).toBe(3)
      out.forEach((i) => {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThanOrEqual(11)
      })
    })

    it('returns ascending order', () => {
      const out = getRandomVerifyIndices()
      const sorted = [...out].sort((a, b) => a - b)
      expect(out).toEqual(sorted)
    })

    it('honors custom counts', () => {
      const out = getRandomVerifyIndices(5)
      expect(out).toHaveLength(5)
      expect(new Set(out).size).toBe(5)
    })

    it('rejects out-of-range counts', () => {
      expect(() => getRandomVerifyIndices(0)).toThrow()
      expect(() => getRandomVerifyIndices(13)).toThrow()
    })
  })

  describe('BIP39_WORDLIST', () => {
    it('contains exactly 2048 words', () => {
      expect(BIP39_WORDLIST).toHaveLength(2048)
    })

    it('starts with "abandon" and ends with "zoo"', () => {
      expect(BIP39_WORDLIST[0]).toBe('abandon')
      expect(BIP39_WORDLIST[2047]).toBe('zoo')
    })

    it('contains every word of a freshly generated phrase', () => {
      const wallet = createWallet()
      wallet.mnemonic!.split(' ').forEach((word) => {
        expect(BIP39_WORDLIST).toContain(word)
      })
    })
  })

  describe('signMessage', () => {
    it('produces a valid signature', async () => {
      const signature = await signMessage(TEST_KEY, 'test message')
      expect(signature).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(signature.length).toBe(132)
    })

    it('produces consistent signatures for the same message', async () => {
      const sig1 = await signMessage(TEST_KEY, 'same message')
      const sig2 = await signMessage(TEST_KEY, 'same message')
      expect(sig1).toBe(sig2)
    })

    it('produces different signatures for different messages', async () => {
      const sig1 = await signMessage(TEST_KEY, 'message 1')
      const sig2 = await signMessage(TEST_KEY, 'message 2')
      expect(sig1).not.toBe(sig2)
    })
  })
})
