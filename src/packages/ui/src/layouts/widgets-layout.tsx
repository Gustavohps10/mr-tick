import { useEffect } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'

import { DataSourceConnectionsProvider } from '@/contexts/DataSourceConnectionsContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'
import { useTimerSettings } from '@/hooks/use-timer-settings'
import { cn } from '@/lib/utils'
import { SyncProvider } from '@/stores/syncStore'
import { TimeEntryProvider } from '@/stores/timeEntryStore'

export function WidgetLayout() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { widgetPosition, setSelectedWorkspaceId } = useTimerSettings()
  const bridge = useHostBridge()
  const navigate = useNavigate()

  useEffect(() => {
    if (!bridge?.events?.on) return

    const unsub = bridge.events.on<{ workspaceId: string }>(
      'workspace:switched',
      ({ workspaceId: targetId }) => {
        if (!targetId || targetId === workspaceId) return
        setSelectedWorkspaceId(targetId)
        navigate(`/workspaces/${targetId}/widgets/timer`)
      },
    )

    return () => unsub?.()
  }, [bridge, navigate, workspaceId, setSelectedWorkspaceId])

  const handleMouseEnter = () => {
    bridge.system.setIgnoreMouseEvents({
      body: {
        ignore: false,
        forward: true,
      },
    })
  }

  const handleMouseLeave = () => {
    bridge.system.setIgnoreMouseEvents({
      body: {
        ignore: true,
        forward: true,
      },
    })
  }

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <DataSourceConnectionsProvider>
        <SyncProvider>
          <TimeEntryProvider>
            {/* Canvas Fullscreen Transparente estendido */}
            {/*
              IMPORTANTE: o data-widget-drag-boundary vai AQUI (no canvas do
              tamanho da tela), não na div "pointer-events-auto shrink-0" logo
              abaixo. Aquela div se ajusta exatamente ao tamanho da barra —
              se ela fosse o limite do arraste, sobraria ~0px pra mover (era
              exatamente isso que estava limitando o widget "às paredes
              dele"). Aqui, o limite é a tela inteira (menos o padding).
            */}
            <div
              data-widget-drag-boundary
              className={cn(
                'pointer-events-none fixed inset-0 z-50 flex h-full w-full overflow-hidden bg-transparent p-2',
                widgetPosition === 'top' &&
                  'flex-col items-center justify-start',
                widgetPosition === 'bottom' &&
                  'flex-col items-center justify-end',
                widgetPosition === 'left' &&
                  'flex-row items-center justify-start',
                widgetPosition === 'right' &&
                  'flex-row items-center justify-end',
              )}
            >
              <div
                className="pointer-events-auto relative shrink-0"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <Outlet />
              </div>
            </div>
          </TimeEntryProvider>
        </SyncProvider>
      </DataSourceConnectionsProvider>
    </WorkspaceProvider>
  )
}
