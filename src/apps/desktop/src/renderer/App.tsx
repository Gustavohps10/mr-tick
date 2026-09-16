import '@/renderer/index.css'

import type { EnvironmentInfo } from '@mr-tick/application'
import {
  AddonThemeBridge,
  AddonToastBridge,
  Toaster,
} from '@mr-tick/ui/components'
import { queryClient } from '@mr-tick/ui/lib'
import {
  EnvironmentProvider,
  OpenAPIProvider,
  SidebarProvider,
  ThemeProvider,
  TooltipProvider,
} from '@mr-tick/ui/providers'
import { QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'

import { ipcClient } from '@/renderer/ipcClient'
import { router } from '@/renderer/routes'

const defaultEnvironment: EnvironmentInfo = {
  isDevelopment: Boolean(import.meta.env.DEV),
  platform:
    typeof window !== 'undefined' && window.electron?.process?.platform
      ? window.electron.process.platform
      : 'web',
}

export function AppDesktop() {
  const [environment, setEnvironment] = useState(defaultEnvironment)

  useEffect(() => {
    ipcClient.modules.system
      .getEnvironment()
      .then(setEnvironment)
      .catch(() => setEnvironment(defaultEnvironment))
  }, [])

  return (
    <OpenAPIProvider client={ipcClient}>
      <AddonToastBridge />
      <EnvironmentProvider environment={environment}>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <TooltipProvider>
            <SidebarProvider>
              <QueryClientProvider client={queryClient}>
                <NuqsAdapter>
                  <AddonThemeBridge />
                  <RouterProvider router={router} />
                  <Toaster richColors position="bottom-right" />
                </NuqsAdapter>
              </QueryClientProvider>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
      </EnvironmentProvider>
    </OpenAPIProvider>
  )
}
