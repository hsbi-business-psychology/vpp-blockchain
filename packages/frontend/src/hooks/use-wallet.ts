/**
 * @module use-wallet
 *
 * React hook for wallet lifecycle management. Supports two wallet types:
 *
 *   - **Local wallet** – a random Ethereum keypair generated client-side and
 *     stored in localStorage. Simple for students but requires manual backup.
 *   - **MetaMask**     – delegates key management to the browser extension.
 *     More secure, listens for account/chain changes automatically.
 *
 * The hook persists the active wallet across page reloads and provides
 * a unified `sign(message)` function regardless of wallet type.
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
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

    const handleChainChanged = () => {
      toast.warning(i18n.t('wallet.metamask.networkChanged'))
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged)
      window.ethereum?.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [wallet])

  const create = useCallback(() => {
    const data = createWalletFn()
    saveWallet(data)
    setWallet(data)
    return data
  }, [])

  /**
   * Generate a new wallet but do NOT persist it yet. Used by the
   * three-step mnemonic onboarding (info → reveal → verify) so that
   * abandoning the flow midway never leaves an unverified wallet
   * stranded in localStorage.
   */
  const createDraft = useCallback(() => {
    return createWalletFn()
  }, [])

  /**
   * Persist a previously-drafted wallet to localStorage and surface it
   * via state. Caller is responsible for guaranteeing that the user
   * has actually verified their recovery phrase first.
   */
  const commitWallet = useCallback((data: WalletData) => {
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
        // Surface a sticky "open MetaMask" toast if the popup does not
        // appear within ~600 ms. We dismiss it as soon as the signature
        // resolves (or we hit the 60 s timeout). Without this hint the
        // admin form looked frozen whenever the MetaMask extension
        // popup got parked in the toolbar instead of focused — users
        // had no idea they were supposed to click the fox icon.
        let toastId: string | number | undefined
        try {
          return await signMessageMetaMaskFn(message, {
            onAwaitingUser: () => {
              toastId = toast.message(i18n.t('wallet.metamask.awaitingSignTitle'), {
                description: i18n.t('wallet.metamask.awaitingSignDescription'),
                duration: 60_000,
              })
            },
          })
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('METAMASK_TIMEOUT')) {
            toast.error(i18n.t('wallet.metamask.signTimeoutTitle'), {
              description: i18n.t('wallet.metamask.signTimeoutDescription'),
            })
          }
          throw err
        } finally {
          if (toastId !== undefined) toast.dismiss(toastId)
        }
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
    createDraft,
    commitWallet,
    importKey,
    connectMetaMask,
    remove,
    sign,
    downloadKey,
  }
}
