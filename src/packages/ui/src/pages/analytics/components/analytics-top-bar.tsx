import { BarChart3, LayoutGrid, Plus, RefreshCw, Workflow } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

import { DatePickerWithRange } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type {
  AnalyticsSpaceConfig,
  CanvasLayerMode,
} from '../lib/analytics-types'

export interface AnalyticsTopBarProps {
  spaces: AnalyticsSpaceConfig[]
  activeSpace: AnalyticsSpaceConfig
  layerMode: CanvasLayerMode
  dateRange: DateRange | undefined
  isFetchingLive: boolean
  onSelectSpace: (spaceId: string) => void
  onOpenNewSpaceModal: () => void
  onDateRangeChange: (nextRange: DateRange | undefined) => void
  onSyncAllSources: () => void
  onSetLayerMode: (mode: CanvasLayerMode) => void
}

export function AnalyticsTopBar({
  spaces,
  activeSpace,
  layerMode,
  dateRange,
  isFetchingLive,
  onSelectSpace,
  onOpenNewSpaceModal,
  onDateRangeChange,
  onSyncAllSources,
  onSetLayerMode,
}: AnalyticsTopBarProps) {
  let frontVariant: 'default' | 'ghost' = 'ghost'

  if (layerMode === 'front') frontVariant = 'default'

  let backVariant: 'default' | 'ghost' = 'ghost'

  if (layerMode === 'background') backVariant = 'default'

  return (
    <>
      <div className="bg-card/90 border-border/70 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {spaces.map((spaceItem) => {
            let itemVariant: 'default' | 'outline' = 'outline'

            if (spaceItem.id === activeSpace.id) itemVariant = 'default'

            return (
              <Button
                key={spaceItem.id}
                size="sm"
                variant={itemVariant}
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={() => onSelectSpace(spaceItem.id)}
              >
                <LayoutGrid className="size-3.5" />
                {spaceItem.title}
              </Button>
            )
          })}
          <Button
            size="sm"
            variant="ghost"
            className="border-border/70 h-8 gap-1 border border-dashed text-xs"
            onClick={onOpenNewSpaceModal}
          >
            <Plus className="size-3.5" />
            Novo Espaço
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DatePickerWithRange
            date={dateRange}
            setDate={onDateRangeChange}
            className="w-auto"
          />

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={onSyncAllSources}
            disabled={isFetchingLive}
          >
            <RefreshCw
              className={cn('size-3.5', isFetchingLive && 'animate-spin')}
            />
            Sincronizar
          </Button>

          <div className="bg-muted flex items-center rounded-lg p-0.5">
            <Button
              size="sm"
              variant={frontVariant}
              className="h-7 gap-1.5 text-xs"
              onClick={() => onSetLayerMode('front')}
            >
              <BarChart3 className="size-3.5" />
              View Final (Grade Inteligente)
            </Button>
            <Button
              size="sm"
              variant={backVariant}
              className="h-7 gap-1.5 text-xs"
              onClick={() => onSetLayerMode('background')}
            >
              <Workflow className="size-3.5" />
              Background ({activeSpace.workflowNodes.length} Nodes)
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight">
              {activeSpace.title}
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              {activeSpace.badge}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            {activeSpace.subtitle}
          </p>
        </div>
      </div>
    </>
  )
}
