import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
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

interface DeactivateSurveyDialogProps {
  survey: SurveyInfo | null
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeactivateSurveyDialog({
  survey,
  loading,
  onConfirm,
  onClose,
}: DeactivateSurveyDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!survey} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 mb-2">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <DialogTitle>{t('admin.surveys.deactivateConfirm.title')}</DialogTitle>
          <DialogDescription>{t('admin.surveys.deactivateConfirm.description')}</DialogDescription>
        </DialogHeader>
        {survey && (
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-sm font-medium">{survey.title || `Survey #${survey.surveyId}`}</p>
            <p className="text-xs text-muted-foreground">
              ID: {survey.surveyId} · {survey.claimCount} Claims
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <AlertTriangle className="mr-1.5 size-4" />
            )}
            {t('admin.surveys.deactivateConfirm.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
