import type { AddonSourceInfo } from '@mr-tick/application'
import { Sparkles } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface AddonSourceProvenanceBadgeProps {
  source?: AddonSourceInfo | null
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  open?: boolean
}

export function AddonSourceProvenanceBadge({
  source,
  className = '',
  side = 'right',
  open,
}: AddonSourceProvenanceBadgeProps) {
  if (!source) return null

  const displayName = source.name || source.pluginId || 'Addon'
  const sourceHandle = `@${displayName.toLowerCase().replace(/\s+/g, '')}`
  const iconUrl = source.imageUrl
  const metadataEntries = source.metadata ? Object.entries(source.metadata) : []

  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <div
          className={`border-border/70 bg-background/80 text-foreground hover:bg-muted/70 flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-md border shadow-2xs transition-all ${className}`}
          data-testid="suggestion-source-badge"
          aria-label={`Origem da sugestão: ${displayName}`}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={displayName}
              className="h-3.5 w-3.5 rounded-xs object-cover"
            />
          ) : (
            <Sparkles className="text-primary h-3 w-3" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs p-2.5 text-xs">
        <div className="text-foreground flex items-center gap-1.5 font-semibold">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={displayName}
              className="h-3.5 w-3.5 rounded-xs object-cover"
            />
          ) : (
            <Sparkles className="text-primary h-3 w-3" />
          )}
          <span>{displayName}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
          Origem: {sourceHandle}
        </p>

        {metadataEntries.length > 0 && (
          <div
            data-testid="addon-source-metadata-container"
            className="border-border/60 mt-2 flex flex-col gap-1 border-t pt-1.5 text-[10px]"
          >
            <span className="text-muted-foreground text-[9px] font-semibold tracking-wider uppercase">
              Metadados da Origem
            </span>
            {metadataEntries.map(([key, val]) => (
              <div
                key={key}
                data-testid={`addon-metadata-${key}`}
                className="bg-muted/30 flex items-center justify-between gap-2 rounded px-1.5 py-0.5"
              >
                <span className="text-muted-foreground font-mono">{key}:</span>
                <span className="text-foreground max-w-[140px] truncate font-mono font-medium">
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
