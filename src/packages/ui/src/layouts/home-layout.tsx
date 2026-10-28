import { Outlet } from 'react-router'

import { AppSidebarHomeContent, AppSidebarHomeFooter } from '@/components'
import {
  AppSidebar,
  AppSidebarContent,
  AppSidebarFooter,
  AppSidebarHeader,
} from '@/components/app-sidebar'
import { AppSidebarDefaultHeader } from '@/components/app-sidebar/app-sidebar-default-header'
import { Footer } from '@/components/footer'
import { ScrollArea } from '@/components/ui/scroll-area'

export function HomeLayout() {
  return (
    <>
      <AppSidebar>
        <AppSidebarHeader>
          <AppSidebarDefaultHeader />
        </AppSidebarHeader>

        <AppSidebarContent>
          <AppSidebarHomeContent />
        </AppSidebarContent>

        <AppSidebarFooter>
          <AppSidebarHomeFooter />
        </AppSidebarFooter>
      </AppSidebar>

      <main className="h-full flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <section className="p-4">
            <Outlet />
          </section>
          <Footer />
        </ScrollArea>
      </main>
    </>
  )
}
