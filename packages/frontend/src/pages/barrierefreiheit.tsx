import { useTranslation } from 'react-i18next'

export default function AccessibilityPage() {
  const { t } = useTranslation()

  const nonAccessibleItems = t('accessibility.nonAccessible.items', {
    returnObjects: true,
  }) as string[]

  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="mb-1 text-3xl font-bold">{t('accessibility.title')}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t('accessibility.lastUpdated')}</p>

      <section className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('accessibility.status.title')}</h2>
        <p className="mb-2 text-sm">{t('accessibility.status.text1')}</p>
        <p className="text-sm">{t('accessibility.status.text2')}</p>
      </section>

      <section className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('accessibility.nonAccessible.title')}</h2>
        <ul className="mb-3 list-inside list-disc space-y-1 text-sm">
          {nonAccessibleItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{t('accessibility.nonAccessible.text')}</p>
      </section>

      <section className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('accessibility.feedback.title')}</h2>
        <p className="mb-2 text-sm">{t('accessibility.feedback.text')}</p>
        <p className="text-sm">
          E-Mail:{' '}
          <a
            href={`mailto:${t('accessibility.feedback.email')}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('accessibility.feedback.email')}
          </a>
        </p>
      </section>

      <section className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('accessibility.enforcement.title')}</h2>
        <p className="text-sm">{t('accessibility.enforcement.text')}</p>
      </section>

      <section className="mb-8 border border-border p-6">
        <h2 className="mb-3 text-lg font-semibold">{t('accessibility.creation.title')}</h2>
        <p className="text-sm">{t('accessibility.creation.text')}</p>
      </section>
    </div>
  )
}
