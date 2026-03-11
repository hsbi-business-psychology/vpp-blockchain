import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <h1 className="mt-4 text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('notFound.description')}</p>
      <Button className="mt-6" onClick={() => navigate('/')}>
        <Home className="mr-2 size-4" aria-hidden="true" />
        {t('notFound.back')}
      </Button>
    </div>
  )
}
