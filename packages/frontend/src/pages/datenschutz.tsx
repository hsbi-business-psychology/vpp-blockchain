import { useTranslation } from 'react-i18next'

export default function PrivacyPage() {
  const { t } = useTranslation()

  const controllerAddr = t('privacy.sections.controller.address', {
    returnObjects: true,
  }) as string[]
  const logItems = t('privacy.sections.serverLogs.items', {
    returnObjects: true,
  }) as string[]
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
    'fonts',
    'rights',
    'security',
  ] as const

  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="mb-1 text-3xl font-bold">{t('privacy.title')}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t('privacy.lastUpdated')}</p>

      <nav className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('privacy.toc')}
        </h2>
        <ol className="list-inside list-decimal space-y-1 text-sm">
          {sections.map((id) => (
            <li key={id}>
              <a href={`#${id}`} className="text-primary underline-offset-2 hover:underline">
                {t(`privacy.sections.${id}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="intro" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.intro.title')}</h2>
        <p className="mb-2 text-sm">{t('privacy.sections.intro.text1')}</p>
        <p className="text-sm">{t('privacy.sections.intro.text2')}</p>
      </section>

      <section id="controller" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.controller.title')}</h2>
        <p className="mb-3 text-sm">{t('privacy.sections.controller.text')}</p>
        <div className="mb-3 space-y-0.5 text-sm">
          {controllerAddr.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <p className="text-sm">
          E-Mail:{' '}
          <a
            href={`mailto:${t('privacy.sections.controller.email')}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('privacy.sections.controller.email')}
          </a>
        </p>
      </section>

      <section id="serverLogs" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.serverLogs.title')}</h2>
        <p className="mb-3 text-sm">{t('privacy.sections.serverLogs.text')}</p>
        <ul className="mb-3 list-inside list-disc space-y-1 text-sm">
          {logItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t('privacy.sections.serverLogs.legal')}</p>
      </section>

      <section id="cookies" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.cookies.title')}</h2>
        <p className="mb-2 text-sm">{t('privacy.sections.cookies.text1')}</p>
        <p className="text-sm">{t('privacy.sections.cookies.text2')}</p>
      </section>

      <section id="web3" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.web3.title')}</h2>
        <p className="mb-2 text-sm">{t('privacy.sections.web3.text1')}</p>
        <p className="mb-2 text-sm">{t('privacy.sections.web3.text2')}</p>
        <p className="text-sm">{t('privacy.sections.web3.text3')}</p>
      </section>

      <section id="fonts" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.fonts.title')}</h2>
        <p className="text-sm">{t('privacy.sections.fonts.text')}</p>
      </section>

      <section id="rights" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.rights.title')}</h2>
        <p className="mb-3 text-sm">{t('privacy.sections.rights.text')}</p>
        <dl className="mb-3 space-y-2">
          {rights.map((r, i) => (
            <div key={i}>
              <dt className="text-sm font-semibold">{r.name}</dt>
              <dd className="text-sm text-muted-foreground">{r.desc}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">{t('privacy.sections.rights.complaint')}</p>
      </section>

      <section id="security" className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('privacy.sections.security.title')}</h2>
        <p className="text-sm">{t('privacy.sections.security.text')}</p>
      </section>
    </div>
  )
}
