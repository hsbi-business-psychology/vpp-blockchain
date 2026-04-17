/**
 * @module wallet
 *
 * Low-level wallet operations (create, import, sign, persist).
 *
 * Wallets are stored as JSON in `localStorage` under `vpp-wallet`.
 * For local wallets the private key is included; for MetaMask wallets
 * it is always empty since the extension handles signing.
 *
 * Security note: local wallets keep the private key in the browser.
 * Users are warned during creation and advised to back up the key
 * in a password manager or on paper.
 */
import { ethers } from 'ethers'

const STORAGE_KEY = 'vpp-wallet'

export type WalletType = 'local' | 'metamask'

export interface WalletData {
  address: string
  privateKey: string
  type: WalletType
}

export function createWallet(): WalletData {
  const wallet = ethers.Wallet.createRandom()
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    type: 'local',
  }
}

export function importWallet(privateKey: string): WalletData {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const wallet = new ethers.Wallet(key)
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    type: 'local',
  }
}

export function signMessage(privateKey: string, message: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey)
  return wallet.signMessage(message)
}

export async function connectMetaMask(): Promise<WalletData> {
  if (!window.ethereum) throw new Error('MetaMask is not installed')
  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()
  return {
    address: signer.address,
    privateKey: '',
    type: 'metamask',
  }
}

/**
 * Sign a UTF-8 string with the connected MetaMask account.
 *
 * Hardened against three failure modes that were silently breaking the
 * admin UI on real users:
 *
 *  1. MetaMask popup never appears — browser background-tab the popup,
 *     or the extension service worker is asleep. We dispatch a wake-up
 *     `eth_accounts` call before signing and surface a "open MetaMask"
 *     toast via `onAwaitingUser` so the UX is unambiguous instead of
 *     a forever-spinning button.
 *  2. `BrowserProvider.getSigner()` triggers a stealth `eth_requestAccounts`
 *     when MetaMask considers the dapp un-connected. That spawns a
 *     *connect* popup that races with our personal_sign popup, and one
 *     of them silently loses. We resolve the signer ourselves from
 *     `eth_accounts` (read-only), only requesting permission if there
 *     is no live connection at all.
 *  3. `personal_sign` hanging forever — wrap in a 60 s timeout so the
 *     caller can show a meaningful error and reset the loading state
 *     instead of locking the form.
 */
export async function signMessageMetaMask(
  message: string,
  opts: { onAwaitingUser?: () => void; timeoutMs?: number } = {},
): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask is not installed')

  // Read-only probe first; no popup if already connected.
  let accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[]

  if (!accounts || accounts.length === 0) {
    // Only now request permission. This *will* spawn the MetaMask
    // connect popup, which is fine because we know we have to.
    accounts = (await window.ethereum.request({
      method: 'eth_requestAccounts',
    })) as string[]
  }

  if (!accounts || accounts.length === 0) {
    throw new Error('NO_METAMASK_ACCOUNT')
  }

  const from = accounts[0]

  // Surface "please open MetaMask" hint to the UI shortly after the
  // request goes out — covers the case where the popup gets parked in
  // the extension panel because the browser refused to focus it.
  const hintTimer = setTimeout(() => opts.onAwaitingUser?.(), 600)

  // Use raw personal_sign instead of ethers' BrowserProvider.signMessage
  // because the latter may internally re-issue eth_requestAccounts (see
  // failure mode #2 above) on the very signer instance we'd be using.
  const signPromise = window.ethereum.request({
    method: 'personal_sign',
    params: [message, from],
  }) as Promise<string>

  const timeoutMs = opts.timeoutMs ?? 60_000
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () =>
        reject(
          new Error(
            'METAMASK_TIMEOUT: Signature request timed out. ' +
              'Open the MetaMask extension manually (fox icon) and check for ' +
              'pending requests, then try again.',
          ),
        ),
      timeoutMs,
    )
  })

  try {
    const sig = await Promise.race([signPromise, timeoutPromise])
    return sig
  } finally {
    clearTimeout(hintTimer)
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

export async function getMetaMaskSigner(): Promise<ethers.Signer> {
  if (!window.ethereum) throw new Error('MetaMask is not installed')
  const provider = new ethers.BrowserProvider(window.ethereum)
  return provider.getSigner()
}

export function hasMetaMask(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

export function isValidPrivateKey(key: string): boolean {
  try {
    const k = key.startsWith('0x') ? key : `0x${key}`
    new ethers.Wallet(k)
    return true
  } catch {
    return false
  }
}

export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address)
}

export function saveWallet(data: WalletData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadWallet(): WalletData | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as WalletData
    if (!data.address) return null
    // Migrate old wallets without type
    if (!data.type) data.type = 'local'
    // Local wallets must have a privateKey
    if (data.type === 'local' && !data.privateKey) return null
    return data
  } catch {
    return null
  }
}

export function deleteWallet(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function downloadKeyFile(data: WalletData): void {
  const content = JSON.stringify(
    {
      address: data.address,
      privateKey: data.privateKey,
      note: 'Keep this file secure. Never share your private key.',
    },
    null,
    2,
  )
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vpp-wallet-${data.address.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
