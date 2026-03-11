import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight, GraduationCap, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const badges = t('home.hero.badges', { returnObjects: true }) as string[]
  const faqItems = t('home.faq.items', { returnObjects: true }) as Array<{
    q: string
    a: string
  }>

  return (
    <div className="space-y-20 py-8 md:py-16">
      {/* Hero */}
      <section className="space-y-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
          {t('home.hero.title')}
        </h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
          {t('home.hero.subtitle')}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {badges.map((badge) => (
            <span
              key={badge}
              className="inline-block border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
            >
              {badge}
            </span>
          ))}
        </div>
        <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={() => navigate('/points')} className="w-full sm:w-auto">
            {t('home.hero.ctaStudent')}
            <ArrowRight className="ml-2 size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate('/admin')}
            className="w-full sm:w-auto"
          >
            {t('home.hero.ctaAdmin')}
          </Button>
        </div>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-2xl font-bold">{t('home.intro.title')}</h2>
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          {t('home.intro.text')}
        </p>
      </section>

      {/* Highlights */}
      <section>
        <h2 className="mb-6 text-2xl font-bold">{t('home.highlights.title')}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border border-border p-6">
            <div className="mb-3 flex size-10 items-center justify-center bg-primary/10">
              <GraduationCap className="size-5 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t('home.highlights.student.title')}</h3>
            <p className="text-base text-muted-foreground">{t('home.highlights.student.text')}</p>
          </div>
          <div className="border border-border p-6">
            <div className="mb-3 flex size-10 items-center justify-center bg-primary/10">
              <Users className="size-5 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t('home.highlights.lecturer.title')}</h3>
            <p className="text-base text-muted-foreground">{t('home.highlights.lecturer.text')}</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl">
        <h2 className="mb-6 text-2xl font-bold">{t('home.faq.title')}</h2>
        <Accordion type="single" collapsible className="border border-border">
          {faqItems.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="px-6">
              <AccordionTrigger className="text-base">{item.q}</AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  )
}
