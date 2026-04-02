import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { useWallet } from '@/hooks/use-wallet'
import { useBlockchain } from '@/hooks/use-blockchain'
import { useApi } from '@/hooks/use-api'
import { toast } from 'sonner'
import { WalletSetup } from '@/components/points/wallet-setup'
import { WalletCard } from '@/components/points/wallet-card'
import { PointsOverview } from '@/components/points/points-overview'
import { ClaimHistory, type ClaimEntry } from '@/components/points/claim-history'
import { PointsExplorer } from '@/components/points/points-explorer'
import {
  RevealKeyDialog,
  DeleteWalletDialog,
  ImportWalletDialog,
  CreateWalletDialog,
} from '@/components/points/wallet-dialogs'

export default function PointsPage() {
  const { t } = useTranslation()
  const {
    wallet,
    hasWallet,
    isMetaMask,
    hasMetaMask,
    loading: walletLoading,
    create,
    importKey,
    connectMetaMask,
    remove,
    downloadKey,
  } = useWallet()
  const { isWalletSubmitted: checkSubmitted } = useBlockchain()
  const { getPointsData } = useApi()

  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [walletSubmitted, setWalletSubmitted] = useState(false)
  const [history, setHistory] = useState<ClaimEntry[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState(false)

  const [keyRevealed, setKeyRevealed] = useState(false)
  const [showRevealDialog, setShowRevealDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!wallet?.address) {
      setDataLoading(false)
      return
    }
    setDataError(false)
    setDataLoading(true)

    Promise.all([
      getPointsData(wallet.address).then((data) => {
        setTotalPoints(data.totalPoints)
        setHistory(
          data.surveys.map((s) => ({
            surveyId: s.surveyId,
            points: s.points,
            txHash: s.txHash,
            blockNumber: 0,
          })),
        )
      }),
      checkSubmitted(wallet.address)
        .then(setWalletSubmitted)
        .catch(() => {}),
    ])
      .catch(() => setDataError(true))
      .finally(() => setDataLoading(false))
  }, [wallet?.address, getPointsData, checkSubmitted])

  // ── Wallet actions ─────────────────────────────────────────────────────
  function handleCreateConfirm() {
    create()
    setShowCreateDialog(false)
    toast.success(t('wallet.create.success'))
  }

  function handleImport(key: string) {
    try {
      importKey(key)
      setShowImportDialog(false)
      toast.success(t('wallet.create.success'))
    } catch {
      toast.error(t('wallet.import.error'))
    }
  }

  async function handleConnectMetaMask() {
    try {
      await connectMetaMask()
      toast.success(t('wallet.create.success'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      if (msg.includes('not installed')) {
        toast.error(t('wallet.metamask.notInstalled'))
      } else {
        toast.error(msg)
      }
    }
  }

  function resetWalletState() {
    remove()
    setTotalPoints(null)
    setHistory([])
    setKeyRevealed(false)
  }

  function handleDelete() {
    resetWalletState()
    setShowDeleteDialog(false)
    toast.success(t('wallet.delete.success'))
  }

  function handleDisconnect() {
    resetWalletState()
    toast.success(t('wallet.delete.success'))
  }

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (walletLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('points.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">{t('points.subtitle')}</p>
      </div>

      {!hasWallet ? (
        <WalletSetup
          hasMetaMask={hasMetaMask}
          onCreateRequest={() => setShowCreateDialog(true)}
          onConnectMetaMask={handleConnectMetaMask}
          onImportRequest={() => setShowImportDialog(true)}
        />
      ) : (
        <>
          <WalletCard
            address={wallet!.address}
            privateKey={wallet!.privateKey}
            isMetaMask={isMetaMask}
            keyRevealed={keyRevealed}
            onRevealRequest={() => setShowRevealDialog(true)}
            onHideKey={() => setKeyRevealed(false)}
            onDownloadKey={downloadKey}
            onImportRequest={() => setShowImportDialog(true)}
            onDeleteRequest={() => setShowDeleteDialog(true)}
            onDisconnect={handleDisconnect}
          />

          <PointsOverview
            totalPoints={totalPoints}
            dataLoading={dataLoading}
            dataError={dataError}
            walletSubmitted={walletSubmitted}
            hasHistory={history.length > 0}
          />

          <ClaimHistory history={history} dataLoading={dataLoading} />
        </>
      )}

      <PointsExplorer />

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <RevealKeyDialog
        open={showRevealDialog}
        onOpenChange={setShowRevealDialog}
        onConfirm={() => {
          setKeyRevealed(true)
          setShowRevealDialog(false)
        }}
      />

      <DeleteWalletDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
      />

      <ImportWalletDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        hasExistingWallet={hasWallet}
        onImport={handleImport}
      />

      <CreateWalletDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onConfirm={handleCreateConfirm}
      />
    </div>
  )
}
