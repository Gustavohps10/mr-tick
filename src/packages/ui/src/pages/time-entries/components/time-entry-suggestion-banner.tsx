import { CheckCheck, Sparkles, X } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AddonSourceInfo } from '@/local-db/schemas/time-entries-sync-schema'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'

interface TimeEntrySuggestionBannerProps {
  count: number
  suggestions?: SuggestionRow[]
  onAcceptAll?: () => void
  onDismissAll?: () => void
}

export function TimeEntrySuggestionBanner({
  count,
  suggestions = [],
  onAcceptAll,
  onDismissAll,
}: TimeEntrySuggestionBannerProps) {
  if (count <= 0) return null

  const uniqueSources = useMemo(() => {
    const map = new Map<string, AddonSourceInfo>()
    suggestions.forEach((s) => {
      if (s.addonSource?.name) {
        map.set(s.addonSource.pluginId || s.addonSource.name, s.addonSource)
      } else if (s.source) {
        map.set(s.source, {
          pluginId: s.source,
          name: s.source,
        })
      }
    })
    return Array.from(map.values())
  }, [suggestions])

  const visibleSources =
    uniqueSources.length > 3 ? uniqueSources.slice(0, 2) : uniqueSources
  const remainingSources =
    uniqueSources.length > 3 ? uniqueSources.slice(2) : []

  return (
    <div className="bg-primary/5 border-primary/20 text-foreground flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-full">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-foreground text-xs font-semibold">
            {count === 1
              ? '1 sugestão de apontamento gerada por:'
              : `${count} sugestões de apontamento geradas por:`}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {visibleSources.map((source) => {
              const displayName = source.name || source.pluginId
              const key = source.pluginId || displayName
              return (
                <div
                  key={key}
                  className="border-border/70 bg-background/80 text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs"
                >
                  {source.imageUrl ? (
                    <img
                      src={source.imageUrl}
                      alt={displayName}
                      className="h-3.5 w-3.5 rounded-sm object-cover"
                    />
                  ) : (
                    <Sparkles className="text-primary h-3.5 w-3.5" />
                  )}
                  <span>@{displayName.toLowerCase().replace(/\s+/g, '')}</span>
                </div>
              )
            })}

            {remainingSources.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/70 bg-background/80 hover:bg-accent h-6 px-2 text-[11px] font-medium shadow-2xs"
                  >
                    <span>More (+{remainingSources.length})</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <p className="text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
                    Fontes de sugestão
                  </p>
                  <div className="mt-1 flex flex-col gap-1">
                    {uniqueSources.map((source) => {
                      const displayName = source.name || source.pluginId
                      const key = source.pluginId || displayName
                      return (
                        <div
                          key={key}
                          className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                        >
                          {source.imageUrl ? (
                            <img
                              src={source.imageUrl}
                              alt={displayName}
                              className="h-4 w-4 rounded-sm object-cover"
                            />
                          ) : (
                            <Sparkles className="text-primary h-4 w-4" />
                          )}
                          <span className="text-foreground font-medium">
                            @{displayName.toLowerCase().replace(/\s+/g, '')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onAcceptAll && (
          <Button
            size="sm"
            variant="default"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={onAcceptAll}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span>Aceitar Todas</span>
          </Button>
        )}
        {onDismissAll && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 gap-1.5 px-2 text-xs"
            onClick={onDismissAll}
          >
            <X className="h-3.5 w-3.5" />
            <span>Descartar</span>
          </Button>
        )}
      </div>
    </div>
  )
}
