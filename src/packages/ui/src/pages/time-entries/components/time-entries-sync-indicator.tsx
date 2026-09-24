'use client'

import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface TimeEntriesSyncIndicatorProps {
  isSyncing?: boolean
  isPulling?: boolean
  isPushing?: boolean
  syncResult?: 'success' | 'error' | null
  syncErrorMessage?: string | null
  className?: string
}

export function TimeEntriesSyncIndicator({
  isSyncing,
  isPulling,
  isPushing,
  syncResult,
  syncErrorMessage,
  className,
}: TimeEntriesSyncIndicatorProps) {
  if (isPulling) {
    return (
      <div
        className={cn(
          'animate-in fade-in slide-in-from-top-1 flex items-center gap-2 transition-all duration-300',
          className,
        )}
      >
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 border-blue-500/30 bg-blue-500/10 py-1 pr-2.5 pl-2 text-xs font-normal text-blue-600 shadow-xs backdrop-blur-xs dark:text-blue-400"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin opacity-80" />
          <span className="font-medium">
            Buscando novos apontamentos do servidor...
          </span>
        </Badge>
      </div>
    )
  }

  if (isPushing) {
    return (
      <div
        className={cn(
          'animate-in fade-in slide-in-from-top-1 flex items-center gap-2 transition-all duration-300',
          className,
        )}
      >
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 border-amber-500/30 bg-amber-500/10 py-1 pr-2.5 pl-2 text-xs font-normal text-amber-600 shadow-xs backdrop-blur-xs dark:text-amber-400"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin opacity-80" />
          <span className="font-medium">
            Enviando apontamentos para o servidor...
          </span>
        </Badge>
      </div>
    )
  }

  if (isSyncing) {
    return (
      <div
        className={cn(
          'animate-in fade-in slide-in-from-top-1 flex items-center gap-2 transition-all duration-300',
          className,
        )}
      >
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/5 text-primary flex items-center gap-1.5 py-1 pr-2.5 pl-2 text-xs font-normal shadow-xs backdrop-blur-xs"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin opacity-80" />
          <span className="font-medium">Sincronizando com o servidor...</span>
        </Badge>
      </div>
    )
  }

  if (syncResult === 'error') {
    const errorDetails = syncErrorMessage
      ? syncErrorMessage
      : 'Ocorreu um erro ao sincronizar com o provedor remoto.'

    return (
      <div
        className={cn(
          'animate-in fade-in slide-in-from-top-1 flex items-center gap-2 transition-all duration-300',
          className,
        )}
      >
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="border-destructive/40 bg-destructive/10 text-destructive flex cursor-help items-center gap-1.5 py-1 pr-2.5 pl-2 text-xs font-normal shadow-xs backdrop-blur-xs"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">
                  Falha na sincronização com o servidor
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              <p className="text-destructive font-semibold">
                Detalhes da Falha
              </p>
              <p className="text-muted-foreground mt-1 font-mono text-[11px] break-words">
                {errorDetails}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  if (syncResult === 'success') {
    return (
      <div
        className={cn(
          'animate-in fade-in slide-in-from-top-1 flex items-center gap-2 transition-all duration-300',
          className,
        )}
      >
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 border-emerald-500/30 bg-emerald-500/10 py-1 pr-2.5 pl-2 text-xs font-normal text-emerald-600 shadow-xs backdrop-blur-xs dark:text-emerald-400"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Sincronizado com sucesso</span>
        </Badge>
      </div>
    )
  }

  return null
}
