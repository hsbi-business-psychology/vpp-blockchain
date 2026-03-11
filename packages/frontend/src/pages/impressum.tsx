import { useTranslation } from 'react-i18next'

export default function ImprintPage() {
  const { t } = useTranslation()

  const address = t('imprint.provider.address', { returnObjects: true }) as string[]
  const contact = t('imprint.provider.contact', { returnObjects: true }) as Array<{
    label: string
    value: string
    href: string
  }>
  const contentRespAddr = t('imprint.contentResp.address', { returnObjects: true }) as string[]

  return (
    <div className="mx-auto max-w-[800px] space-y-10">
      <div>
        <h1 className="mb-1 text-3xl font-bold">{t('imprint.title')}</h1>
        <p className="text-base text-muted-foreground">{t('imprint.lastUpdated')}</p>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('imprint.provider.title')}</h2>
        <div className="mb-3 space-y-0.5 text-base">
          {address.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <div className="space-y-1 text-base">
          {contact.map((c, i) => (
            <p key={i}>
              {c.label}:{' '}
              <a href={c.href} className="text-primary underline-offset-2 hover:underline">
                {c.value}
              </a>
            </p>
          ))}
        </div>
      </section>

      <hr className="border-border" />

      <Section title={t('imprint.legalForm.title')} text={t('imprint.legalForm.text')} />
      <Section title={t('imprint.representation.title')} text={t('imprint.representation.text')} />
      <Section title={t('imprint.supervisory.title')} text={t('imprint.supervisory.text')} />
      <Section title={t('imprint.vat.title')} text={t('imprint.vat.text')} />

      <hr className="border-border" />

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('imprint.contentResp.title')}</h2>
        <div className="space-y-0.5 text-base">
          {contentRespAddr.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </section>

      <hr className="border-border" />

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('imprint.copyright.title')}</h2>
        <p className="mb-2 text-base">{t('imprint.copyright.text1')}</p>
        <p className="text-base">{t('imprint.copyright.text2')}</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('imprint.liability.title')}</h2>
        <h3 className="mb-2 text-base font-semibold">{t('imprint.liability.own.title')}</h3>
        <p className="mb-4 text-base">{t('imprint.liability.own.text')}</p>
        <h3 className="mb-2 text-base font-semibold">{t('imprint.liability.external.title')}</h3>
        <p className="mb-2 text-base">{t('imprint.liability.external.text1')}</p>
        <p className="text-base">{t('imprint.liability.external.text2')}</p>
      </section>
    </div>
  )
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      <p className="text-base">{text}</p>
    </section>
  )
}
