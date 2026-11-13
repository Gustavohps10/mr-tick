import {
  Activity,
  BarChart3,
  CircleAlert,
  Info,
  LayoutGrid,
  Plus,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { DatePickerWithRange } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type {
  AnalyticsLoadProgressEvent,
  AnalyticsSpaceConfig,
  AnalyticsSyncStatusSummary,
  CanvasLayerMode,
} from '../lib/analytics-types'

const PRESET_POLLING_MINUTES = [0, 1, 5, 15, 30, 60]

function formatSyncTimestamp(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined

  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso

  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatProgressSuffix(
  progress: AnalyticsLoadProgressEvent | undefined,
): string {
  if (progress === undefined) return ''

  if (progress.phase === 'publishing')
    return ` • Publicando (${progress.fetchedRows} registros)`

  if (progress.totalRows !== undefined)
    return ` • Lote ${progress.batchIndex + 1} (${progress.fetchedRows} de ${progress.totalRows} registros)`

  return ` • Lote ${progress.batchIndex + 1} (${progress.fetchedRows} registros)`
}

export interface AnalyticsTopBarProps {
  spaces: AnalyticsSpaceConfig[]
  activeSpace: AnalyticsSpaceConfig
  layerMode: CanvasLayerMode
  dateRange: DateRange | undefined
  isFetchingLive: boolean
  pollingIntervalMinutes: number
  syncStatusSummary: AnalyticsSyncStatusSummary
  hasErrors: boolean
  hasCoverageWarning: boolean
  statusDetails: ReactNode
  onSelectSpace: (spaceId: string) => void
  onOpenNewSpaceModal: () => void
  onDateRangeChange: (nextRange: DateRange | undefined) => void
  onPollingIntervalChange: (minutes: number) => void
  onSyncAllSources: () => void
  onSetLayerMode: (mode: CanvasLayerMode) => void
}

export function AnalyticsTopBar({
  spaces,
  activeSpace,
  layerMode,
  dateRange,
  isFetchingLive,
  pollingIntervalMinutes,
  syncStatusSummary,
  hasErrors,
  hasCoverageWarning,
  statusDetails,
  onSelectSpace,
  onOpenNewSpaceModal,
  onDateRangeChange,
  onPollingIntervalChange,
  onSyncAllSources,
  onSetLayerMode,
}: AnalyticsTopBarProps) {
  const [isCustomPollingSelected, setIsCustomPollingSelected] =
    useState<boolean>(false)

  let frontVariant: 'default' | 'ghost' = 'ghost'

  if (layerMode === 'front') frontVariant = 'default'

  let backVariant: 'default' | 'ghost' = 'ghost'

  if (layerMode === 'background') backVariant = 'default'

  const isPresetPolling = PRESET_POLLING_MINUTES.includes(
    pollingIntervalMinutes,
  )
  const showCustomPollingInput = isCustomPollingSelected || !isPresetPolling

  let pollingSelectValue = String(pollingIntervalMinutes)
  if (showCustomPollingInput) pollingSelectValue = 'custom'

  const lastFastLabel = formatSyncTimestamp(syncStatusSummary.lastFastSyncAt)
  const lastFullLabel = formatSyncTimestamp(
    syncStatusSummary.lastFullReconcileAt,
  )
  const [activeProgressItem] = syncStatusSummary.activeProgress
  const progressSuffix = formatProgressSuffix(activeProgressItem)

  let liveStatusText = ''
  if (syncStatusSummary.isBackgroundSyncing)
    liveStatusText = `Sincronizando em segundo plano${progressSuffix}`
  if (syncStatusSummary.isManualSyncing)
    liveStatusText = `Sincronizando fontes (reconciliação completa)${progressSuffix}`

  const showMetadataRow =
    lastFastLabel !== undefined ||
    lastFullLabel !== undefined ||
    syncStatusSummary.hasRollingWindow ||
    syncStatusSummary.hasIncrementalChanges

  let statusLabel = 'Status do Analytics'
  if (hasCoverageWarning)
    statusLabel = 'Status do Analytics: cobertura não confirmada'
  if (hasErrors) statusLabel = 'Status do Analytics: há falhas'

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

          <div className="flex items-center gap-1.5">
            <Select
              value={pollingSelectValue}
              onValueChange={(val) => {
                if (val === 'custom') {
                  setIsCustomPollingSelected(true)
                  if (pollingIntervalMinutes <= 0) onPollingIntervalChange(10)
                  return
                }

                setIsCustomPollingSelected(false)
                const parsed = Number.parseInt(val, 10)
                if (Number.isFinite(parsed) && parsed >= 0)
                  onPollingIntervalChange(parsed)
              }}
            >
              <SelectTrigger
                aria-label="Frequência de atualização"
                className="h-8 w-[160px] text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="0" className="text-xs">
                    Atualização: Manual
                  </SelectItem>
                  <SelectItem value="1" className="text-xs">
                    A cada 1 min
                  </SelectItem>
                  <SelectItem value="5" className="text-xs">
                    A cada 5 min
                  </SelectItem>
                  <SelectItem value="15" className="text-xs">
                    A cada 15 min
                  </SelectItem>
                  <SelectItem value="30" className="text-xs">
                    A cada 30 min
                  </SelectItem>
                  <SelectItem value="60" className="text-xs">
                    A cada 60 min
                  </SelectItem>
                  <SelectItem value="custom" className="text-xs">
                    Personalizado (min)
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            {showCustomPollingInput && (
              <Input
                type="number"
                min={1}
                max={1440}
                aria-label="Intervalo personalizado em minutos"
                value={String(pollingIntervalMinutes)}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10)
                  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440)
                    onPollingIntervalChange(parsed)
                }}
                className="h-8 w-16 font-mono text-xs"
              />
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={onSyncAllSources}
            disabled={syncStatusSummary.isManualSyncing}
          >
            <RefreshCw
              className={cn('size-3.5', isFetchingLive && 'animate-spin')}
            />
            Sincronizar
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className={cn(
                  'size-8 shrink-0',
                  hasErrors && 'text-destructive',
                )}
                aria-label={statusLabel}
                title={statusLabel}
              >
                {hasErrors && <CircleAlert />}
                {!hasErrors && hasCoverageWarning && <Info />}
                {!hasErrors && !hasCoverageWarning && <Activity />}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label="Status do Analytics"
              className="flex max-h-[min(60vh,28rem)] w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto"
            >
              <h3 className="text-sm font-semibold">Status do Analytics</h3>
              {(liveStatusText !== '' || showMetadataRow) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {liveStatusText !== '' && (
                    <span
                      role="status"
                      className="text-primary flex items-center gap-1.5 font-medium"
                    >
                      <RefreshCw className="size-3 animate-spin" />
                      {liveStatusText}
                    </span>
                  )}

                  {lastFastLabel !== undefined && (
                    <span className="text-muted-foreground">
                      Última atualização: {lastFastLabel}
                    </span>
                  )}

                  {lastFullLabel !== undefined && (
                    <span className="text-muted-foreground">
                      Reconciliação completa: {lastFullLabel}
                    </span>
                  )}

                  {syncStatusSummary.hasRollingWindow && (
                    <Badge variant="outline" className="text-[10px]">
                      Janela rolante (14 dias)
                    </Badge>
                  )}

                  {syncStatusSummary.hasIncrementalChanges && (
                    <Badge variant="outline" className="text-[10px]">
                      Incremental (changes)
                    </Badge>
                  )}
                </div>
              )}
              {!showMetadataRow &&
                !hasErrors &&
                !hasCoverageWarning &&
                liveStatusText === '' && (
                  <p className="text-muted-foreground text-sm">
                    Nenhum aviso no momento.
                  </p>
                )}
              {statusDetails}
            </PopoverContent>
          </Popover>

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

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
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
