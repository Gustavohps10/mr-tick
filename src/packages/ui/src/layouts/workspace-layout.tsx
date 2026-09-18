import {
  ChartColumnBig,
  LayoutDashboard,
  ListTodo,
  Puzzle,
  Timer,
} from 'lucide-react'
import { Outlet, useLocation, useParams } from 'react-router'

import {
  AppSidebar,
  AppSidebarContent,
  AppSidebarFooter,
  AppSidebarHeader,
  AppSidebarWorkspacesContent,
  AppSidebarWorkspacesFooter,
  PageHeaderBreadcrumb,
} from '@/components'
import { AddonsManagerModal } from '@/components/addons-manager/addons-manager-modal'
import { AppSidebarDefaultHeader } from '@/components/app-sidebar/app-sidebar-default-header'
import { Footer } from '@/components/footer'
import { UltimateTimeTracker } from '@/components/time-bar/ultimate-entry-bar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useCurrentWidgetPosition } from '@/hooks/use-timer-settings'
import { useAddonsModalStore } from '@/stores/addonsModalStore'
import { TimeEntryProvider } from '@/stores/timeEntryStore'

export function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [widgetPosition] = useCurrentWidgetPosition()
  const location = useLocation()
  const isAddonsModalOpen = useAddonsModalStore((s) => s.isOpen)
  const closeModal = useAddonsModalStore((s) => s.closeModal)

  const getBreadcrumbItems = () => {
    const base = [
      {
        label: 'Workspace',
        href: `/workspaces/${workspaceId}/time-entries`,
      },
    ]

    if (
      location.pathname.includes('my-metric') ||
      location.pathname.includes('metrics')
    ) {
      return [
        ...base,
        { label: 'Pessoal' },
        { label: 'Métricas', icon: ChartColumnBig },
      ]
    }
    if (location.pathname.includes('time-entries')) {
      return [
        ...base,
        { label: 'Pessoal' },
        { label: 'Meus Apontamentos', icon: Timer },
      ]
    }
    if (location.pathname.includes('activities')) {
      return [
        ...base,
        { label: 'Pessoal' },
        { label: 'Minhas Tarefas', icon: ListTodo },
      ]
    }
    if (location.pathname.includes('calendar')) {
      return [...base, { label: 'Pessoal' }, { label: 'Calendário' }]
    }
    if (location.pathname.includes('addons')) {
      return [
        ...base,
        { label: 'Integrações' },
        { label: 'Addons', icon: Puzzle },
      ]
    }
    if (location.pathname.includes('settings')) {
      return [...base, { label: 'Configurações' }]
    }
    if (location.pathname.includes('team')) {
      return [
        ...base,
        { label: 'Time' },
        { label: 'Visão Geral', icon: LayoutDashboard },
      ]
    }
    if (location.pathname.includes('members')) {
      return [...base, { label: 'Time' }, { label: 'Membros' }]
    }
    return [...base, { label: 'Visão Geral', icon: LayoutDashboard }]
  }

  const breadcrumbItems = getBreadcrumbItems()

  return (
    <TimeEntryProvider>
      <SidebarProvider
        defaultOpen={true}
        className="h-full min-h-0 flex-1 overflow-hidden"
      >
        <AppSidebar>
          <AppSidebarHeader>
            <AppSidebarDefaultHeader />
          </AppSidebarHeader>

          <AppSidebarContent>
            <AppSidebarWorkspacesContent />
          </AppSidebarContent>

          <AppSidebarFooter>
            <AppSidebarWorkspacesFooter />
          </AppSidebarFooter>
        </AppSidebar>

        <main className="flex h-full flex-1 flex-col overflow-hidden">
          {/* Barra Superior Twenty com Sidebar Trigger e Breadcrumbs */}
          <div className="border-border/60 bg-background/95 z-20 flex h-9 shrink-0 items-center justify-between border-b px-3 backdrop-blur-sm select-none">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="hover:bg-muted/70 text-muted-foreground hover:text-foreground h-6.5 w-6.5 rounded-md transition-colors" />
              <div className="bg-border/60 h-3.5 w-px" />
              <PageHeaderBreadcrumb items={breadcrumbItems} />
            </div>
          </div>

          {/* 1. TOPO */}
          {widgetPosition === 'top' && (
            <div
              data-widget-drag-boundary
              className="bg-background z-10 shrink-0 border-b px-2 py-2 shadow-sm"
            >
              <UltimateTimeTracker />
            </div>
          )}

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* 2. ESQUERDA */}
            {widgetPosition === 'left' && (
              <div
                data-widget-drag-boundary
                className="bg-background z-10 flex h-full shrink-0 border-r shadow-sm"
              >
                <UltimateTimeTracker />
              </div>
            )}

            {/* CENTRO */}
            <div className="bg-muted/10 min-w-0 flex-1">
              <ScrollArea className="h-full">
                <section className="px-4 py-4">
                  <Outlet />
                </section>
                <Footer />
              </ScrollArea>
            </div>

            {/* 3. DIREITA */}
            {widgetPosition === 'right' && (
              <div
                data-widget-drag-boundary
                className="bg-background z-10 flex h-full shrink-0 border-l shadow-sm"
              >
                <UltimateTimeTracker />
              </div>
            )}
          </div>

          {/* 4. RODAPÉ */}
          {widgetPosition === 'bottom' && (
            <div
              data-widget-drag-boundary
              className="bg-background z-10 shrink-0 border-t px-2 py-2 shadow-sm"
            >
              <UltimateTimeTracker />
            </div>
          )}
        </main>

        <AddonsManagerModal
          open={isAddonsModalOpen}
          onOpenChange={(open) => {
            if (!open) closeModal()
          }}
        />
      </SidebarProvider>
    </TimeEntryProvider>
  )
}
