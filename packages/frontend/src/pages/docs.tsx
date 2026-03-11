import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { DesktopSidebar, MobileSidebar } from '@/components/docs/docs-sidebar'
import { ArticleRenderer } from '@/components/docs/article-renderer'
import { DOCS_CATEGORIES, getArticlesByCategory, getArticle } from '@/lib/docs-articles'

function DocsOverview({ onNavigate }: { onNavigate: (slug: string) => void }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t('docs.nav.title')}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{t('docs.nav.subtitle')}</p>
      </div>

      {DOCS_CATEGORIES.map((cat) => {
        const articles = getArticlesByCategory(cat)
        return (
          <section key={cat}>
            <h2 className="mb-4 text-xl font-semibold">{t(`docs.categories.${cat}`)}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {articles.map((article) => {
                const Icon = article.icon
                return (
                  <button
                    key={article.slug}
                    onClick={() => onNavigate(article.slug)}
                    className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold group-hover:text-primary">
                        {t(`docs.articles.${article.slug}.title`)}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {t(`docs.articles.${article.slug}.description`)}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default function DocsPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const article = slug ? getArticle(slug) : undefined

  const handleNavigate = (s: string) => {
    if (s) {
      navigate(`/docs/${s}`)
    } else {
      navigate('/docs')
    }
    window.scrollTo(0, 0)
  }

  const allArticles = DOCS_CATEGORIES.flatMap(getArticlesByCategory)
  const currentIndex = article ? allArticles.findIndex((a) => a.slug === article.slug) : -1
  const prevArticle = currentIndex > 0 ? allArticles[currentIndex - 1] : null
  const nextArticle = currentIndex >= 0 && currentIndex < allArticles.length - 1 ? allArticles[currentIndex + 1] : null

  return (
    <div className="flex gap-8">
      <DesktopSidebar activeSlug={slug} onNavigate={handleNavigate} />
      <div className="min-w-0 flex-1">
        <MobileSidebar activeSlug={slug} onNavigate={handleNavigate} />
        {slug && !article ? (
          <div className="space-y-4 py-12 text-center">
            <h1 className="text-2xl font-bold">{t('docs.notFound.title')}</h1>
            <p className="text-muted-foreground">{t('docs.notFound.description')}</p>
            <button
              onClick={() => handleNavigate('')}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('docs.notFound.back')}
            </button>
          </div>
        ) : slug && article ? (
          <div className="space-y-8">
            <ArticleRenderer slug={slug} />

            <div className="flex items-center justify-between border-t border-border pt-6">
              {prevArticle ? (
                <button
                  onClick={() => handleNavigate(prevArticle.slug)}
                  className="group text-left"
                >
                  <span className="text-xs text-muted-foreground">{t('docs.nav.prev')}</span>
                  <p className="text-sm font-medium text-primary group-hover:underline">
                    {t(`docs.articles.${prevArticle.slug}.title`)}
                  </p>
                </button>
              ) : <div />}
              {nextArticle ? (
                <button
                  onClick={() => handleNavigate(nextArticle.slug)}
                  className="group text-right"
                >
                  <span className="text-xs text-muted-foreground">{t('docs.nav.next')}</span>
                  <p className="text-sm font-medium text-primary group-hover:underline">
                    {t(`docs.articles.${nextArticle.slug}.title`)}
                  </p>
                </button>
              ) : <div />}
            </div>
          </div>
        ) : (
          <DocsOverview onNavigate={handleNavigate} />
        )}
      </div>
    </div>
  )
}
