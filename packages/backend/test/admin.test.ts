import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import * as blockchain from '../src/services/blockchain.js'
import { getEventStore } from '../src/services/event-store.js'
import * as adminLabels from '../src/services/admin-labels.js'

const app = createApp()

const ADMIN_WALLET = new ethers.Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

const TARGET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
// Matches getMinterAddress() mock in test/setup.ts.
const MINTER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

describe('GET /api/v1/admin', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    adminLabels.__resetForTests()
  })

  it('should return admin entries with label + isMinter flag', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `List admins at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    adminLabels.setLabel(TARGET_ADDRESS, 'Jasmin')
    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(getEventStore()).getCurrentAdmins.mockReturnValue([MINTER_ADDRESS, TARGET_ADDRESS])

    const res = await request(app)
      .get('/api/v1/admin')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.admins).toHaveLength(2)

    const minterEntry = res.body.data.admins.find(
      (a: { address: string }) => a.address === MINTER_ADDRESS,
    )
    expect(minterEntry).toMatchObject({
      address: MINTER_ADDRESS,
      label: null,
      isMinter: true,
    })

    const targetEntry = res.body.data.admins.find(
      (a: { address: string }) => a.address === TARGET_ADDRESS,
    )
    expect(targetEntry).toMatchObject({
      address: TARGET_ADDRESS,
      label: 'Jasmin',
      isMinter: false,
    })
  })

  it('should return empty array when no admins', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `List admins at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)
    vi.mocked(getEventStore()).getCurrentAdmins.mockReturnValue([])

    const res = await request(app)
      .get('/api/v1/admin')
      .set('x-admin-signature', signature)
      .set('x-admin-message', message)

    expect(res.status).toBe(200)
    expect(res.body.data.admins).toHaveLength(0)
  })

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/admin')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })
})

describe('PUT /api/v1/admin/label', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    adminLabels.__resetForTests()
  })

  it('should set a new label with valid signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Set admin label ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).put('/api/v1/admin/label').send({
      address: TARGET_ADDRESS,
      label: 'Jasmin',
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual({ address: TARGET_ADDRESS, label: 'Jasmin' })
    expect(adminLabels.getLabel(TARGET_ADDRESS)).toBe('Jasmin')
  })

  it('should clear a label when given empty string', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Set admin label ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    adminLabels.setLabel(TARGET_ADDRESS, 'Old')
    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).put('/api/v1/admin/label').send({
      address: TARGET_ADDRESS,
      label: '   ',
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(200)
    expect(res.body.data.label).toBeNull()
    expect(adminLabels.getLabel(TARGET_ADDRESS)).toBeNull()
  })

  it('should reject from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Set admin label ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).put('/api/v1/admin/label').send({
      address: TARGET_ADDRESS,
      label: 'Jasmin',
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(403)
  })

  it('should reject labels longer than the limit', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Set admin label ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app)
      .put('/api/v1/admin/label')
      .send({
        address: TARGET_ADDRESS,
        label: 'x'.repeat(200),
        adminSignature: signature,
        adminMessage: message,
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/admin/add', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should add an admin with valid signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Add admin ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockImplementation(
      async (addr: string) => addr.toLowerCase() === ADMIN_WALLET.address.toLowerCase(),
    )
    vi.mocked(blockchain.addAdmin).mockResolvedValue({
      hash: '0xaddadmintx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app).post('/api/v1/admin/add').send({
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
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Add admin ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).post('/api/v1/admin/add').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('ALREADY_ADMIN')
  })

  it('should reject from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Add admin ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).post('/api/v1/admin/add').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('should reject without signature', async () => {
    const res = await request(app).post('/api/v1/admin/add').send({
      address: TARGET_ADDRESS,
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('should reject an expired admin signature', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600
    const message = `Add admin ${TARGET_ADDRESS} at ${oldTimestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).post('/api/v1/admin/add').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('EXPIRED_MESSAGE')
  })

  it('should reject with invalid address', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Add admin invalid at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).post('/api/v1/admin/add').send({
      address: 'not-a-valid-address',
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/admin/remove', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should remove an admin with valid signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Remove admin ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockImplementation(async (addr: string) => {
      if (addr.toLowerCase() === ADMIN_WALLET.address.toLowerCase()) return true
      if (addr.toLowerCase() === TARGET_ADDRESS.toLowerCase()) return true
      return false
    })
    vi.mocked(blockchain.removeAdmin).mockResolvedValue({
      hash: '0xremoveadmintx',
    } as unknown as ethers.TransactionReceipt)

    const res = await request(app).post('/api/v1/admin/remove').send({
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
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Remove admin ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockImplementation(
      async (addr: string) => addr.toLowerCase() === ADMIN_WALLET.address.toLowerCase(),
    )

    const res = await request(app).post('/api/v1/admin/remove').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('NOT_ADMIN')
  })

  it('should reject from a non-admin wallet', async () => {
    const nonAdmin = ethers.Wallet.createRandom()
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Remove admin ${TARGET_ADDRESS} at ${timestamp}`
    const signature = await nonAdmin.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(false)

    const res = await request(app).post('/api/v1/admin/remove').send({
      address: TARGET_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(403)
  })

  it('should refuse to remove the Minter wallet', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = `Remove admin ${MINTER_ADDRESS} at ${timestamp}`
    const signature = await ADMIN_WALLET.signMessage(message)

    vi.mocked(blockchain.isAdmin).mockResolvedValue(true)

    const res = await request(app).post('/api/v1/admin/remove').send({
      address: MINTER_ADDRESS,
      adminSignature: signature,
      adminMessage: message,
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('MINTER_PROTECTED')
    expect(blockchain.removeAdmin).not.toHaveBeenCalled()
  })
})
