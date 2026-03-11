import { useTranslation } from 'react-i18next'
import { Book, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { DOCS_CATEGORIES, getArticlesByCategory, type DocsArticle } from '@/lib/docs-articles'

interface DocsSidebarProps {
  activeSlug: string | undefined
  onNavigate: (slug: string) => void
}

function SidebarContent({ activeSlug, onNavigate }: DocsSidebarProps) {
  const { t } = useTranslation()

  return (
    <nav className="space-y-6">
      <button
        onClick={() => onNavigate('')}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent ${
          !activeSlug ? 'bg-accent text-primary' : 'text-foreground'
        }`}
      >
        <Book className="size-4" />
        {t('docs.nav.overview')}
      </button>

      {DOCS_CATEGORIES.map((cat) => {
        const articles = getArticlesByCategory(cat)
        return (
          <div key={cat}>
            <h4 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`docs.categories.${cat}`)}
            </h4>
            <ul className="space-y-0.5">
              {articles.map((article: DocsArticle) => {
                const Icon = article.icon
                const isActive = activeSlug === article.slug
                return (
                  <li key={article.slug}>
                    <button
                      onClick={() => onNavigate(article.slug)}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent ${
                        isActive ? 'bg-accent font-medium text-primary' : 'text-foreground'
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{t(`docs.articles.${article.slug}.title`)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

export function DesktopSidebar(props: DocsSidebarProps) {
  return (
    <aside className="hidden w-[240px] shrink-0 md:block">
      <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-4">
        <SidebarContent {...props} />
      </div>
    </aside>
  )
}

export function MobileSidebar(props: DocsSidebarProps) {
  const { t } = useTranslation()

  return (
    <div className="mb-4 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2">
            <Menu className="size-4" />
            {t('docs.nav.toc')}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] overflow-y-auto p-6">
          <SheetTitle className="mb-4 text-lg font-bold">{t('docs.nav.title')}</SheetTitle>
          <SidebarContent {...props} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
