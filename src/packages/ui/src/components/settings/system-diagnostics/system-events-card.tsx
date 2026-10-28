import type {
  DiagnosticEvent,
  DiagnosticEventLevel,
} from '@mr-tick/application'
import { ListFilter, Search } from 'lucide-react'
import React, { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SystemEventsCardProps {
  events: DiagnosticEvent[]
  discardedEventsCount: number
}

function getLevelBadge(level: DiagnosticEventLevel) {
  switch (level) {
    case 'error':
      return (
        <Badge variant="destructive" className="text-[10px]">
          ERRO
        </Badge>
      )
    case 'warn':
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
        >
          AVISO
        </Badge>
      )
    case 'info':
      return (
        <Badge variant="secondary" className="text-[10px]">
          INFO
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[10px]">
          {level}
        </Badge>
      )
  }
}

export function SystemEventsCard({
  events,
  discardedEventsCount,
}: SystemEventsCardProps) {
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (levelFilter !== 'all' && ev.level !== levelFilter) return false

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const matchMessage = ev.message.toLowerCase().includes(query)
        const matchStage = ev.stage.toLowerCase().includes(query)
        const matchOrigin = ev.origin.toLowerCase().includes(query)
        const matchCode = ev.code
          ? ev.code.toLowerCase().includes(query)
          : false

        if (!matchMessage && !matchStage && !matchOrigin && !matchCode) {
          return false
        }
      }

      return true
    })
  }, [events, levelFilter, searchQuery])

  return (
    <div
      data-testid="system-events-card"
      className="border-border/60 bg-card rounded-lg border p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <ListFilter className="text-primary size-4" />
          <h3 className="text-foreground text-sm font-semibold">
            Registro de Eventos de Diagnóstico
          </h3>
          <Badge variant="secondary" className="text-[10px]">
            {events.length} eventos
          </Badge>
        </div>

        {discardedEventsCount > 0 && (
          <Badge
            data-testid="discarded-events-badge"
            variant="outline"
            className="border-destructive/40 text-destructive text-[10px]"
          >
            {discardedEventsCount} descartados por limite de buffer
          </Badge>
        )}
      </div>

      {/* Controles de Filtro */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            data-testid="events-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar eventos por mensagem, estágio ou código..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger
            data-testid="events-level-filter"
            className="h-8 w-[130px] text-xs"
          >
            <SelectValue placeholder="Nível" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Níveis</SelectItem>
            <SelectItem value="error">Erros</SelectItem>
            <SelectItem value="warn">Avisos</SelectItem>
            <SelectItem value="info">Informações</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista Rolável de Eventos */}
      <div className="border-border/50 mt-3 rounded-md border">
        <ScrollArea className="h-[220px]">
          {filteredEvents.length === 0 ? (
            <div className="text-muted-foreground p-6 text-center text-xs">
              Nenhum evento corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="divide-border/40 divide-y font-mono text-xs">
              {filteredEvents.map((ev) => (
                <div
                  key={`${ev.sequence}-${ev.timestamp}`}
                  data-testid={`event-item-${ev.sequence}`}
                  className="hover:bg-muted/30 flex items-start gap-3 p-2.5 transition-colors"
                >
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    #{ev.sequence}
                  </span>

                  <div className="shrink-0">{getLevelBadge(ev.level)}</div>

                  <div className="min-w-0 flex-1 font-sans">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground text-xs leading-relaxed font-medium">
                        {ev.message}
                      </span>
                      {ev.code && (
                        <Badge
                          variant="outline"
                          className="px-1 py-0 font-mono text-[9px]"
                        >
                          {ev.code}
                        </Badge>
                      )}
                    </div>

                    <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-[10px] leading-normal">
                      <span>Origem: {ev.origin}</span>
                      <span>·</span>
                      <span>Estágio: {ev.stage}</span>
                      {ev.generation && (
                        <>
                          <span>·</span>
                          <span>Geração: {ev.generation}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
