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
        <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-center">
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
      <section className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-2xl font-bold">{t('home.intro.title')}</h2>
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          {t('home.intro.text')}
        </p>
      </section>

      {/* Highlights */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold">{t('home.highlights.title')}</h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-lg bg-card p-8 shadow-sm">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <GraduationCap className="size-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t('home.highlights.student.title')}</h3>
            <p className="text-base leading-relaxed text-muted-foreground">{t('home.highlights.student.text')}</p>
          </div>
          <div className="rounded-lg bg-card p-8 shadow-sm">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="size-6 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t('home.highlights.lecturer.title')}</h3>
            <p className="text-base leading-relaxed text-muted-foreground">{t('home.highlights.lecturer.text')}</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="mb-8 text-center text-2xl font-bold">{t('home.faq.title')}</h2>
        <Accordion type="single" collapsible className="divide-y divide-border border-y border-border">
          {faqItems.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-none py-1">
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
