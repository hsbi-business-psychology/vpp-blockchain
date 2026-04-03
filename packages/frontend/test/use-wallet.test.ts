import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWallet } from '@/hooks/use-wallet'
import type { WalletData } from '@/lib/wallet'

vi.mock('@/lib/wallet', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    createWallet: vi.fn<() => WalletData>(() => ({
      address: '0xNewAddress',
      privateKey: '0xNewPrivKey',
      type: 'local',
    })),
    importWallet: vi.fn<(key: string) => WalletData>((key: string) => ({
      address: '0xImportedAddr',
      privateKey: key,
      type: 'local',
    })),
    connectMetaMask: vi.fn<() => Promise<WalletData>>().mockResolvedValue({
      address: '0xMetaMaskAddr',
      privateKey: '',
      type: 'metamask',
    }),
    signMessage: vi
      .fn<(pk: string, msg: string) => Promise<string>>()
      .mockResolvedValue('0xLocalSig'),
    signMessageMetaMask: vi.fn<(msg: string) => Promise<string>>().mockResolvedValue('0xMmSig'),
    saveWallet: vi.fn(),
    loadWallet: vi.fn<() => WalletData | null>(() => null),
    deleteWallet: vi.fn(),
    downloadKeyFile: vi.fn(),
    hasMetaMask: vi.fn<() => boolean>(() => false),
  }
})

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))
vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }))

const walletLib = await import('@/lib/wallet')

describe('useWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('starts with loading=true, then resolves to null wallet', async () => {
    vi.mocked(walletLib.loadWallet).mockReturnValue(null)

    const { result } = renderHook(() => useWallet())

    expect(result.current.loading).toBe(false)
    expect(result.current.wallet).toBeNull()
    expect(result.current.hasWallet).toBe(false)
  })

  it('loads existing wallet from localStorage on mount', () => {
    const stored: WalletData = { address: '0xStored', privateKey: '0xKey', type: 'local' }
    vi.mocked(walletLib.loadWallet).mockReturnValue(stored)

    const { result } = renderHook(() => useWallet())

    expect(result.current.wallet).toEqual(stored)
    expect(result.current.hasWallet).toBe(true)
    expect(result.current.isMetaMask).toBe(false)
  })

  it('create() generates and persists a new wallet', () => {
    const { result } = renderHook(() => useWallet())

    act(() => {
      result.current.create()
    })

    expect(walletLib.createWallet).toHaveBeenCalled()
    expect(walletLib.saveWallet).toHaveBeenCalledWith({
      address: '0xNewAddress',
      privateKey: '0xNewPrivKey',
      type: 'local',
    })
    expect(result.current.wallet?.address).toBe('0xNewAddress')
    expect(result.current.hasWallet).toBe(true)
  })

  it('importKey() imports and persists a wallet by private key', () => {
    const { result } = renderHook(() => useWallet())

    act(() => {
      result.current.importKey('0xSomePrivateKey')
    })

    expect(walletLib.importWallet).toHaveBeenCalledWith('0xSomePrivateKey')
    expect(walletLib.saveWallet).toHaveBeenCalled()
    expect(result.current.wallet?.address).toBe('0xImportedAddr')
  })

  it('remove() deletes wallet and resets state', () => {
    const stored: WalletData = { address: '0xStored', privateKey: '0xKey', type: 'local' }
    vi.mocked(walletLib.loadWallet).mockReturnValue(stored)

    const { result } = renderHook(() => useWallet())
    expect(result.current.hasWallet).toBe(true)

    act(() => {
      result.current.remove()
    })

    expect(walletLib.deleteWallet).toHaveBeenCalled()
    expect(result.current.wallet).toBeNull()
    expect(result.current.hasWallet).toBe(false)
  })

  it('sign() delegates to signMessage for local wallets', async () => {
    const stored: WalletData = { address: '0xLocal', privateKey: '0xPK', type: 'local' }
    vi.mocked(walletLib.loadWallet).mockReturnValue(stored)

    const { result } = renderHook(() => useWallet())

    const sig = await act(() => result.current.sign('hello'))

    expect(walletLib.signMessage).toHaveBeenCalledWith('0xPK', 'hello')
    expect(sig).toBe('0xLocalSig')
  })

  it('sign() delegates to signMessageMetaMask for metamask wallets', async () => {
    const stored: WalletData = { address: '0xMM', privateKey: '', type: 'metamask' }
    vi.mocked(walletLib.loadWallet).mockReturnValue(stored)

    const { result } = renderHook(() => useWallet())

    const sig = await act(() => result.current.sign('hello'))

    expect(walletLib.signMessageMetaMask).toHaveBeenCalledWith('hello')
    expect(sig).toBe('0xMmSig')
  })

  it('sign() throws when no wallet is active', async () => {
    vi.mocked(walletLib.loadWallet).mockReturnValue(null)

    const { result } = renderHook(() => useWallet())

    await expect(result.current.sign('hello')).rejects.toThrow('No wallet available')
  })

  it('isMetaMask returns true for metamask wallets', () => {
    vi.mocked(walletLib.loadWallet).mockReturnValue({
      address: '0xMM',
      privateKey: '',
      type: 'metamask',
    })

    const { result } = renderHook(() => useWallet())

    expect(result.current.isMetaMask).toBe(true)
  })
})
