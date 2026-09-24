import { LayoutGridIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  UltimateTimeTracker,
  useAddonBlocks,
  useTrackerContext,
} from '@/components/time-bar/ultimate-entry-bar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'
import { useTimerSettings } from '@/hooks/use-timer-settings'
import { cn } from '@/lib/utils'

function WorkspaceSelectorBlock() {
  const { workspaces } = useWorkspace()
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const bridge = useHostBridge()
  const [isOpen, setIsOpen] = useState(false)

  // Consome a função de setar o cache
  const { setSelectedWorkspaceId } = useTimerSettings()
  const { isVertical, widgetPosition } = useTrackerContext()

  const currentWorkspace = workspaces?.find((w) => w.id === workspaceId)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="hover:bg-muted/50 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
          title="Trocar Workspace"
        >
          <Avatar className="h-6 w-6 rounded-md">
            <AvatarImage src={currentWorkspace?.avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary rounded-md">
              <LayoutGridIcon className="size-3" />
            </AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={
          isVertical
            ? widgetPosition === 'left'
              ? 'right'
              : 'left'
            : widgetPosition === 'top'
              ? 'bottom'
              : 'top'
        }
        sideOffset={12}
        className={cn(
          'bg-card/90 border-border/50 flex w-fit gap-2 rounded-xl p-2 shadow-xl backdrop-blur-sm',
          isVertical ? 'flex-row' : 'flex-col',
        )}
      >
        {workspaces
          ?.filter((w) => w.status === 'configured')
          .map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                // Atualiza o Store para salvar a preferência
                setSelectedWorkspaceId(ws.id)
                // Navega atualizando a UI
                navigate(`/workspaces/${ws.id}/widgets/timer`)
                bridge.events.emit('workspace:switched', {
                  workspaceId: ws.id,
                })
                setIsOpen(false)
              }}
              className={cn(
                'group hover:bg-primary/20 relative flex h-10 w-10 items-center justify-center rounded-lg transition-all',
                ws.id === workspaceId && 'ring-primary ring-2',
              )}
              title={ws.name}
            >
              <Avatar className="h-full w-full rounded-md">
                <AvatarImage src={ws.avatarUrl} className="object-cover" />
                <AvatarFallback className="rounded-md bg-transparent">
                  <LayoutGridIcon className="size-4" />
                </AvatarFallback>
              </Avatar>
            </button>
          ))}
      </PopoverContent>
    </Popover>
  )
}

export function TimerWidget() {
  const { workspaces } = useWorkspace()
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const { selectedWorkspaceId, setSelectedWorkspaceId } = useTimerSettings()
  const addonBlocks = useAddonBlocks()

  useEffect(() => {
    document.body.style.background = 'transparent'
    return () => {
      document.body.style.background = ''
    }
  }, [])

  // Lógica de fallback e auto-seleção de Workspace
  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return

    const configuredWorkspaces = workspaces.filter(
      (w) => w.status === 'configured',
    )
    if (configuredWorkspaces.length === 0) return

    let targetId = selectedWorkspaceId

    // Verifica se o workspace em cache ainda existe e está configurado
    const isTargetValid = configuredWorkspaces.some((w) => w.id === targetId)

    if (!isTargetValid) {
      // Se não tem em cache, avalia se o atual na URL serve. Se não servir (ex: "default"), pega o primeiro da lista.
      const isUrlValid = configuredWorkspaces.some((w) => w.id === workspaceId)
      targetId = isUrlValid ? workspaceId! : configuredWorkspaces[0].id

      // Salva o novo workspace selecionado no cache
      setSelectedWorkspaceId(targetId)
    }

    // Se o target for diferente do workspace atual da URL (por exemplo, app abriu na rota root), fazemos o redirect invisível
    if (targetId && workspaceId !== targetId) {
      navigate(`/workspaces/${targetId}/widgets/timer`, { replace: true })
    }
  }, [
    workspaces,
    workspaceId,
    selectedWorkspaceId,
    navigate,
    setSelectedWorkspaceId,
  ])

  return (
    <UltimateTimeTracker>
      <UltimateTimeTracker.Handle />

      <UltimateTimeTracker.Blocks>
        <UltimateTimeTracker.Block id="workspace">
          <WorkspaceSelectorBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="task">
          <UltimateTimeTracker.TaskBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="timer">
          <UltimateTimeTracker.TimerBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="today">
          <UltimateTimeTracker.TodayBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="actions">
          <UltimateTimeTracker.ActionsBlock />
        </UltimateTimeTracker.Block>

        <UltimateTimeTracker.Block id="tools">
          <UltimateTimeTracker.ToolsBlock />
        </UltimateTimeTracker.Block>

        {addonBlocks}
      </UltimateTimeTracker.Blocks>

      <UltimateTimeTracker.InlineInput />
      <UltimateTimeTracker.Expander />
    </UltimateTimeTracker>
  )
}
