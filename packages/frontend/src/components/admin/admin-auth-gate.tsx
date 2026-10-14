import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ShieldCheck, ShieldX, ShieldAlert, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type AdminCheckState = 'loading' | 'admin' | 'denied' | 'error'

interface AdminAuthGateProps {
  hasWallet: boolean
  hasMetaMask?: boolean
  onConnectMetaMask?: () => void
  adminCheck: AdminCheckState
  /** Re-runs the on-chain role check after an RPC failure. */
  onRetryAdminCheck?: () => void
  authenticated: boolean
  walletAddress?: string
  /**
   * True after the admin rejected/cancelled the wallet-sign popup. When
   * set, the gate must show an explicit "Sign again" button instead of
   * the spinner — otherwise the auto-auth effect would silently re-open
   * the popup and lock the user out (audit F5.2 / M9).
   */
  authFailed?: boolean
  /** True after an explicit logout; shows a sign-in button. */
  loggedOut?: boolean
  onRetry?: () => void
}

function GateCard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-5 py-8 text-center">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Renders blocking UI for unauthenticated admin states.
 * Returns `null` when the user is fully authenticated so the
 * caller can render the dashboard.
 */
export function AdminAuthGate({
  hasWallet,
  hasMetaMask = false,
  onConnectMetaMask,
  adminCheck,
  onRetryAdminCheck,
  authenticated,
  walletAddress,
  authFailed = false,
  loggedOut = false,
  onRetry,
}: AdminAuthGateProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (!hasWallet) {
    return (
      <GateCard>
        <ShieldCheck className="size-10 text-muted-foreground" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('admin.gate.title')}</h2>
          <p className="text-base text-muted-foreground">{t('admin.gate.description')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {hasMetaMask ? (
            <Button onClick={onConnectMetaMask}>{t('admin.gate.connectMetaMask')}</Button>
          ) : (
            <Button asChild>
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
                {t('admin.gate.installMetaMask')}
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/points')}>
            {t('admin.gate.importWallet')}
          </Button>
        </div>
      </GateCard>
    )
  }

  if (adminCheck === 'loading') {
    return (
      <GateCard>
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('admin.roles.checking')}</p>
      </GateCard>
    )
  }

  if (adminCheck === 'error') {
    return (
      <GateCard>
        <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10">
          <ShieldAlert className="size-7 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('admin.gate.checkFailedTitle')}</h2>
          <p className="text-base text-muted-foreground">
            {t('admin.gate.checkFailedDescription')}
          </p>
        </div>
        <Button onClick={onRetryAdminCheck} disabled={!onRetryAdminCheck}>
          {t('admin.gate.retry')}
        </Button>
      </GateCard>
    )
  }

  if (adminCheck === 'denied') {
    return (
      <GateCard>
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="size-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('admin.accessDenied.title')}</h2>
          <p className="text-base text-muted-foreground">{t('admin.accessDenied.description')}</p>
        </div>
        <div className="w-full rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Wallet</p>
          <p className="truncate font-mono text-sm">{walletAddress}</p>
        </div>
        <p className="text-sm text-muted-foreground">{t('admin.accessDenied.hint')}</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          {t('admin.accessDenied.back')}
        </Button>
      </GateCard>
    )
  }

  if (!authenticated) {
    if (loggedOut) {
      return (
        <GateCard>
          <LogIn className="size-10 text-muted-foreground" />
          <p className="text-base text-muted-foreground">{t('admin.auth.loggedOut')}</p>
          <Button onClick={onRetry} disabled={!onRetry}>
            {t('admin.auth.button')}
          </Button>
        </GateCard>
      )
    }
    if (authFailed) {
      return (
        <GateCard>
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10">
            <ShieldAlert className="size-7 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{t('admin.auth.rejected.title')}</h2>
            <p className="text-base text-muted-foreground">
              {t('admin.auth.rejected.description')}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={onRetry} disabled={!onRetry}>
              {t('admin.auth.rejected.retry')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('admin.accessDenied.back')}
            </Button>
          </div>
        </GateCard>
      )
    }
    return (
      <GateCard>
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('admin.auth.description')}</p>
      </GateCard>
    )
  }

  return null
}
