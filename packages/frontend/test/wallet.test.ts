import { describe, it, expect, beforeEach } from 'vitest'
import {
  importWallet,
  isValidPrivateKey,
  isValidAddress,
  saveWallet,
  loadWallet,
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
