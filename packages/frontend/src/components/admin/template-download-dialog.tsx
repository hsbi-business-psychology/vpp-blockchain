import { useTranslation } from 'react-i18next'
import { Download, Loader2, KeyRound, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { SurveyInfo } from '@vpp/shared'

interface TemplateDownloadDialogProps {
  survey: SurveyInfo | null
  loading: boolean
  /** True when the dialog is opened immediately after registration. */
  freshlyRegistered?: boolean
  /** Show the "reveal raw HMAC key" link (only useful right after registration when the key is cached). */
  canShowKey?: boolean
  onDownload: (format: 'sosci' | 'limesurvey') => void
  onShowKey?: () => void
  onClose: () => void
}

export function TemplateDownloadDialog({
  survey,
  loading,
  freshlyRegistered = false,
  canShowKey = false,
  onDownload,
  onShowKey,
  onClose,
}: TemplateDownloadDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!survey} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <Download className="size-6 text-primary" />
          </div>
          <DialogTitle>{t('admin.surveys.templateDialog.title')}</DialogTitle>
          <DialogDescription>{t('admin.surveys.templateDialog.descriptionV2')}</DialogDescription>
        </DialogHeader>

        {survey && (
          <div className="space-y-1 rounded-lg bg-muted p-3">
            <p className="text-sm font-medium">{survey.title || `Survey #${survey.surveyId}`}</p>
            <p className="text-xs text-muted-foreground">
              ID: {survey.surveyId} · {survey.points} {t('admin.register.points')}
            </p>
          </div>
        )}

        {freshlyRegistered && (
          <Alert className="border-success/30 bg-success/5">
            <CheckCircle2 className="size-4 text-success" />
            <AlertDescription className="text-xs">
              {t('admin.surveys.templateDialog.freshHint')}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onDownload('sosci')}
            disabled={loading}
            className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-semibold">
                {t('admin.surveys.templateDialog.sosci.title')}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                .xml
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.surveys.templateDialog.sosci.description')}
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <Download className="size-3" />
              {t('admin.surveys.templateDialog.sosci.download')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onDownload('limesurvey')}
            disabled={loading}
            className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-semibold">
                {t('admin.surveys.templateDialog.limesurvey.title')}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                .lsq
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.surveys.templateDialog.limesurvey.description')}
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <Download className="size-3" />
              {t('admin.surveys.templateDialog.limesurvey.download')}
            </span>
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('admin.surveys.templateDialog.embeddedKeyHint')}
        </p>

        {canShowKey && onShowKey && (
          <button
            type="button"
            onClick={onShowKey}
            className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <KeyRound className="size-3" />
            {t('admin.surveys.templateDialog.showKeyLink')}
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
