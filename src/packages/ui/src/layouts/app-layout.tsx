'use client'

import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AppRail } from '@/components/app-rail'
import { DraftWorkspacesPanel } from '@/components/draft-workspace-panel'
import { Header } from '@/components/header'
import { NewWorkspaceDialog } from '@/components/new-workspace-dialog'
import { GlobalSettingsDialog } from '@/components/settings/global-settings-dialog'
import { UpdateModal } from '@/components/settings/update-modal'
import { TitleBar } from '@/components/title-bar'
import { Toaster } from '@/components/ui/sonner'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { useOpenAPI } from '@/hooks'
import { useAutoUpdater } from '@/hooks/use-auto-updater'
import { GlobalConflictResolutionDialog } from '@/pages/time-entries/components/conflict-resolution-dialog'
import { DataSourceConnectionsProvider } from '@/providers'
import { SyncProvider } from '@/stores/syncStore'

export function AppLayout() {
  const [workspaceDialogIsOpen, setWorkspaceDialogIsOpen] = useState(false)
  const [settingsDialogIsOpen, setSettingsDialogIsOpen] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | undefined>()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<
    string | undefined
  >()
  const navigate = useNavigate()
  const location = useLocation()
  const openAPI = useOpenAPI()

  useAutoUpdater()

  useEffect(() => {
    if (!openAPI?.events?.on) return

    const unsub = openAPI.events.on<{ workspaceId: string }>(
      'workspace:switched',
      ({ workspaceId }) => {
        if (!workspaceId) return

        const currentPath = location.pathname
        if (currentPath.includes(`/workspaces/${workspaceId}`)) return

        if (currentPath.startsWith('/workspaces/')) {
          const parts = currentPath.split('/')
          // ['', 'workspaces', ':workspaceId', ...subpath]
          parts[2] = workspaceId
          navigate(parts.join('/'))
          return
        }
        navigate(`/workspaces/${workspaceId}/time-entries`)
      },
    )

    return () => unsub?.()
  }, [openAPI, navigate, location.pathname])

  const routeWorkspaceId = location.pathname.match(/\/workspaces\/([^/]+)/)?.[1]
  const currentWorkspaceId = activeWorkspaceId || routeWorkspaceId
  const isWorkspaceActive = Boolean(
    currentWorkspaceId && location.pathname.startsWith('/workspaces/'),
  )

  function handleWorkspaceCreated(id: string) {
    setActiveWorkspaceId(id)
    navigate(`/workspaces/${id}/time-entries`)
  }

  return (
    <WorkspaceProvider workspaceId={currentWorkspaceId}>
      <DataSourceConnectionsProvider>
        <SyncProvider>
          <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden select-none">
            <TitleBar>{isWorkspaceActive && <Header />}</TitleBar>

            <main className="mt-1.5 flex min-h-0 flex-1 overflow-hidden">
              <NewWorkspaceDialog
                isOpen={workspaceDialogIsOpen}
                setIsOpen={(open) => {
                  setWorkspaceDialogIsOpen(open)
                  if (!open) setEditingDraftId(undefined)
                }}
                workspaceId={editingDraftId}
                onWorkspaceCreated={handleWorkspaceCreated}
              />
              <GlobalSettingsDialog
                isOpen={settingsDialogIsOpen}
                setIsOpen={setSettingsDialogIsOpen}
              />
              <UpdateModal />
              {/* Sidebar */}
              <AppRail
                onNewWorkspaceClick={() => {
                  setEditingDraftId(undefined)
                  setWorkspaceDialogIsOpen(true)
                }}
                onSettingsClick={() => setSettingsDialogIsOpen(true)}
              />

              {/* Painel de drafts */}
              <DraftWorkspacesPanel
                onOpenWorkspace={(id) => {
                  setEditingDraftId(id)
                  setWorkspaceDialogIsOpen(true)
                }}
              />

              <section className="flex flex-1 overflow-hidden rounded-tl-md border-t border-l">
                <Outlet />
              </section>
            </main>
            <Toaster />
            <GlobalConflictResolutionDialog />
          </div>
        </SyncProvider>
      </DataSourceConnectionsProvider>
    </WorkspaceProvider>
  )
}
