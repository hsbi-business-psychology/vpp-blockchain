import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ShieldCheck, ShieldX, ShieldAlert, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type AdminCheckState = 'loading' | 'admin' | 'denied'

interface AdminAuthGateProps {
  hasWallet: boolean
  adminCheck: AdminCheckState
  authenticated: boolean
  walletAddress?: string
  /**
   * True after the admin rejected/cancelled the wallet-sign popup. When
   * set, the gate must show an explicit "Sign again" button instead of
   * the spinner — otherwise the auto-auth effect would silently re-open
   * the popup and lock the user out (audit F5.2 / M9).
   */
  authFailed?: boolean
  onRetry?: () => void
}

/**
 * Renders blocking UI for unauthenticated admin states.
 * Returns `null` when the user is fully authenticated so the
 * caller can render the dashboard.
 */
export function AdminAuthGate({
  hasWallet,
  adminCheck,
  authenticated,
  walletAddress,
  authFailed = false,
  onRetry,
}: AdminAuthGateProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (!hasWallet) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <ShieldCheck className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t('points.noWallet')}</p>
            <Button onClick={() => navigate('/points')}>{t('wallet.create.title')}</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (adminCheck === 'loading') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.roles.checking')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (adminCheck === 'denied') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-5 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="size-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{t('admin.accessDenied.title')}</h2>
              <p className="text-base text-muted-foreground">
                {t('admin.accessDenied.description')}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-3 w-full">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="truncate font-mono text-sm">{walletAddress}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t('admin.accessDenied.hint')}</p>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('admin.accessDenied.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!authenticated) {
    if (authFailed) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center gap-5 py-8 text-center">
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
            </CardContent>
          </Card>
        </div>
      )
    }
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.auth.description')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
