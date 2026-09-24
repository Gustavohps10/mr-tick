'use client'

import { AddonTimerbarMenuItem, DisplayInfo } from '@mr-tick/application'
import {
  Clock3,
  ClockArrowDown,
  ClockArrowUp,
  Eye,
  EyeOff,
  Gamepad2,
  LayoutTemplate,
  LockIcon,
  Minus,
  Monitor,
  MonitorPlay,
  Moon,
  Puzzle,
  Settings2Icon,
  X,
} from 'lucide-react'
import React, { memo, useEffect, useState } from 'react'

import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useHostBridge } from '@/hooks'
import {
  useCurrentWidgetPosition,
  useTimerSettings,
} from '@/hooks/use-timer-settings'
import { cn } from '@/lib/utils'
import { useTimeEntryStore } from '@/stores/timeEntryStore'

type WidgetPosition = 'top' | 'bottom' | 'left' | 'right'

const POSITION_LABEL: Record<WidgetPosition, string> = {
  top: 'Topo',
  bottom: 'Rodapé',
  left: 'Esquerda',
  right: 'Direita',
}

function PositionCompass({
  value,
  onChange,
}: {
  value: WidgetPosition
  onChange: (value: WidgetPosition) => void
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="bg-muted/30 border-border relative flex h-14 w-14 shrink-0 flex-col items-center justify-between rounded-md border p-1">
        <button
          type="button"
          onClick={() => onChange('top')}
          className={cn(
            'flex h-3.5 w-6 items-center justify-center rounded-[3px] transition-colors',
            value === 'top'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-border/50 text-muted-foreground hover:bg-border/80 hover:text-foreground',
          )}
        >
          <Minus className="h-3 w-3" />
        </button>

        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => onChange('left')}
            className={cn(
              'flex h-6 w-3.5 items-center justify-center rounded-[3px] transition-colors',
              value === 'left'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-border/50 text-muted-foreground hover:bg-border/80 hover:text-foreground',
            )}
          >
            <Minus className="h-3 w-3 rotate-90" />
          </button>

          {/* Central Dot */}
          <div className="bg-border/50 h-2 w-2 rounded-full" />

          <button
            type="button"
            onClick={() => onChange('right')}
            className={cn(
              'flex h-6 w-3.5 items-center justify-center rounded-[3px] transition-colors',
              value === 'right'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-border/50 text-muted-foreground hover:bg-border/80 hover:text-foreground',
            )}
          >
            <Minus className="h-3 w-3 rotate-90" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChange('bottom')}
          className={cn(
            'flex h-3.5 w-6 items-center justify-center rounded-[3px] transition-colors',
            value === 'bottom'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-border/50 text-muted-foreground hover:bg-border/80 hover:text-foreground',
          )}
        >
          <Minus className="h-3 w-3" />
        </button>
      </div>
      <span className="text-muted-foreground text-[11px] font-medium">
        {POSITION_LABEL[value]}
      </span>
    </div>
  )
}

export const TimerSettings = memo(() => {
  const bridge = useHostBridge()
  const isWidgetWindow =
    typeof window !== 'undefined' && window.location.hash.includes('/widgets/')
  const {
    timerDirection,
    setTimerDirection,
    logOption,
    setLogOption,
    selectedDisplayId,
    setSelectedDisplayId,
    discordRpc,
    setDiscordRpc,
    antiBurnout,
    setAntiBurnout,
    activeWindowTracking,
    setActiveWindowTracking,
    hiddenBlocks,
    toggleHiddenBlock,
    enabledAddonIds,
    toggleAddonVisibility,
    startMinimized,
    setStartMinimized,
  } = useTimerSettings()
  const [widgetPosition, setWidgetPosition] = useCurrentWidgetPosition()

  const [isOpen, setIsOpen] = useState(false)
  const isRunning = useTimeEntryStore((s) => s.active?.timeStatus === 'running')
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [initialLoad, setInitialLoad] = useState(true)
  const [addonMenus, setAddonMenus] = useState<AddonTimerbarMenuItem[]>([])

  useEffect(() => {
    let isMounted = true
    bridge.addons
      .getTimerbarMenus()
      .then((res) => {
        if (isMounted && res?.isSuccess && Array.isArray(res.data)) {
          setAddonMenus(res.data)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [bridge])

  // Sync initial settings from OS on startup
  useEffect(() => {
    bridge.system.getSettings().then((settings) => {
      if (settings && typeof settings.startMinimized === 'boolean') {
        setStartMinimized(settings.startMinimized)
      }
    })
  }, [bridge, setStartMinimized])

  useEffect(() => {
    bridge.system.getDisplays().then((list) => {
      setDisplays(list)

      if (list.length > 0 && initialLoad) {
        const savedDisplay = list.find((d) => d.id === selectedDisplayId)
        const primaryDisplay = list.find((d) => d.isPrimary)
        const fallbackDisplay = list.length > 0 ? list[0] : null
        const displayToUse = savedDisplay ?? primaryDisplay ?? fallbackDisplay

        if (displayToUse) {
          if (displayToUse.id !== selectedDisplayId) {
            setSelectedDisplayId(displayToUse.id)
          }

          bridge.system.moveToDisplay({
            body: { displayId: displayToUse.id, windowType: 'widget' },
          })
          setInitialLoad(false)
        }
      }
    })
  }, [bridge, selectedDisplayId, setSelectedDisplayId, initialLoad])

  const handleDisplayChange = async (displayIdStr: string) => {
    const displayId = Number(displayIdStr)
    setSelectedDisplayId(displayId)

    await bridge.system.moveToDisplay({
      body: { displayId, windowType: 'widget' },
    })
  }

  const handleStartMinimizedChange = async (checked: boolean) => {
    setStartMinimized(checked)
    await bridge.system.saveSettings({ startMinimized: checked })
  }

  const handleHideWidget = async () => {
    await bridge.system.hideWindow('widget')
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:bg-muted/50 hover:text-foreground h-[18px] w-[18px] rounded p-0 transition-colors"
        >
          <Settings2Icon className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="bg-card h-[400px] w-[270px] overflow-y-auto rounded-lg p-0 shadow-xl"
      >
        <div className="bg-card border-border/50 sticky top-0 z-10 flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="bg-primary/10 text-primary rounded-md p-1">
              <Settings2Icon className="h-3 w-3" />
            </div>
            <p className="text-[13px] font-semibold">Preferências</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded-md"
            onClick={() => setIsOpen(false)}
          >
            <X className="text-muted-foreground hover:text-foreground h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-2 p-2">
          <div className="bg-muted/30 border-border/50 space-y-2.5 rounded-lg border p-2">
            <div className="border-border/40 flex items-center gap-1.5 border-b pb-1.5">
              <Clock3 className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-foreground/90 text-xs font-semibold">
                Timer
              </span>
            </div>

            {/* Subgrupo 1: Modo do Timer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Modo do timer
                </span>
                {isRunning && (
                  <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded-[2px] border px-1 py-[1px] text-[8px] font-medium">
                    <LockIcon className="h-2 w-2" /> Em execução
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  disabled={isRunning}
                  variant={timerDirection === 'up' ? 'secondary' : 'ghost'}
                  className={cn(
                    'h-6 justify-start gap-1.5 px-2 text-[11px]',
                    isRunning && 'opacity-50',
                  )}
                  onClick={() => setTimerDirection('up')}
                >
                  <ClockArrowUp className="h-3 w-3" /> Normal
                </Button>
                <Button
                  disabled={isRunning}
                  variant={timerDirection === 'down' ? 'secondary' : 'ghost'}
                  className={cn(
                    'h-6 justify-start gap-1.5 px-2 text-[11px]',
                    isRunning && 'opacity-50',
                  )}
                  onClick={() => setTimerDirection('down')}
                >
                  <ClockArrowDown className="h-3 w-3" /> Pomodoro
                </Button>
              </div>
            </div>

            {/* Subgrupo 2: Opções de Apontamento */}
            <div className="border-border/40 space-y-1.5 border-t pt-2">
              <span className="text-muted-foreground block text-[11px] font-medium">
                Botão extra do timer
              </span>
              <div className="space-y-1">
                {[
                  { id: 'none', label: 'Não exibir' },
                  { id: 'manual', label: 'Apontar direto' },
                  { id: 'ask', label: 'Escolher ação' },
                ].map((option) => {
                  const isSelected = logOption === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setLogOption(option.id as 'none' | 'manual' | 'ask')
                      }
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                      )}
                    >
                      <span>{option.label}</span>
                      <div
                        className={cn(
                          'flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-all',
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/40 bg-transparent',
                        )}
                      >
                        {isSelected && (
                          <div className="bg-primary-foreground h-1.5 w-1.5 rounded-full" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="bg-muted/30 border-border/50 rounded-lg border p-2">
            <div className="mb-2 flex items-center gap-1.5">
              <LayoutTemplate className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-foreground/90 text-xs font-semibold">
                Ancoragem
              </span>
            </div>
            <PositionCompass
              value={widgetPosition as WidgetPosition}
              onChange={setWidgetPosition}
            />
          </div>

          <div className="bg-muted/30 border-border/50 rounded-lg border p-2">
            <div className="mb-2 flex items-center gap-1.5">
              <Eye className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-foreground/90 text-xs font-semibold">
                Visualização
              </span>
            </div>
            <div className="space-y-1">
              {[
                { id: 'task', label: 'Seletor de tarefas' },
                { id: 'today', label: 'Tempo Hoje' },
                { id: 'actions', label: 'Controles (Play/Stop)' },
                { id: 'tools', label: 'Ferramentas' },
              ].map((block) => {
                const isHidden = hiddenBlocks.includes(block.id)
                return (
                  <div
                    key={block.id}
                    className="hover:bg-muted/30 flex items-center justify-between rounded-md px-1.5 py-1 transition-colors"
                  >
                    <Label
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 text-[11px] font-medium transition-opacity',
                        isHidden && 'opacity-60',
                      )}
                      htmlFor={`hide-${block.id}`}
                    >
                      {block.label}
                    </Label>
                    <Button
                      id={`hide-${block.id}`}
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-6 w-6 rounded-md transition-colors',
                        isHidden
                          ? 'text-muted-foreground/60 hover:bg-muted hover:text-foreground'
                          : 'bg-primary/10 text-primary hover:bg-primary/20',
                      )}
                      onClick={() => toggleHiddenBlock(block.id)}
                    >
                      {isHidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>

            {addonMenus.length > 0 && (
              <div className="border-border/40 mt-2 space-y-1.5 border-t pt-2">
                <span className="text-muted-foreground block text-[11px] font-medium">
                  Addons na Timerbar
                </span>
                <div className="space-y-1">
                  {addonMenus.map((addon) => {
                    const addonKey = addon.id
                    const isEnabled = (enabledAddonIds ?? []).includes(addonKey)
                    return (
                      <div
                        key={addonKey}
                        className="hover:bg-muted/30 flex items-center justify-between rounded-md px-1.5 py-1 transition-colors"
                      >
                        <Label
                          className="flex cursor-pointer items-center gap-1.5 truncate pr-2 text-[11px] font-medium"
                          htmlFor={`addon-toggle-${addonKey}`}
                        >
                          <Puzzle className="text-muted-foreground h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {addon.tooltip ?? addon.label ?? addonKey}
                          </span>
                        </Label>
                        <Switch
                          id={`addon-toggle-${addonKey}`}
                          className="shrink-0 scale-75"
                          checked={isEnabled}
                          onCheckedChange={() =>
                            toggleAddonVisibility(addonKey)
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-muted/30 border-border/50 rounded-lg border p-2">
            <div className="mb-2 flex items-center gap-1.5">
              <Gamepad2 className="text-muted-foreground h-3.5 w-3.5" />
              <span className="text-foreground/90 text-xs font-semibold">
                Automações
              </span>
            </div>
            <div className="space-y-2.5">
              {/* <div className="flex items-center justify-between">
                <Label
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium"
                  htmlFor="discord-rpc"
                >
                  Discord RPC
                </Label>
                <Switch
                  id="discord-rpc"
                  className="scale-75"
                  checked={discordRpc}
                  onCheckedChange={setDiscordRpc}
                />
              </div> */}
              <div className="flex items-center justify-between">
                <Label
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium"
                  htmlFor="anti-burnout"
                >
                  <Moon className="text-muted-foreground h-3 w-3" />{' '}
                  Anti-Burnout (4h)
                </Label>
                <Switch
                  id="anti-burnout"
                  className="scale-75"
                  checked={antiBurnout}
                  onCheckedChange={setAntiBurnout}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium"
                  htmlFor="active-window"
                >
                  <MonitorPlay className="text-muted-foreground h-3 w-3" />{' '}
                  Rastrear janela
                </Label>
                <Switch
                  id="active-window"
                  className="scale-75"
                  checked={activeWindowTracking}
                  onCheckedChange={setActiveWindowTracking}
                />
              </div>
            </div>
          </div>

          {isWidgetWindow && (
            <div className="bg-muted/30 border-border/50 space-y-3 rounded-lg border p-2">
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Monitor className="text-muted-foreground h-3.5 w-3.5" />
                  <span className="text-foreground/90 text-xs font-semibold">
                    Sistema
                  </span>
                </div>

                {displays.length > 1 && (
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[9px] font-semibold tracking-wider">
                        Selecionar Monitor
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {displays.map((display, index) => {
                        const isSelected = selectedDisplayId === display.id
                        return (
                          <button
                            key={display.id}
                            onClick={() =>
                              handleDisplayChange(display.id.toString())
                            }
                            className={cn(
                              'flex flex-col items-center justify-center gap-1 rounded-md border p-2 transition-all',
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-border/50 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                            )}
                          >
                            <Monitor className="mb-0.5 h-4 w-4" />
                            <span className="text-foreground text-[11px] leading-none font-medium">
                              Tela {index + 1}
                            </span>
                            <span className="mt-0.5 w-full truncate text-center text-[9px] leading-none opacity-60">
                              {display.isPrimary
                                ? 'Principal'
                                : `${display.label || 'Secundário'}`}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    'space-y-2.5',
                    displays.length > 1 && 'border-border/50 border-t py-2.5',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Label
                      className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium"
                      htmlFor="start-minimized"
                    >
                      Tema Claro/Escuro
                    </Label>
                    <ModeToggle className="shrink-0 cursor-pointer rounded-md border-transparent bg-transparent p-1.5 text-zinc-500 transition-all hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" />
                  </div>
                </div>

                <div
                  className={cn(
                    'space-y-2.5',
                    displays.length > 1 && 'border-border/50 border-t pt-2.5',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Label
                      className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium"
                      htmlFor="start-minimized"
                    >
                      Iniciar minimizado
                    </Label>
                    <Switch
                      id="start-minimized"
                      className="scale-75"
                      checked={startMinimized}
                      onCheckedChange={handleStartMinimizedChange}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    onClick={handleHideWidget}
                  >
                    Esconder Widget
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})

TimerSettings.displayName = 'TimerSettings'
