import { ColumnDef, ExpandedState } from '@tanstack/react-table'
import { format, isSameDay, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock, Plus } from 'lucide-react'
import * as React from 'react'
import { useMemo } from 'react'

import { DataTable } from '@/components/time-entries-table/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntrySuggestionBanner } from '@/pages/time-entries/components/time-entry-suggestion-banner'
import {
  formatSecondsToHMDisplay,
  groupByIssue,
  sortFlatEntries,
  SuggestionRow,
} from '@/pages/time-entries/lib/time-entries-utils'

interface TimeEntriesDayCardProps {
  day: Date
  entries: SyncTimeEntryRxDBDTO[]
  draftEntries?: SuggestionRow[]
  tempData?: Record<string, Partial<SyncTimeEntryRxDBDTO>>
  columns: ColumnDef<SuggestionRow>[]
  expandedRows: ExpandedState
  onExpandedChange: React.Dispatch<React.SetStateAction<ExpandedState>>
  isGrouped?: boolean
  isPulling?: boolean
  onAcceptAllSuggestions?: (rows: SuggestionRow[]) => void
  onDismissAllSuggestions?: (rows: SuggestionRow[]) => void
  onAddNewEntry?: (day: Date) => void
  onRowDoubleClick?: (row: SuggestionRow) => void
}

export const TimeEntriesDayCard = React.memo(function TimeEntriesDayCard({
  day,
  entries,
  draftEntries = [],
  tempData,
  columns,
  expandedRows,
  onExpandedChange,
  isGrouped = true,
  isPulling = false,
  onAcceptAllSuggestions,
  onDismissAllSuggestions,
  onAddNewEntry,
  onRowDoubleClick,
}: TimeEntriesDayCardProps) {
  const dayEntries: SuggestionRow[] = useMemo(() => {
    const safeTemp = tempData ?? {}

    const persisted: SuggestionRow[] = entries
      .filter((e) => {
        const dateStr = e.startDate || e.createdAt
        return Boolean(dateStr && isSameDay(parseISO(dateStr), day))
      })
      .map((e) => {
        const changes = safeTemp[e.id] ?? {}
        return {
          ...e,
          ...changes,
          isSuggestion: e.timeStatus === 'suggestion',
        }
      })

    const drafts: SuggestionRow[] = draftEntries
      .filter((d) => {
        const dateStr = d.startDate || d.createdAt
        return Boolean(dateStr && isSameDay(parseISO(dateStr), day))
      })
      .map((d) => {
        const changes = safeTemp[d.id] ?? {}
        return {
          ...d,
          ...changes,
        }
      })

    const combined = [...persisted, ...drafts]
    const seen = new Set<string>()
    return combined.filter((item) => {
      if (!item.id || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [entries, draftEntries, tempData, day])

  const groupedData = useMemo(() => {
    if (!isGrouped) return sortFlatEntries(dayEntries)
    return groupByIssue(dayEntries)
  }, [dayEntries, isGrouped])

  const suggestions = useMemo(() => {
    return dayEntries.filter((e) => e.isSuggestion)
  }, [dayEntries])

  const totalDaySeconds = useMemo(() => {
    return dayEntries
      .filter((e) => !e.isSuggestion && !e.isDraft)
      .reduce((acc, curr) => acc + (curr.timeSpent || 0) * 3600, 0)
  }, [dayEntries])

  const formattedDayTitle = useMemo(() => {
    const formatted = format(day, "EEEE, d 'de' MMMM", { locale: ptBR })
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }, [day])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold tracking-tight">
            {formattedDayTitle}
          </h3>
          <span className="text-muted-foreground font-mono text-xs">
            {format(day, 'dd/MM/yyyy')}
          </span>
          {isPulling && (
            <span
              className="relative flex h-2 w-2"
              title="Sincronizando apontamentos..."
            >
              <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onAddNewEntry && (
            <Button
              variant="link"
              size="sm"
              onClick={() => onAddNewEntry(day)}
              title="Adicionar novo apontamento"
            >
              <Plus className="h-3 w-3" />
              <span>Adicionar</span>
            </Button>
          )}

          <Badge
            variant={totalDaySeconds > 0 ? 'secondary' : 'outline'}
            className="flex items-center gap-1 font-mono text-xs font-medium"
          >
            <Clock className="h-3 w-3 opacity-70" />
            <span>{formatSecondsToHMDisplay(totalDaySeconds)}</span>
          </Badge>
        </div>
      </div>

      <TimeEntrySuggestionBanner
        count={suggestions.length}
        suggestions={suggestions}
        onAcceptAll={
          onAcceptAllSuggestions
            ? () => onAcceptAllSuggestions(suggestions)
            : undefined
        }
        onDismissAll={
          onDismissAllSuggestions
            ? () => onDismissAllSuggestions(suggestions)
            : undefined
        }
      />

      <DataTable
        columns={columns}
        data={groupedData}
        expanded={expandedRows}
        onExpandedChange={onExpandedChange}
        onRowDoubleClick={onRowDoubleClick}
        getRowClassName={(row, depth) => {
          const isGroup = (row.subRows?.length ?? 0) > 1
          const hasRunningChild = row.subRows?.some(
            (s) => s.timeStatus === 'running',
          )
          const hasPausedChild = row.subRows?.some(
            (s) => s.timeStatus === 'paused',
          )

          // 1. Linha Mestre de Grupo
          if (isGroup) {
            if (hasRunningChild) {
              return 'bg-muted/50 hover:bg-muted/70 dark:bg-muted/40 dark:hover:bg-muted/60 font-semibold border-y border-border/60 border-l-4 border-l-primary transition-colors'
            }
            if (hasPausedChild) {
              return 'bg-muted/50 hover:bg-muted/70 dark:bg-muted/40 dark:hover:bg-muted/60 font-semibold border-y border-border/60 border-l-4 border-l-amber-500 transition-colors'
            }
            return 'bg-muted/40 hover:bg-muted/60 dark:bg-muted/30 dark:hover:bg-muted/50 font-semibold border-y border-border/60 transition-colors'
          }

          // 2. Apontamento Rodando
          if (row.timeStatus === 'running') {
            return 'bg-primary/10 dark:bg-primary/15 border-l-4 border-l-primary font-medium hover:bg-primary/15 transition-colors shadow-xs'
          }

          // 3. Apontamento Pausado
          if (row.timeStatus === 'paused') {
            return 'bg-amber-500/10 dark:bg-amber-500/15 border-l-4 border-l-amber-500 font-medium hover:bg-amber-500/15 transition-colors shadow-xs'
          }

          // 4. Linha de Sugestão (Ghostline com borda tracejada e destaque âmbar com lâmpada)
          if (row.isSuggestion || row.timeStatus === 'suggestion') {
            return 'bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary border-y border-dashed border-primary/30 text-foreground font-medium hover:bg-primary/10 transition-all shadow-xs'
          }

          // 4. Sublinhas de grupo (filhas dentro de grupo expandido)
          if (depth > 0) {
            return 'bg-background/40 hover:bg-muted/20 text-muted-foreground/90 transition-colors'
          }

          // 5. Apontamento Único (registro único para tarefa, depth === 0)
          // Destaque alinhado à linha mestre, diferenciando com clareza das sublinhas
          return 'bg-muted/25 hover:bg-muted/45 dark:bg-muted/20 dark:hover:bg-muted/35 font-medium border-y border-border/40 transition-colors'
        }}
      />
    </div>
  )
})
