import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight, GraduationCap, Users, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

function FadeIn({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => el.classList.add('is-visible'), delay)
          observer.unobserve(el)
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  return (
    <div ref={ref} className={`fade-in-section ${className}`}>
      {children}
    </div>
  )
}

function MacBookMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[540px]">
      <div className="rounded-t-xl border border-border/60 bg-neutral-800 p-2.5 pb-0 shadow-2xl dark:bg-neutral-900 dark:border-neutral-700">
        <div className="mx-auto mb-2 size-1.5 rounded-full bg-neutral-600 dark:bg-neutral-500" />
        <div className="overflow-hidden rounded-t-md bg-black">
          <img
            src="/screenshots/student-transactions.png"
            alt="VPP Blockchain – Transaktionsverlauf"
            width={678}
            height={541}
            className="block w-full"
            loading="eager"
          />
        </div>
      </div>
      <div className="relative z-10 h-3 rounded-b-sm border-x border-b border-border/60 bg-gradient-to-b from-neutral-700 to-neutral-800 dark:from-neutral-800 dark:to-neutral-900 dark:border-neutral-700">
        <div className="absolute left-1/2 top-0 h-1 w-16 -translate-x-1/2 rounded-b-sm bg-neutral-600 dark:bg-neutral-500" />
      </div>
      <div className="mx-[-3%] h-1.5 rounded-b-xl bg-gradient-to-b from-neutral-700 to-neutral-800 dark:from-neutral-800 dark:to-neutral-900 border border-border/40 border-t-0 dark:border-neutral-700" />
      <div className="absolute -inset-8 -z-10 rounded-3xl bg-primary/5 blur-3xl dark:bg-primary/10" />
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="space-y-20 pb-8 pt-2 md:pb-16 md:pt-4">
      {/* Hero – split layout on desktop */}
      <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <FadeIn>
          <div className="space-y-6 text-center lg:text-left">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
              {t('home.hero.title')}
            </h1>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg lg:mx-0">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center lg:justify-start">
              <Button size="lg" onClick={() => navigate('/points')} className="w-full sm:w-auto">
                {t('home.hero.ctaStudent')}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
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
          </div>
        </FadeIn>

        <FadeIn delay={150}>
          <div className="flex justify-center lg:justify-end">
            <MacBookMockup />
          </div>
        </FadeIn>
      </section>

      {/* Intro */}
      <FadeIn>
        <section className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-bold">{t('home.intro.title')}</h2>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            {t('home.intro.text')}
          </p>
        </section>
      </FadeIn>

      {/* Highlights */}
      <section>
        <FadeIn>
          <h2 className="mb-6 text-center text-2xl font-bold">{t('home.highlights.title')}</h2>
        </FadeIn>
        <div className="grid gap-8 md:grid-cols-2">
          <FadeIn delay={0}>
            <div className="rounded-lg bg-card p-8 shadow-sm">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <GraduationCap className="size-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{t('home.highlights.student.title')}</h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {t('home.highlights.student.text')}
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={120}>
            <div className="rounded-lg bg-card p-8 shadow-sm">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="size-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{t('home.highlights.lecturer.title')}</h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {t('home.highlights.lecturer.text')}
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Docs CTA */}
      <FadeIn>
        <section className="mx-auto max-w-2xl text-center">
          <h2 className="mb-3 text-2xl font-bold">{t('home.docsCta.title')}</h2>
          <p className="mb-6 text-base text-muted-foreground md:text-lg">
            {t('home.docsCta.text')}
          </p>
          <Button variant="outline" size="lg" onClick={() => navigate('/docs')}>
            <BookOpen className="mr-2 size-4" aria-hidden="true" />
            {t('home.docsCta.button')}
          </Button>
        </section>
      </FadeIn>
    </div>
  )
}
