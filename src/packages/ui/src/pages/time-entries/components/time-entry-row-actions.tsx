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
              className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-md p-0"
              title="Histórico de Intervalos"
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          }
        />
        {onPauseTimer && (
          <Button
            variant="outline"
            size="icon"
            className="border-border/60 hover:bg-accent h-7 w-7 rounded-md p-0 shadow-xs transition-transform active:scale-95"
            onClick={() => onPauseTimer(row)}
            title="Pausar Apontamento"
            data-testid="time-entry-pause-btn"
          >
            <Pause className="text-primary h-3.5 w-3.5 fill-current" />
          </Button>
        )}
        {onStopTimer && (
          <Button
            variant="destructive"
            size="icon"
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-7 w-7 rounded-md p-0 shadow-xs transition-transform active:scale-95"
            onClick={() => onStopTimer(row)}
            title="Parar Apontamento"
            data-testid="time-entry-stop-btn"
          >
            <Square className="h-3 w-3 rounded-[1px] fill-current" />
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
              className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-md p-0"
              title="Histórico de Intervalos"
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          }
        />
        {onResumeTimer && (
          <Button
            variant="default"
            size="icon"
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-7 w-7 rounded-md p-0 shadow-xs transition-transform active:scale-95"
            onClick={() => onResumeTimer(row)}
            title="Continuar Apontamento"
            data-testid="time-entry-resume-btn"
          >
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </Button>
        )}
        {onStopTimer && (
          <Button
            variant="destructive"
            size="icon"
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-7 w-7 rounded-md p-0 shadow-xs transition-transform active:scale-95"
            onClick={() => onStopTimer(row)}
            title="Parar Apontamento"
            data-testid="time-entry-stop-btn"
          >
            <Square className="h-3 w-3 rounded-[1px] fill-current" />
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
            className="text-muted-foreground hover:text-foreground h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
            title="Histórico de Intervalos"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground h-7 w-7 p-0"
            data-testid="time-entry-actions-trigger"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
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
