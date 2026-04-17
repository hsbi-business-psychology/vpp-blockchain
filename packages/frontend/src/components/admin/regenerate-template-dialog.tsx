import { useTranslation } from 'react-i18next'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SurveyInfo } from '@vpp/shared'

interface RegenerateTemplateDialogProps {
  survey: SurveyInfo | null
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Asks the admin to confirm regenerating the template (which under the
 * hood rotates the HMAC key). Worded entirely in template-speak; the
 * raw key is never exposed.
 */
export function RegenerateTemplateDialog({
  survey,
  loading,
  onConfirm,
  onClose,
}: RegenerateTemplateDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!survey} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-warning/10">
            <RefreshCw className="size-6 text-warning" />
          </div>
          <DialogTitle>{t('admin.surveys.regenerateConfirm.title')}</DialogTitle>
          <DialogDescription>{t('admin.surveys.regenerateConfirm.description')}</DialogDescription>
        </DialogHeader>

        {survey && (
          <div className="space-y-1 rounded-lg bg-muted p-3">
            <p className="text-sm font-medium">{survey.title || `Survey #${survey.surveyId}`}</p>
            <p className="text-xs text-muted-foreground">ID: {survey.surveyId}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('admin.surveys.regenerateConfirm.button')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
