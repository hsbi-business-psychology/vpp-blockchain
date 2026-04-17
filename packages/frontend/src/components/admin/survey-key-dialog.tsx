import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Key, Copy, Check, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { SurveyInfo } from '@vpp/shared'

/**
 * Renders the survey HMAC key (newly generated or fetched) with
 * copy-to-clipboard, plus an opt-in destructive "rotate" button. The
 * surrounding admin handles fetch + rotate; this dialog stays
 * stateless aside from copy-feedback.
 */
interface SurveyKeyDialogProps {
  survey: SurveyInfo | null
  surveyKey: string | null
  keyCreatedAt: string | null
  loading: boolean
  rotating: boolean
  onRotate: () => void
  onClose: () => void
}

export function SurveyKeyDialog({
  survey,
  surveyKey,
  keyCreatedAt,
  loading,
  rotating,
  onRotate,
  onClose,
}: SurveyKeyDialogProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [showRotateConfirm, setShowRotateConfirm] = useState(false)

  const handleCopy = async () => {
    if (!surveyKey) return
    try {
      await navigator.clipboard.writeText(surveyKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable; user can select+copy manually
    }
  }

  const handleClose = () => {
    setShowRotateConfirm(false)
    setCopied(false)
    onClose()
  }

  return (
    <Dialog open={!!survey} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <Key className="size-6 text-primary" />
          </div>
          <DialogTitle>{t('admin.surveys.keyDialog.title')}</DialogTitle>
          <DialogDescription>{t('admin.surveys.keyDialog.description')}</DialogDescription>
        </DialogHeader>

        {survey && (
          <div className="space-y-1 rounded-lg bg-muted p-3">
            <p className="text-sm font-medium">{survey.title || `Survey #${survey.surveyId}`}</p>
            <p className="text-xs text-muted-foreground">ID: {survey.surveyId}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && surveyKey && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t('admin.surveys.keyDialog.keyLabel')}
              </label>
              <div className="flex gap-2">
                <code className="flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 text-xs font-mono">
                  {surveyKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label={t('admin.surveys.keyDialog.copy')}
                >
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </Button>
              </div>
              {keyCreatedAt && (
                <p className="text-[11px] text-muted-foreground">
                  {t('admin.surveys.keyDialog.createdAt', {
                    date: new Date(keyCreatedAt).toLocaleString(),
                  })}
                </p>
              )}
            </div>

            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-xs">
                {t('admin.surveys.keyDialog.securityHint')}
              </AlertDescription>
            </Alert>

            {showRotateConfirm ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription className="space-y-3 text-xs">
                  <p>{t('admin.surveys.keyDialog.rotateWarning')}</p>
                  <div className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={onRotate} disabled={rotating}>
                      {rotating ? (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 size-3" />
                      )}
                      {t('admin.surveys.keyDialog.rotateConfirm')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRotateConfirm(false)}
                      disabled={rotating}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRotateConfirm(true)}
                className="w-full"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                {t('admin.surveys.keyDialog.rotateButton')}
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
