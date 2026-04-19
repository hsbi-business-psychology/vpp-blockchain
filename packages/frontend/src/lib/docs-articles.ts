import {
  Rocket,
  MousePointerClick,
  ShieldCheck,
  GraduationCap,
  ClipboardList,
  LayoutDashboard,
  Users,
  CheckCircle2,
  Blocks,
  KeyRound,
  FileCode2,
  Layers,
  Info,
  Building2,
  Lock,
  LifeBuoy,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

export interface DocsArticle {
  slug: string
  category: 'students' | 'lecturers' | 'basics' | 'project'
  icon: LucideIcon
}

export const DOCS_CATEGORIES = ['students', 'lecturers', 'basics', 'project'] as const

export const DOCS_ARTICLES: DocsArticle[] = [
  { slug: 'getting-started', category: 'students', icon: Rocket },
  { slug: 'claim-process', category: 'students', icon: MousePointerClick },
  { slug: 'wallet-security', category: 'students', icon: ShieldCheck },
  { slug: 'wallet-recovery', category: 'students', icon: LifeBuoy },
  { slug: 'thesis-submission', category: 'students', icon: GraduationCap },

  { slug: 'survey-management', category: 'lecturers', icon: ClipboardList },
  { slug: 'admin-dashboard', category: 'lecturers', icon: LayoutDashboard },
  { slug: 'role-management', category: 'lecturers', icon: Users },
  { slug: 'submission-tracking', category: 'lecturers', icon: CheckCircle2 },

  { slug: 'what-is-blockchain', category: 'basics', icon: Blocks },
  { slug: 'cryptography', category: 'basics', icon: KeyRound },
  { slug: 'smart-contracts', category: 'basics', icon: FileCode2 },
  { slug: 'base-l2', category: 'basics', icon: Layers },

  { slug: 'about', category: 'project', icon: Info },
  { slug: 'for-universities', category: 'project', icon: Building2 },
  { slug: 'security-privacy', category: 'project', icon: Lock },
  { slug: 'faq', category: 'project', icon: HelpCircle },
]

export function getArticle(slug: string): DocsArticle | undefined {
  return DOCS_ARTICLES.find((a) => a.slug === slug)
}

export function getArticlesByCategory(category: string): DocsArticle[] {
  return DOCS_ARTICLES.filter((a) => a.category === category)
}
