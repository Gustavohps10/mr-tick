import { Search, Settings } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Kbd } from '@/components/ui/kbd'
import { useSidebar } from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface AppSidebarQuickActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  onSearchClick?: () => void
}

export function AppSidebarQuickActions({
  className,
  onSearchClick,
  ...props
}: AppSidebarQuickActionsProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { open } = useSidebar()

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

  if (!open) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-1 py-1 select-none',
          className,
        )}
        {...props}
      >
        <TooltipProvider delayDuration={200}>
          {/* Busca */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onSearchClick}
                className="hover:bg-muted/70 text-muted-foreground hover:text-foreground flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors"
                aria-label="Busca Rápida"
              >
                <Search className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Busca ({isMac ? '⌘K' : 'Ctrl+K'})
            </TooltipContent>
          </Tooltip>

          {/* Configurações */}
          {workspaceId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/workspaces/${workspaceId}/settings`)
                  }
                  className="hover:bg-muted/70 text-muted-foreground hover:text-foreground flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors"
                  aria-label="Configurações do Workspace"
                >
                  <Settings className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Configurações
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 select-none',
        className,
      )}
      {...props}
    >
      {/* Busca Rápida / Command Palette Button */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSearchClick}
              className="bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/50 flex h-8 flex-1 cursor-pointer items-center justify-between rounded-md border px-2.5 text-xs transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <Search className="size-3.5 opacity-70" />
                <span className="text-xs font-medium">Buscar</span>
              </div>
              <Kbd className="h-4.5 px-1.5 font-mono text-[9px] opacity-80">
                {isMac ? '⌘K' : 'Ctrl+K'}
              </Kbd>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Busca Rápida
          </TooltipContent>
        </Tooltip>

        {/* Atalho Configurações */}
        {workspaceId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => navigate(`/workspaces/${workspaceId}/settings`)}
                className="hover:bg-muted/70 text-muted-foreground hover:text-foreground flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors"
                aria-label="Configurações do Workspace"
              >
                <Settings className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Configurações
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}
