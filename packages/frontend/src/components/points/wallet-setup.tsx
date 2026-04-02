import { useTranslation } from 'react-i18next'
import { Wallet, Shield, KeyRound, Globe, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface WalletSetupProps {
  hasMetaMask: boolean
  onCreateRequest: () => void
  onConnectMetaMask: () => void
  onImportRequest: () => void
}

export function WalletSetup({
  hasMetaMask,
  onCreateRequest,
  onConnectMetaMask,
  onImportRequest,
}: WalletSetupProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">{t('wallet.chooseMethod')}</h2>

      <div className="space-y-3 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
        {/* Browser Wallet */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md md:flex-col md:items-stretch md:p-5">
          <div className="flex items-center gap-3 md:mb-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('wallet.browser.title')}</p>
              <Badge variant="secondary" className="mt-0.5 text-[10px]">
                {t('wallet.browser.tag')}
              </Badge>
            </div>
          </div>
          <p className="hidden flex-1 text-sm leading-relaxed text-muted-foreground md:block">
            {t('wallet.browser.description')}
          </p>
          <div className="ml-auto shrink-0 md:ml-0 md:mt-3">
            <Button onClick={onCreateRequest} size="sm" className="md:w-full">
              <Wallet className="mr-2 size-4" aria-hidden="true" />
              {t('wallet.browser.button')}
            </Button>
          </div>
        </div>

        {/* MetaMask */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md md:flex-col md:items-stretch md:p-5">
          <div className="flex items-center gap-3 md:mb-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
              <Shield className="size-5 text-orange-500" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('wallet.metamask.title')}</p>
              <Badge
                variant="outline"
                className="mt-0.5 border-orange-500/30 text-[10px] text-orange-600 dark:text-orange-400"
              >
                {t('wallet.metamask.tag')}
              </Badge>
            </div>
          </div>
          <p className="hidden flex-1 text-sm leading-relaxed text-muted-foreground md:block">
            {t('wallet.metamask.description')}
          </p>
          <div className="ml-auto shrink-0 md:ml-0 md:mt-3">
            {hasMetaMask ? (
              <Button variant="outline" onClick={onConnectMetaMask} size="sm" className="md:w-full">
                <Shield className="mr-2 size-4" aria-hidden="true" />
                {t('wallet.metamask.button')}
              </Button>
            ) : (
              <div className="space-y-1.5">
                <Button variant="outline" disabled size="sm" className="opacity-50 md:w-full">
                  {t('wallet.metamask.notInstalled')}
                </Button>
                <p className="hidden text-center text-xs text-muted-foreground md:block">
                  {t('wallet.metamask.installHint')}{' '}
                  <a
                    href="https://metamask.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t('wallet.metamask.installLink')}
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Import */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md md:flex-col md:items-stretch md:p-5">
          <div className="flex items-center gap-3 md:mb-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('wallet.import.title')}</p>
              <Badge variant="secondary" className="mt-0.5 text-[10px]">
                {t('wallet.import.tag')}
              </Badge>
            </div>
          </div>
          <p className="hidden flex-1 text-sm leading-relaxed text-muted-foreground md:block">
            {t('wallet.import.description')}
          </p>
          <div className="ml-auto shrink-0 md:ml-0 md:mt-3">
            <Button variant="outline" onClick={onImportRequest} size="sm" className="md:w-full">
              <Upload className="mr-2 size-4" aria-hidden="true" />
              {t('wallet.import.button')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
