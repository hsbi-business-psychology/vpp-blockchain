import { useTranslation } from 'react-i18next'
import { Info, AlertTriangle, Lightbulb, CheckCircle2 } from 'lucide-react'
import { getArticle } from '@/lib/docs-articles'
import { DocsDiagram } from './diagrams'

interface TextSection {
  type: 'text'
  heading?: string
  content: string
}

interface StepsSection {
  type: 'steps'
  heading?: string
  steps: Array<{ title: string; text: string }>
}

interface CalloutSection {
  type: 'callout'
  variant: 'info' | 'warning' | 'tip' | 'success'
  content: string
}

interface ListSection {
  type: 'list'
  heading?: string
  items: string[]
}

interface DiagramSection {
  type: 'diagram'
  diagramId: string
  caption?: string
}

type ArticleSection = TextSection | StepsSection | CalloutSection | ListSection | DiagramSection

const calloutStyles = {
  info: { icon: Info, bg: 'bg-primary/5', border: 'border-primary/20', text: 'text-primary' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-500/5', border: 'border-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  tip: { icon: Lightbulb, bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  success: { icon: CheckCircle2, bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
}

function RenderSection({ section, index }: { section: ArticleSection; index: number }) {
  switch (section.type) {
    case 'text':
      return (
        <div key={index}>
          {section.heading && <h2 className="mb-3 text-xl font-semibold">{section.heading}</h2>}
          <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line">
            {section.content.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      )

    case 'steps':
      return (
        <div key={index}>
          {section.heading && <h2 className="mb-4 text-xl font-semibold">{section.heading}</h2>}
          <ol className="space-y-4">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'callout': {
      const style = calloutStyles[section.variant]
      const Icon = style.icon
      return (
        <div key={index} className={`flex gap-3 rounded-lg border ${style.border} ${style.bg} p-4`}>
          <Icon className={`mt-0.5 size-5 shrink-0 ${style.text}`} />
          <p className="text-sm leading-relaxed">{section.content}</p>
        </div>
      )
    }

    case 'list':
      return (
        <div key={index}>
          {section.heading && <h2 className="mb-3 text-xl font-semibold">{section.heading}</h2>}
          <ul className="space-y-2 pl-1">
            {section.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-[15px] text-muted-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )

    case 'diagram':
      return (
        <div key={index} className="my-2">
          <DocsDiagram diagramId={section.diagramId} />
          {section.caption && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{section.caption}</p>
          )}
        </div>
      )

    default:
      return null
  }
}

export function ArticleRenderer({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const article = getArticle(slug)

  if (!article) return null

  const Icon = article.icon
  const title = t(`docs.articles.${slug}.title`)
  const description = t(`docs.articles.${slug}.description`)
  const sections = t(`docs.articles.${slug}.sections`, { returnObjects: true }) as ArticleSection[]

  return (
    <article className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
            <Icon className="size-4 text-primary" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t(`docs.categories.${article.category}`)}
          </span>
        </div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </header>

      <hr className="border-border" />

      {Array.isArray(sections) &&
        sections.map((section, i) => <RenderSection key={i} section={section} index={i} />)}
    </article>
  )
}
