import { useTranslation } from 'react-i18next'

export default function PrivacyPage() {
  const { t } = useTranslation()

  const controllerAddr = t('privacy.sections.controller.address', {
    returnObjects: true,
  }) as string[]
  const logItems = t('privacy.sections.serverLogs.items', {
    returnObjects: true,
  }) as string[]
  const onChainItems = t('privacy.sections.web3.onChainItems', {
    returnObjects: true,
  }) as string[]
  const processors = t('privacy.sections.processors.items', {
    returnObjects: true,
  }) as Array<{ name: string; desc: string }>
  const rights = t('privacy.sections.rights.items', { returnObjects: true }) as Array<{
    name: string
    desc: string
  }>

  const sections = [
    'intro',
    'controller',
    'serverLogs',
    'cookies',
    'web3',
    'processors',
    'fonts',
    'rights',
    'security',
  ] as const

  return (
    <div className="mx-auto max-w-[800px] space-y-10">
      <div>
        <h1 className="mb-1 text-3xl font-bold">{t('privacy.title')}</h1>
        <p className="text-base text-muted-foreground">{t('privacy.lastUpdated')}</p>
      </div>

      <nav className="rounded-lg bg-muted/50 p-5">
        <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-muted-foreground">
          {t('privacy.toc')}
        </h2>
        <ol className="list-inside list-decimal space-y-1 text-base">
          {sections.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="text-primary underline-offset-2 hover:underline">
                {t(`privacy.sections.${id}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="intro">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.intro.title')}</h2>
        <p className="mb-2 text-base">{t('privacy.sections.intro.text1')}</p>
        <p className="text-base">{t('privacy.sections.intro.text2')}</p>
      </section>

      <hr className="border-border" />

      <section id="controller">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.controller.title')}</h2>
        <p className="mb-3 text-base">{t('privacy.sections.controller.text')}</p>
        <div className="mb-3 space-y-0.5 text-base">
          {controllerAddr.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <p className="text-base">
          E-Mail:{' '}
          <a
            href={`mailto:${t('privacy.sections.controller.email')}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('privacy.sections.controller.email')}
          </a>
        </p>
      </section>

      <hr className="border-border" />

      <section id="serverLogs">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.serverLogs.title')}</h2>
        <p className="mb-3 text-base">{t('privacy.sections.serverLogs.text')}</p>
        <ul className="mb-3 list-inside list-disc space-y-1 text-base">
          {logItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <p className="text-base text-muted-foreground">{t('privacy.sections.serverLogs.legal')}</p>
      </section>

      <hr className="border-border" />

      <section id="cookies">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.cookies.title')}</h2>
        <p className="mb-2 text-base">{t('privacy.sections.cookies.text1')}</p>
        <p className="text-base">{t('privacy.sections.cookies.text2')}</p>
      </section>

      <hr className="border-border" />

      <section id="web3">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.web3.title')}</h2>
        <p className="mb-4 text-base">{t('privacy.sections.web3.text1')}</p>

        <h3 className="mb-2 text-base font-semibold">{t('privacy.sections.web3.onChainTitle')}</h3>
        <p className="mb-2 text-base">{t('privacy.sections.web3.onChainIntro')}</p>
        <ul className="mb-4 list-inside list-disc space-y-1 text-base">
          {onChainItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>

        <h3 className="mb-2 text-base font-semibold">
          {t('privacy.sections.web3.immutableTitle')}
        </h3>
        <p className="mb-3 text-base">{t('privacy.sections.web3.immutableText')}</p>

        <p className="text-base text-muted-foreground">{t('privacy.sections.web3.legal')}</p>
      </section>

      <hr className="border-border" />

      <section id="processors">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.processors.title')}</h2>
        <p className="mb-3 text-base">{t('privacy.sections.processors.intro')}</p>
        <dl className="space-y-3">
          {processors.map((p, i) => (
            <div key={i}>
              <dt className="text-base font-semibold">{p.name}</dt>
              <dd className="text-base text-muted-foreground">{p.desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <hr className="border-border" />

      <section id="fonts">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.fonts.title')}</h2>
        <p className="text-base">{t('privacy.sections.fonts.text')}</p>
      </section>

      <hr className="border-border" />

      <section id="rights">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.rights.title')}</h2>
        <p className="mb-3 text-base">{t('privacy.sections.rights.text')}</p>
        <dl className="mb-3 space-y-3">
          {rights.map((r, i) => (
            <div key={i}>
              <dt className="text-base font-semibold">{r.name}</dt>
              <dd className="text-base text-muted-foreground">{r.desc}</dd>
            </div>
          ))}
        </dl>
        <p className="text-base">{t('privacy.sections.rights.complaint')}</p>
      </section>

      <hr className="border-border" />

      <section id="security">
        <h2 className="mb-3 text-xl font-semibold">{t('privacy.sections.security.title')}</h2>
        <p className="text-base">{t('privacy.sections.security.text')}</p>
      </section>
    </div>
  )
}
