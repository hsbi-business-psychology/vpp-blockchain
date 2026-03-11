import { useState, useEffect, useCallback } from 'react'
import type { WalletData } from '@/lib/wallet'
import {
  createWallet as createWalletFn,
  importWallet as importWalletFn,
  saveWallet,
  loadWallet,
  deleteWallet as deleteWalletFn,
  signMessage as signMessageFn,
  downloadKeyFile as downloadKeyFileFn,
} from '@/lib/wallet'

export function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = loadWallet()
    setWallet(stored)
    setLoading(false)
  }, [])

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

  const remove = useCallback(() => {
    deleteWalletFn()
    setWallet(null)
  }, [])

  const sign = useCallback(
    async (message: string) => {
      if (!wallet) throw new Error('No wallet available')
      return signMessageFn(wallet.privateKey, message)
    },
    [wallet],
  )

  const downloadKey = useCallback(() => {
    if (!wallet) return
    downloadKeyFileFn(wallet)
  }, [wallet])

  return {
    wallet,
    loading,
    hasWallet: !!wallet,
    create,
    importKey,
    remove,
    sign,
    downloadKey,
  }
}
