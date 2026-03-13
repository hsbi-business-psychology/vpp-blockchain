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

describe('POST /api/admin/add', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should add an admin with valid signature', async () => {
    const message = `Add admin ${TARGET_ADDRESS} at ${Date.now()}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockImplementation(
      async (addr: string) => addr.toLowerCase() === ADMIN_WALLET.address.toLowerCase(),
    )
    vi.mocked(blockchain.addAdmin).mockResolvedValue({
      hash: '0xaddadmintx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app).post('/api/admin/add').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xaddadmintx')
    expect(blockchain.addAdmin).toHaveBeenCalledWith(TARGET_ADDRESS)
  })

  it('should reject if target is already an admin', async () => {
    const message = `Add admin ${TARGET_ADDRESS} at ${Date.now()}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).post('/api/admin/add').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_ADMIN')
  })

  it('should reject from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const message = `Add admin ${TARGET_ADDRESS} at ${Date.now()}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).post('/api/admin/add').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('should reject without signature', async () => {
    const res = await request(app).post('/api/admin/add').send({
      address: TARGET_ADDRESS,
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('should reject with invalid address', async () => {
    const message = `Add admin invalid at ${Date.now()}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).post('/api/admin/add').send({
      address: 'not-a-valid-address',
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/admin/remove', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should remove an admin with valid signature', async () => {
    const message = `Remove admin ${TARGET_ADDRESS} at ${Date.now()}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockImplementation(async (addr: string) => {
      if (addr.toLowerCase() === ADMIN_WALLET.address.toLowerCase()) return true
      if (addr.toLowerCase() === TARGET_ADDRESS.toLowerCase()) return true
      return false
    })
    vi.mocked(blockchain.removeAdmin).mockResolvedValue({
      hash: '0xremoveadmintx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app).post('/api/admin/remove').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.txHash).toBe('0xremoveadmintx')
    expect(blockchain.removeAdmin).toHaveBeenCalledWith(TARGET_ADDRESS)
  })

  it('should reject if target is not an admin', async () => {
    const message = `Remove admin ${TARGET_ADDRESS} at ${Date.now()}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockImplementation(
      async (addr: string) => addr.toLowerCase() === ADMIN_WALLET.address.toLowerCase(),
    )

    const res = await request(app).post('/api/admin/remove').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('NOT_ADMIN')
  })

  it('should reject from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const message = `Remove admin ${TARGET_ADDRESS} at ${Date.now()}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).post('/api/admin/remove').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(403)
  })
})
