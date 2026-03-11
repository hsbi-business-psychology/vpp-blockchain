import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface RegisterSurveyDialogProps {
  onRegister: (data: {
    surveyId: number
    points: number
    secret: string
    maxClaims: number
  }) => Promise<void>
}

export function RegisterSurveyDialog({ onRegister }: RegisterSurveyDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    surveyId: '',
    points: '',
    secret: '',
    maxClaims: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onRegister({
        surveyId: Number(form.surveyId),
        points: Number(form.points),
        secret: form.secret,
        maxClaims: Number(form.maxClaims),
      })
      setOpen(false)
      setForm({ surveyId: '', points: '', secret: '', maxClaims: '' })
    } finally {
      setLoading(false)
    }
  }

  const isValid =
    form.surveyId && form.points && form.secret && form.maxClaims &&
    Number(form.surveyId) > 0 && Number(form.points) > 0 && Number(form.maxClaims) > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          {t('admin.surveys.register')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('admin.register.title')}</DialogTitle>
            <DialogDescription>{t('admin.surveys.register')}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-surveyId">{t('admin.register.surveyId')}</Label>
              <Input
                id="reg-surveyId"
                type="number"
                min="1"
                value={form.surveyId}
                onChange={(e) => setForm((f) => ({ ...f, surveyId: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg-points">{t('admin.register.points')}</Label>
                <Input
                  id="reg-points"
                  type="number"
                  min="1"
                  max="255"
                  value={form.points}
                  onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-maxClaims">{t('admin.register.maxClaims')}</Label>
                <Input
                  id="reg-maxClaims"
                  type="number"
                  min="1"
                  value={form.maxClaims}
                  onChange={(e) => setForm((f) => ({ ...f, maxClaims: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-secret">{t('admin.register.secret')}</Label>
              <Input
                id="reg-secret"
                type="text"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                required
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!isValid || loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('admin.register.button')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
