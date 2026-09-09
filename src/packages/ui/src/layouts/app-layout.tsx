'use client'

import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AppRail } from '@/components/app-rail'
import { DraftWorkspacesPanel } from '@/components/draft-workspace-panel'
import { Header } from '@/components/header'
import { NewWorkspaceDialog } from '@/components/new-workspace-dialog'
import { GlobalSettingsDialog } from '@/components/settings/global-settings-dialog'
import { TitleBar } from '@/components/title-bar'
import { Toaster } from '@/components/ui/sonner'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { useOpenAPI } from '@/hooks'
import { DataSourceConnectionsProvider } from '@/providers'
import { SyncProvider } from '@/stores/syncStore'

export function AppLayout() {
  const [workspaceDialogIsOpen, setWorkspaceDialogIsOpen] = useState(false)
  const [settingsDialogIsOpen, setSettingsDialogIsOpen] = useState(false)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<
    string | undefined
  >()
  const navigate = useNavigate()
  const location = useLocation()
  const openAPI = useOpenAPI()

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
        } else {
          navigate(`/workspaces/${workspaceId}/time-entries`)
        }
      },
    )

    return () => unsub?.()
  }, [openAPI, navigate, location.pathname])

  const routeWorkspaceId = location.pathname.match(/\/workspaces\/([^/]+)/)?.[1]
  const currentWorkspaceId = activeWorkspaceId || routeWorkspaceId
  const isWorkspaceActive = Boolean(
    currentWorkspaceId && location.pathname.startsWith('/workspaces/'),
  )

  return (
    <WorkspaceProvider workspaceId={currentWorkspaceId}>
      <DataSourceConnectionsProvider>
        <SyncProvider>
          <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden select-none">
            <TitleBar>{isWorkspaceActive && <Header />}</TitleBar>

            <main className="mt-1.5 flex min-h-0 flex-1 overflow-hidden">
              <NewWorkspaceDialog
                isOpen={workspaceDialogIsOpen}
                setIsOpen={setWorkspaceDialogIsOpen}
                setWorkspaceId={setActiveWorkspaceId}
              />
              <GlobalSettingsDialog
                isOpen={settingsDialogIsOpen}
                setIsOpen={setSettingsDialogIsOpen}
              />
              {/* Sidebar */}
              <AppRail
                onNewWorkspaceClick={() => {
                  setActiveWorkspaceId(undefined)
                  setWorkspaceDialogIsOpen(true)
                }}
                onSettingsClick={() => setSettingsDialogIsOpen(true)}
              />

              {/* Painel de drafts */}
              <DraftWorkspacesPanel
                onOpenWorkspace={(id) => {
                  console.log(id)
                  setActiveWorkspaceId(id)
                  setWorkspaceDialogIsOpen(true)
                }}
              />

              <section className="flex flex-1 overflow-hidden rounded-tl-md border-t border-l">
                <Outlet />
              </section>
            </main>
            <Toaster />
          </div>
        </SyncProvider>
      </DataSourceConnectionsProvider>
    </WorkspaceProvider>
  )
}
