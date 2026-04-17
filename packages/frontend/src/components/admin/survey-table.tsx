import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  XCircle,
  CheckCircle2,
  RefreshCw,
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  Filter,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { SurveyInfo } from '@vpp/shared'

interface SurveyTableProps {
  surveys: SurveyInfo[]
  onDownloadTemplate: (surveyId: number) => void
  onDeactivate: (surveyId: number) => void
  onReactivate?: (surveyId: number) => void
  onRegenerateTemplate?: (surveyId: number) => void
  onSelect?: (surveyId: number) => void
}

type StatusFilter = 'all' | 'active' | 'inactive'
type SortOrder = 'newest' | 'oldest'

const PAGE_SIZES = [10, 25, 50]

const statusVariant: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-destructive/10 text-destructive border-destructive/20',
}

export function SurveyTable({
  surveys,
  onDownloadTemplate,
  onDeactivate,
  onReactivate,
  onRegenerateTemplate,
  onSelect,
}: SurveyTableProps) {
  const { t } = useTranslation()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let result = [...surveys]

    if (statusFilter === 'active') result = result.filter((s) => s.active)
    else if (statusFilter === 'inactive') result = result.filter((s) => !s.active)

    result.sort((a, b) => {
      const dateA = new Date(a.registeredAt).getTime()
      const dateB = new Date(b.registeredAt).getTime()
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
    })

    return result
  }, [surveys, statusFilter, sortOrder])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const from = filtered.length === 0 ? 0 : safePage * pageSize + 1
  const to = Math.min((safePage + 1) * pageSize, filtered.length)

  if (safePage !== page) setPage(safePage)

  if (surveys.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
  }

  const getStatus = (s: SurveyInfo) => (s.active ? 'active' : 'inactive')

  return (
    <div className="space-y-3">
      {/* ─── Inline Filters (same line, compact) ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as StatusFilter)
            setPage(0)
          }}
        >
          <SelectTrigger size="sm">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.surveys.filter.all')}</SelectItem>
            <SelectItem value="active">{t('admin.surveys.filter.activeOnly')}</SelectItem>
            <SelectItem value="inactive">{t('admin.surveys.filter.inactiveOnly')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sortOrder}
          onValueChange={(v) => {
            setSortOrder(v as SortOrder)
            setPage(0)
          }}
        >
          <SelectTrigger size="sm">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t('admin.surveys.filter.newestFirst')}</SelectItem>
            <SelectItem value="oldest">{t('admin.surveys.filter.oldestFirst')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t('admin.register.surveyTitle')}</TableHead>
                  <TableHead className="text-right">{t('admin.surveys.table.points')}</TableHead>
                  <TableHead className="text-right">{t('admin.surveys.table.claims')}</TableHead>
                  <TableHead>{t('admin.surveys.table.status')}</TableHead>
                  <TableHead>{t('admin.surveys.table.created')}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((survey) => {
                  const status = getStatus(survey)
                  return (
                    <TableRow
                      key={survey.surveyId}
                      className={cn(onSelect && 'cursor-pointer hover:bg-muted/50')}
                      onClick={() => onSelect?.(survey.surveyId)}
                    >
                      <TableCell className="font-mono text-muted-foreground">
                        {survey.surveyId}
                      </TableCell>
                      <TableCell className="font-medium">
                        {survey.title || `Survey #${survey.surveyId}`}
                      </TableCell>
                      <TableCell className="text-right">{survey.points}</TableCell>
                      <TableCell className="text-right">{survey.claimCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('border', statusVariant[status])}>
                          {t(`admin.surveys.status.${status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(survey.registeredAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={t('admin.surveys.actions', 'Aktionen')}
                            >
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onDownloadTemplate(survey.surveyId)}>
                              <Download className="mr-2 size-4" />
                              {t('admin.surveys.downloadTemplate')}
                            </DropdownMenuItem>
                            {onRegenerateTemplate && (
                              <DropdownMenuItem
                                onClick={() => onRegenerateTemplate(survey.surveyId)}
                              >
                                <RefreshCw className="mr-2 size-4" />
                                {t('admin.surveys.regenerateTemplate')}
                              </DropdownMenuItem>
                            )}
                            {survey.active && (
                              <DropdownMenuItem
                                onClick={() => onDeactivate(survey.surveyId)}
                                className="text-destructive"
                              >
                                <XCircle className="mr-2 size-4" />
                                {t('admin.surveys.deactivate')}
                              </DropdownMenuItem>
                            )}
                            {!survey.active && onReactivate && (
                              <DropdownMenuItem onClick={() => onReactivate(survey.surveyId)}>
                                <CheckCircle2 className="mr-2 size-4 text-success" />
                                {t('admin.surveys.reactivate.button')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {paged.map((survey) => {
              const status = getStatus(survey)
              return (
                <div
                  key={survey.surveyId}
                  className={cn(
                    'rounded-lg border p-4 space-y-3',
                    onSelect && 'cursor-pointer hover:bg-muted/50',
                  )}
                  onClick={() => onSelect?.(survey.surveyId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {survey.title || `Survey #${survey.surveyId}`}
                      </p>
                      <p className="text-xs text-muted-foreground">ID: {survey.surveyId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('border', statusVariant[status])}>
                        {t(`admin.surveys.status.${status}`)}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t('admin.surveys.table.points')}</p>
                      <p className="font-medium">{survey.points}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('admin.surveys.table.claims')}</p>
                      <p className="font-medium">{survey.claimCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('admin.surveys.table.created')}</p>
                      <p className="font-medium">
                        {new Date(survey.registeredAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─── Pagination Footer ─── */}
          <div className="flex flex-col items-center gap-3 border-t border-border pt-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t('admin.surveys.pagination.showing', { from, to, total: filtered.length })}
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v))
                  setPage(0)
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} {t('admin.surveys.pagination.perPage')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {totalPages > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                    aria-label={t('admin.surveys.pagination.prev', 'Vorherige Seite')}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {safePage + 1}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage(safePage + 1)}
                    aria-label={t('admin.surveys.pagination.next', 'Nächste Seite')}
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
