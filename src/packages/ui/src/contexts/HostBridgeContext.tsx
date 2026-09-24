import { IHostBridge } from '@mr-tick/application'
import React, { createContext } from 'react'

export const HostBridgeContext = createContext<IHostBridge | null>(null)

interface HostBridgeProviderProps {
  bridge: IHostBridge
  children: React.ReactNode
}

export function HostBridgeProvider({
  bridge,
  children,
}: HostBridgeProviderProps) {
  return (
    <HostBridgeContext.Provider value={bridge}>
      {children}
    </HostBridgeContext.Provider>
  )
}
