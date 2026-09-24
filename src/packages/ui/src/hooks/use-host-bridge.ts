import { IHostBridge } from '@mr-tick/application'
import { useContext } from 'react'

import { HostBridgeContext } from '@/contexts/HostBridgeContext'

export function useHostBridge(): IHostBridge {
  const context = useContext(HostBridgeContext)
  if (!context) {
    throw new Error(
      'useHostBridge() deve ser usado dentro de um <HostBridgeProvider>.',
    )
  }

  return context
}
