import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'

const app = createApp()

const ADMIN_WALLET = new ethers.Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

async function signAdminMessage(text: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `${text} ${timestamp}`
  const signature = await ADMIN_WALLET.signMessage(message)
  return { signature, message }
}

function adminHeaders(signature: string, message: string) {
  return { 'x-admin-signature': signature, 'x-admin-message': message }
}

describe('GET /api/v1/status', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return system status with sufficient balance', async () => {
    const { signature, message } = await signAdminMessage('System status')
    const gasPrice = 1_000_000n
    // 200 claims above the floor below which the backend stops sending
    const balance = blockchain.MIN_BALANCE_WEI + gasPrice * 100_000n * 200n

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getMinterBalance).mockResolvedValue(balance)
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(12345)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(blockchain.provider.getFeeData).mockResolvedValue({
      gasPrice,
    } as ethers.FeeData)

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const { data } = res.body
    expect(data.minterAddress).toBe(blockchain.getMinterAddress())
    expect(data.balance).toBeDefined()
    expect(data.lowBalance).toBe(false)
    expect(data.gasPrice).toBeDefined()
    expect(data.estimates.claimsRemaining).toBe(200)
    expect(data.estimates.registrationsRemaining).toBeGreaterThan(0)
    expect(data.estimates.costPerClaim).toBeDefined()
    expect(data.estimates.costPerRegistration).toBeDefined()
    expect(data.blockchain.network).toBe('base-sepolia')
    expect(data.blockchain.blockNumber).toBe(12345)
    expect(data.blockchain.contractAddress).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3')
    expect(data.blockchain.contractVersion).toBe('2.0.0')
  })

  it('should flag lowBalance when balance is below threshold', async () => {
    const { signature, message } = await signAdminMessage('System status')
    const gasPrice = 1_000_000n
    // Fewer than 100 claims left above the floor
    const balance = blockchain.MIN_BALANCE_WEI + gasPrice * 100_000n * 50n

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getMinterBalance).mockResolvedValue(balance)
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(100)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(blockchain.provider.getFeeData).mockResolvedValue({
      gasPrice,
    } as ethers.FeeData)

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.status).toBe(200)
    expect(res.body.data.lowBalance).toBe(true)
    expect(res.body.data.estimates.claimsRemaining).toBe(50)
  })

  it('survives a gas price of zero', async () => {
    const { signature, message } = await signAdminMessage('System status')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getMinterBalance).mockResolvedValue(blockchain.MIN_BALANCE_WEI * 2n)
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(100)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(blockchain.provider.getFeeData).mockResolvedValue({ gasPrice: 0n } as ethers.FeeData)

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.status).toBe(200)
    expect(res.body.data.estimates.claimsRemaining).toBeGreaterThan(0)
  })

  it('counts no claims once the balance is under the floor', async () => {
    const { signature, message } = await signAdminMessage('System status')
    const gasPrice = 1_000_000n

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getMinterBalance).mockResolvedValue(blockchain.MIN_BALANCE_WEI / 2n)
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(100)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(blockchain.provider.getFeeData).mockResolvedValue({
      gasPrice,
    } as ethers.FeeData)

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.body.data.estimates.claimsRemaining).toBe(0)
    expect(res.body.data.belowMin).toBe(true)
    expect(res.body.data.lowBalance).toBe(true)
  })

  it('should handle null gasPrice from provider', async () => {
    const { signature, message } = await signAdminMessage('System status')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getMinterBalance).mockResolvedValue(10_000_000_000n)
    vi.mocked(blockchain.getBlockNumber).mockResolvedValue(100)
    vi.mocked(blockchain.getNetwork).mockResolvedValue('base-sepolia')
    vi.mocked(blockchain.provider.getFeeData).mockResolvedValue({
      gasPrice: null,
    } as ethers.FeeData)

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.status).toBe(200)
    expect(res.body.data.gasPrice).toBeDefined()
  })

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/status')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('should reject non-admin with 403', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `System status ${timestamp}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('should return 500 on blockchain error', async () => {
    const { signature, message } = await signAdminMessage('System status')

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(blockchain.getMinterBalance).mockRejectedValue(new Error('RPC unavailable'))

    const res = await request(app).get('/api/v1/status').set(adminHeaders(signature, message))

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('INTERNAL_ERROR')
  })
})
