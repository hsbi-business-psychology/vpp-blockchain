import { describe, it, expect } from 'vitest'
import { getTxUrl, getAddressUrl } from '@/lib/config'

describe('config utilities', () => {
  describe('getTxUrl', () => {
    it('generates a valid transaction URL', () => {
      const url = getTxUrl('0xabc123')
      expect(url).toContain('/tx/0xabc123')
    })
  })

  describe('getAddressUrl', () => {
    it('generates a valid address URL', () => {
      const url = getAddressUrl('0xdef456')
      expect(url).toContain('/address/0xdef456')
    })
  })
})
