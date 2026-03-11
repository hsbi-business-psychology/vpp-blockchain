import { useState, useEffect, useCallback } from 'react'
import type { WalletData } from '@/lib/wallet'
import {
  createWallet as createWalletFn,
  importWallet as importWalletFn,
  connectMetaMask as connectMetaMaskFn,
  saveWallet,
  loadWallet,
  deleteWallet as deleteWalletFn,
  signMessage as signMessageFn,
  signMessageMetaMask as signMessageMetaMaskFn,
  downloadKeyFile as downloadKeyFileFn,
  hasMetaMask as hasMetaMaskFn,
} from '@/lib/wallet'

export function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = loadWallet()
    setWallet(stored)
    setLoading(false)
  }, [])

  // Listen for MetaMask account changes
  useEffect(() => {
    if (!wallet || wallet.type !== 'metamask' || !window.ethereum?.on) return

    const handleAccountsChanged = (accounts: unknown) => {
      const addrs = accounts as string[]
      if (addrs.length === 0) {
        deleteWalletFn()
        setWallet(null)
      } else if (addrs[0].toLowerCase() !== wallet.address.toLowerCase()) {
        const updated: WalletData = { address: addrs[0], privateKey: '', type: 'metamask' }
        saveWallet(updated)
        setWallet(updated)
      }
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged)
    }
  }, [wallet])

  const create = useCallback(() => {
    const data = createWalletFn()
    saveWallet(data)
    setWallet(data)
    return data
  }, [])

  const importKey = useCallback((privateKey: string) => {
    const data = importWalletFn(privateKey)
    saveWallet(data)
    setWallet(data)
    return data
  }, [])

  const connectMetaMask = useCallback(async () => {
    const data = await connectMetaMaskFn()
    saveWallet(data)
    setWallet(data)
    return data
  }, [])

  const remove = useCallback(() => {
    deleteWalletFn()
    setWallet(null)
  }, [])

  const sign = useCallback(
    async (message: string) => {
      if (!wallet) throw new Error('No wallet available')
      if (wallet.type === 'metamask') {
        return signMessageMetaMaskFn(message)
      }
      return signMessageFn(wallet.privateKey, message)
    },
    [wallet],
  )

  const downloadKey = useCallback(() => {
    if (!wallet || wallet.type === 'metamask') return
    downloadKeyFileFn(wallet)
  }, [wallet])

  return {
    wallet,
    loading,
    hasWallet: !!wallet,
    isMetaMask: wallet?.type === 'metamask',
    hasMetaMask: hasMetaMaskFn(),
    create,
    importKey,
    connectMetaMask,
    remove,
    sign,
    downloadKey,
  }
}
