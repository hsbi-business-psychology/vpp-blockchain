import { useTranslation } from 'react-i18next'
import { Download, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SurveyInfo } from '@vpp/shared'

interface TemplateDownloadDialogProps {
  survey: SurveyInfo | null
  loading: boolean
  onDownload: (format: 'sosci' | 'limesurvey') => void
  onClose: () => void
}

export function TemplateDownloadDialog({
  survey,
  loading,
  onDownload,
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

        {loading && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
