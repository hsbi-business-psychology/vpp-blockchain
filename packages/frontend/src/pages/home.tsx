import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight, Eye, Globe, ShieldCheck, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const featureIcons = {
  transparent: Eye,
  noExtensions: Zap,
  costEfficient: Globe,
  openSource: ShieldCheck,
} as const

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const features = ['transparent', 'noExtensions', 'costEfficient', 'openSource'] as const

  return (
    <div className="mx-auto max-w-4xl space-y-16 py-8 md:py-16">
      {/* Hero */}
      <section className="space-y-6 text-center">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
          Base L2 Blockchain
        </div>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          {t('home.hero.title')}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
          {t('home.hero.subtitle')}
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={() => navigate('/wallet')} className="w-full sm:w-auto">
            {t('home.hero.cta.wallet')}
            <ArrowRight className="ml-2 size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate('/points')}
            className="w-full sm:w-auto"
          >
            {t('home.hero.cta.points')}
          </Button>
        </div>
      </section>

      {/* Feature cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        {features.map((key) => {
          const Icon = featureIcons[key]
          return (
            <Card key={key} className="transition-colors hover:border-primary/30">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{t(`home.features.${key}.title`)}</CardTitle>
                <CardDescription>{t(`home.features.${key}.description`)}</CardDescription>
              </CardHeader>
            </Card>
          )
        })}
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Create Wallet',
              description: 'Generate a wallet in your browser — no signup, no extensions.',
            },
            {
              step: '2',
              title: 'Complete Survey',
              description: 'Participate in a survey. You\'ll receive a unique claim link.',
            },
            {
              step: '3',
              title: 'Claim Points',
              description: 'Sign the claim with your wallet. Points are recorded on-chain.',
            },
          ].map(({ step, title, description }) => (
            <div key={step} className="relative flex flex-col items-center text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {step}
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
