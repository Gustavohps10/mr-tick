import {
  CheckCheck,
  CopyIcon,
  EditIcon,
  History,
  MoreHorizontal,
  Pause,
  Play,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react'

import { TimerHistory } from '@/components/time-bar/details/timer-history'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { SuggestionRow } from '@/pages/time-entries/lib/time-entries-utils'

interface TimeEntryRowActionsProps {
  row: SuggestionRow
  isEditing: boolean
  onToggleEdit: () => void
  onSave: () => void
  onCancelEdit?: () => void
  onDuplicate: () => void
  onDelete: () => void
  onAcceptSuggestion?: () => void
  onDismissSuggestion?: () => void
  onPauseTimer?: (row: SuggestionRow) => void
  onResumeTimer?: (row: SuggestionRow) => void
  onStopTimer?: (row: SuggestionRow) => void
  compact?: boolean
}

export function TimeEntryRowActions({
  row,
  isEditing,
  onToggleEdit,
  onSave,
  onCancelEdit,
  onDuplicate,
  onDelete,
  onAcceptSuggestion,
  onDismissSuggestion,
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
  compact = false,
}: TimeEntryRowActionsProps) {
  if (row.isSuggestion || row.timeStatus === 'suggestion') {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="default"
          className="h-6 gap-1 px-2 text-[11px] font-semibold"
          onClick={(e) => {
            e.stopPropagation()
            onAcceptSuggestion?.()
          }}
          title="Aceitar e confirmar sugestão"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          <span>Aceitar</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onDismissSuggestion?.()
          }}
          title="Descartar Sugestão"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-primary hover:bg-primary/10 h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          title="Salvar apontamento"
          data-testid="time-entry-save-btn"
        >
          <Save className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation()
            if (onCancelEdit) {
              onCancelEdit()
            } else {
              onToggleEdit()
            }
          }}
          title="Cancelar"
          data-testid="time-entry-cancel-btn"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  if (row.timeStatus === 'running') {
    return (
      <div className="flex items-center justify-end gap-1">
        <TimerHistory
          entry={row}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'text-muted-foreground hover:text-foreground rounded-md p-0',
                compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
              )}
              title="Histórico de Intervalos"
            >
              <History className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </Button>
          }
        />
        {onPauseTimer && (
          <Button
            variant="outline"
            size="icon"
            className={cn(
              'border-border/60 hover:bg-accent rounded-md p-0 shadow-xs transition-transform active:scale-95',
              compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
            )}
            onClick={() => onPauseTimer(row)}
            title="Pausar Apontamento"
            data-testid="time-entry-pause-btn"
          >
            <Pause
              className={cn(
                'text-primary fill-current',
                compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
              )}
            />
          </Button>
        )}
        {onStopTimer && (
          <Button
            variant="destructive"
            size="icon"
            className={cn(
              'bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md p-0 shadow-xs transition-transform active:scale-95',
              compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
            )}
            onClick={() => onStopTimer(row)}
            title="Parar Apontamento"
            data-testid="time-entry-stop-btn"
          >
            <Square
              className={cn(
                'rounded-[1px] fill-current',
                compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
              )}
            />
          </Button>
        )}
      </div>
    )
  }

  if (row.timeStatus === 'paused') {
    return (
      <div className="flex items-center justify-end gap-1">
        <TimerHistory
          entry={row}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'text-muted-foreground hover:text-foreground rounded-md p-0',
                compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
              )}
              title="Histórico de Intervalos"
            >
              <History className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </Button>
          }
        />
        {onResumeTimer && (
          <Button
            variant="default"
            size="icon"
            className={cn(
              'bg-primary hover:bg-primary/90 text-primary-foreground rounded-md p-0 shadow-xs transition-transform active:scale-95',
              compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
            )}
            onClick={() => onResumeTimer(row)}
            title="Continuar Apontamento"
            data-testid="time-entry-resume-btn"
          >
            <Play
              className={cn(
                'ml-0.5 fill-current',
                compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
              )}
            />
          </Button>
        )}
        {onStopTimer && (
          <Button
            variant="destructive"
            size="icon"
            className={cn(
              'bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md p-0 shadow-xs transition-transform active:scale-95',
              compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
            )}
            onClick={() => onStopTimer(row)}
            title="Parar Apontamento"
            data-testid="time-entry-stop-btn"
          >
            <Square
              className={cn(
                'rounded-[1px] fill-current',
                compact ? 'h-2.5 w-2.5' : 'h-3 w-3',
              )}
            />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      <TimerHistory
        entry={row}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-muted-foreground hover:text-foreground p-0 opacity-0 transition-opacity group-hover:opacity-100',
              compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
            )}
            title="Histórico de Intervalos"
          >
            <History className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'text-muted-foreground hover:text-foreground p-0',
              compact ? 'h-6.5 w-6.5' : 'h-7 w-7',
            )}
            data-testid="time-entry-actions-trigger"
          >
            <MoreHorizontal
              className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onClick={onToggleEdit}
            className="gap-2 text-xs"
            data-testid="time-entry-edit-btn"
          >
            <EditIcon className="h-3.5 w-3.5" />
            <span>Editar</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDuplicate}
            className="gap-2 text-xs"
            data-testid="time-entry-duplicate-btn"
          >
            <CopyIcon className="h-3.5 w-3.5" />
            <span>Duplicar</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive gap-2 text-xs"
            data-testid="time-entry-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Excluir</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
