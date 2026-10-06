import { useQuery } from '@tanstack/react-query'
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
  const { workspaceId: paramWorkspaceId } = useParams<{ workspaceId: string }>()
  const { widgetPosition, selectedWorkspaceId, setSelectedWorkspaceId } =
    useTimerSettings()
  const bridge = useHostBridge()
  const navigate = useNavigate()

  const candidateId =
    selectedWorkspaceId ||
    (paramWorkspaceId && paramWorkspaceId !== 'default'
      ? paramWorkspaceId
      : null)

  const candidateQuery = useQuery({
    queryKey: ['widget-workspace', candidateId],
    queryFn: async () => {
      if (!candidateId) return null
      return bridge.workspaces.getById({ body: { workspaceId: candidateId } })
    },
    enabled: Boolean(candidateId),
    retry: false,
  })

  useEffect(() => {
    if (
      candidateQuery.data &&
      ((!candidateQuery.data.isSuccess &&
        candidateQuery.data.statusCode === 404) ||
        (candidateQuery.data.isSuccess &&
          candidateQuery.data.data?.status !== 'configured'))
    )
      setSelectedWorkspaceId(null)
  }, [candidateQuery.data, setSelectedWorkspaceId])

  const isUnconfigured =
    candidateQuery.data?.isSuccess &&
    candidateQuery.data.data?.status !== 'configured'

  const shouldFetchCatalog =
    !candidateId ||
    candidateQuery.data?.statusCode === 404 ||
    Boolean(isUnconfigured)

  const listQuery = useQuery({
    queryKey: ['widget-workspaces-catalog'],
    queryFn: async () => {
      const response = await bridge.workspaces.listAll()
      if (!response.isSuccess || !response.data) return []
      return response.data
    },
    enabled: shouldFetchCatalog,
    retry: false,
  })

  useEffect(() => {
    if (!bridge?.events?.on) return

    const unsub = bridge.events.on<{ workspaceId: string }>(
      'workspace:switched',
      ({ workspaceId: targetId }) => {
        if (!targetId) return
        setSelectedWorkspaceId(targetId)
        navigate(`/workspaces/${targetId}/widgets/timer`)
      },
    )

    return () => unsub?.()
  }, [bridge, navigate, setSelectedWorkspaceId])

  if (
    candidateQuery.data &&
    !candidateQuery.data.isSuccess &&
    candidateQuery.data.statusCode !== 404
  ) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-2 p-4">
        <span className="text-destructive text-sm font-medium">
          {candidateQuery.data.error}
        </span>
        <button
          onClick={() => {
            void candidateQuery.refetch()
          }}
          className="bg-primary text-primary-foreground rounded px-3 py-1 text-xs"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (shouldFetchCatalog) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-2 p-4">
        {listQuery.data
          ?.filter((ws) => ws.status === 'configured')
          .map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setSelectedWorkspaceId(ws.id)
                navigate(`/workspaces/${ws.id}/widgets/timer`)
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded px-3 py-1.5 text-xs font-medium"
            >
              {ws.name}
            </button>
          ))}
      </div>
    )
  }

  if (
    !candidateQuery.data?.isSuccess ||
    !candidateQuery.data.data ||
    candidateQuery.data.data.status !== 'configured'
  )
    return null

  const validatedWorkspace = candidateQuery.data.data

  return (
    <WorkspaceProvider workspaceId={validatedWorkspace.id}>
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
              <div className="pointer-events-auto relative shrink-0">
                <Outlet />
              </div>
            </div>
          </TimeEntryProvider>
        </SyncProvider>
      </DataSourceConnectionsProvider>
    </WorkspaceProvider>
  )
}
