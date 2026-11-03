'use client'

import { AlertTriangle } from 'lucide-react'
import React from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useWorkspaceConflicts } from '@/hooks/queries/use-workspace-conflicts'
import { cn } from '@/lib/utils'
import { useConflictModalStore } from '@/stores/conflictModalStore'

export interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps = {}) {
  const { workspace } = useWorkspace()
  const { conflictCount } = useWorkspaceConflicts()
  const openConflictModal = useConflictModalStore((s) => s.openConflictModal)

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cn(
        'border-border/40 bg-muted/30 hover:bg-muted/50 pointer-events-auto flex h-6 items-center justify-between gap-2 rounded px-2 shadow-xs backdrop-blur-md transition-colors select-none',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Avatar className="ring-border/40 size-3.5 rounded-xs shadow-2xs ring-1">
          <AvatarImage
            src={workspace?.avatarUrl || undefined}
            alt={workspace?.name}
          />
          <AvatarFallback className="text-[8px] font-bold">
            {workspace?.name?.[0]?.toUpperCase() || 'M'}
          </AvatarFallback>
        </Avatar>

        <div className="flex items-center gap-1 leading-none">
          <span className="text-foreground max-w-[140px] truncate text-[11px] font-semibold tracking-tight">
            {workspace?.name || 'Mr. Tick'}
          </span>
          <span className="text-muted-foreground/60 font-mono text-[9px]">
            {workspace?.id}
          </span>
        </div>
      </div>

      {conflictCount > 0 && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openConflictModal()}
                className="h-5 gap-1 rounded-xs border border-amber-500/40 bg-amber-500/15 px-1.5 text-amber-600 hover:bg-amber-500/25 hover:text-amber-500 dark:text-amber-400"
              >
                <AlertTriangle size={11} className="text-amber-500" />
                <span className="text-[10px] font-bold">{conflictCount}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px]">
              {conflictCount === 1
                ? '1 conflito de sincronização pendente'
                : `${conflictCount} conflitos de sincronização pendentes`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
