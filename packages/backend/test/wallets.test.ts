import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'

const app = createApp()

const ADMIN_WALLET = new ethers.Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

const TARGET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

function adminHeaders(signature: string, message: string) {
  return { 'x-admin-signature': signature, 'x-admin-message': message }
}

async function signAdminMessage(text: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `${text} ${timestamp}`
  const signature = await ADMIN_WALLET.signMessage(message)
  return { signature, message }
}

describe('GET /api/v1/wallets/:address/submitted', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return submitted status and total points', async () => {
    vi.mocked(blockchain.isWalletSubmitted).mockResolvedValue(true)
    vi.mocked(blockchain.getTotalPoints).mockResolvedValue(42)

    const res = await request(app).get(`/api/v1/wallets/${TARGET_ADDRESS}/submitted`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.submitted).toBe(true)
    expect(res.body.data.totalPoints).toBe(42)
    expect(res.body.data.address).toBe(ethers.getAddress(TARGET_ADDRESS))
  })

  it('should return submitted=false for a non-submitted wallet', async () => {
    vi.mocked(blockchain.isWalletSubmitted).mockResolvedValue(false)
    vi.mocked(blockchain.getTotalPoints).mockResolvedValue(0)

    const res = await request(app).get(`/api/v1/wallets/${TARGET_ADDRESS}/submitted`)

    expect(res.status).toBe(200)
    expect(res.body.data.submitted).toBe(false)
    expect(res.body.data.totalPoints).toBe(0)
  })

  it('should reject an invalid address with 400', async () => {
    const res = await request(app).get('/api/v1/wallets/not-a-valid-address/submitted')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_ADDRESS')
  })
})

describe('POST /api/v1/wallets/:address/mark-submitted', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should mark a wallet as submitted', async () => {
    const { signature, message } = await signAdminMessage('Mark submitted')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.isWalletSubmitted).mockResolvedValue(false)
    vi.mocked(blockchain.markWalletSubmitted).mockResolvedValue({
      hash: '0xmarktxhash',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post(`/api/v1/wallets/${TARGET_ADDRESS}/mark-submitted`)
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xmarktxhash')
    expect(res.body.data.explorerUrl).toContain('0xmarktxhash')
    expect(res.body.data.address).toBe(ethers.getAddress(TARGET_ADDRESS))
    expect(blockchain.markWalletSubmitted).toHaveBeenCalledWith(ethers.getAddress(TARGET_ADDRESS))
  })

  it('should reject if wallet is already submitted', async () => {
    const { signature, message } = await signAdminMessage('Mark submitted')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.isWalletSubmitted).mockResolvedValue(true)

    const res = await request(app)
      .post(`/api/v1/wallets/${TARGET_ADDRESS}/mark-submitted`)
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_SUBMITTED')
  })

  it('should reject without admin signature', async () => {
    const res = await request(app).post(`/api/v1/wallets/${TARGET_ADDRESS}/mark-submitted`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('should reject from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Mark submitted ${timestamp}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app)
      .post(`/api/v1/wallets/${TARGET_ADDRESS}/mark-submitted`)
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('should reject an invalid address with 400', async () => {
    const { signature, message } = await signAdminMessage('Mark submitted')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app)
      .post('/api/v1/wallets/0xinvalid/mark-submitted')
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_ADDRESS')
  })
})

describe('POST /api/v1/wallets/:address/unmark-submitted', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should unmark a submitted wallet', async () => {
    const { signature, message } = await signAdminMessage('Unmark submitted')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.isWalletSubmitted).mockResolvedValue(true)
    vi.mocked(blockchain.unmarkWalletSubmitted).mockResolvedValue({
      hash: '0xunmarktxhash',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app)
      .post(`/api/v1/wallets/${TARGET_ADDRESS}/unmark-submitted`)
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xunmarktxhash')
    expect(res.body.data.explorerUrl).toContain('0xunmarktxhash')
    expect(blockchain.unmarkWalletSubmitted).toHaveBeenCalledWith(ethers.getAddress(TARGET_ADDRESS))
  })

  it('should reject if wallet is not submitted', async () => {
    const { signature, message } = await signAdminMessage('Unmark submitted')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.isWalletSubmitted).mockResolvedValue(false)

    const res = await request(app)
      .post(`/api/v1/wallets/${TARGET_ADDRESS}/unmark-submitted`)
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('NOT_SUBMITTED')
  })

  it('should reject without admin signature', async () => {
    const res = await request(app).post(`/api/v1/wallets/${TARGET_ADDRESS}/unmark-submitted`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('should reject an invalid address with 400', async () => {
    const { signature, message } = await signAdminMessage('Unmark submitted')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app)
      .post('/api/v1/wallets/bad-address/unmark-submitted')
      .set(adminHeaders(signature, message))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVALID_ADDRESS')
  })
})
