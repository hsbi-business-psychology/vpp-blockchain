import { ethers } from 'ethers'

const STORAGE_KEY = 'vpp-wallet'

export interface WalletData {
  address: string
  privateKey: string
}

export function createWallet(): WalletData {
  const wallet = ethers.Wallet.createRandom()
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  }
}

export function importWallet(privateKey: string): WalletData {
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const wallet = new ethers.Wallet(key)
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  }
}

export function signMessage(privateKey: string, message: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey)
  return wallet.signMessage(message)
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
    if (data.address && data.privateKey) return data
    return null
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
