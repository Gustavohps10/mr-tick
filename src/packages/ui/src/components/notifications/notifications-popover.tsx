import { Bell, CheckCircle2, Download, Sparkles, TagIcon } from 'lucide-react'
import React, { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useUpdaterStore } from '@/stores/updaterStore'

export function NotificationsPopover() {
  const [isOpen, setIsOpen] = useState(false)
  const { updaterState, updateInfo, setShowModal } = useUpdaterStore()

  const hasUpdate =
    updaterState === 'available' ||
    updaterState === 'downloading' ||
    updaterState === 'ready'

  const isBeta =
    !!updateInfo?.version &&
    (updateInfo.version.toLowerCase().includes('beta') ||
      updateInfo.version.toLowerCase().includes('alpha'))

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  const handleOpenUpdateModal = () => {
    setIsOpen(false)
    setShowModal(true)
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm transition-colors"
                aria-label="Notificações"
              >
                <Bell className="h-4 w-4" />
                {hasUpdate && (
                  <span
                    className={cn(
                      'ring-background absolute top-1 right-1 h-2 w-2 rounded-full ring-2',
                      isBeta ? 'bg-amber-500' : 'bg-emerald-500',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-0 h-full w-full animate-ping rounded-full opacity-75',
                        isBeta ? 'bg-amber-400' : 'bg-emerald-400',
                      )}
                    />
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Notificações
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="bg-popover w-80 border p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm font-semibold">
              Notificações
            </span>
            {hasUpdate && (
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </div>
          <span className="text-muted-foreground text-xs">
            {hasUpdate ? '1 pendente' : 'Tudo limpo'}
          </span>
        </div>

        <div className="p-3">
          {hasUpdate ? (
            <div className="bg-muted/50 hover:bg-muted/80 flex flex-col gap-2 rounded-lg border p-3 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                      isBeta
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-foreground text-xs font-semibold">
                      Nova versão disponível
                    </h4>
                    <span className="text-muted-foreground text-[11px]">
                      Mr. Tick Auto Updater
                    </span>
                  </div>
                </div>

                {isBeta ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[9px] font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400"
                  >
                    Beta
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded-full border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0 text-[9px] font-bold tracking-wider text-emerald-600 uppercase dark:text-emerald-400"
                  >
                    Stable
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <TagIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    isBeta
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-emerald-500 dark:text-emerald-400',
                  )}
                />
                <span className="text-foreground font-medium">
                  {updateInfo?.version}
                </span>
              </div>

              <p className="text-muted-foreground text-xs leading-relaxed">
                Uma nova versão do aplicativo está pronta para ser baixada e
                instalada.
              </p>

              <div className="mt-1 flex items-center justify-end">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleOpenUpdateModal}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Ver atualização
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <div className="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="space-y-0.5">
                <p className="text-foreground text-xs font-medium">
                  Nenhuma notificação nova
                </p>
                <p className="text-muted-foreground text-[11px]">
                  O aplicativo está atualizado.
                </p>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
