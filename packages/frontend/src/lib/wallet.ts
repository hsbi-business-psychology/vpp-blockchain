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

export async function signMessageMetaMask(message: string): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask is not installed')
  const provider = new ethers.BrowserProvider(window.ethereum)
  const signer = await provider.getSigner()
  return signer.signMessage(message)
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
