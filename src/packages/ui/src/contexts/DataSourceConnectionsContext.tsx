'use client'

import {
  AddonManifestViewModel,
  ConnectionResultViewModel,
  ViewModel,
  WorkspaceConnectionViewModel,
  WorkspaceViewModel,
} from '@mr-tick/sdk'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'

export type ConnectionInstanceId = string

export interface AddonConnectionView {
  connectionId: string
  dataSourceId: string
  status: WorkspaceConnectionViewModel['status']
  config?: Record<string, unknown>

  member?: WorkspaceConnectionViewModel['member']

  addon?: AddonManifestViewModel
}

export interface DataSourceConnectionsContextType {
  isLoading: boolean

  connections: AddonConnectionView[]

  workspaceConnections: WorkspaceViewModel['dataSourceConnections']

  installedPlugins: AddonManifestViewModel[]

  link: (params: {
    connectionInstanceId: ConnectionInstanceId
    pluginId: string
  }) => Promise<ViewModel<WorkspaceViewModel> | undefined>

  unlink: (
    connectionInstanceId?: ConnectionInstanceId,
  ) => Promise<ViewModel<WorkspaceViewModel> | undefined>

  connect: (params: {
    connectionInstanceId: ConnectionInstanceId
    pluginId: string
    credentials: Record<string, string | number | boolean>
    configuration: Record<string, string | number | boolean>
  }) => Promise<ViewModel<ConnectionResultViewModel> | undefined>

  disconnect: (
    connectionInstanceId: ConnectionInstanceId,
  ) => Promise<ViewModel<void> | undefined>

  getConnection: (
    connectionInstanceId: ConnectionInstanceId,
  ) => AddonConnectionView | undefined

  isConnected: (connectionInstanceId: ConnectionInstanceId) => boolean
}

export const DataSourceConnectionsContext = createContext<
  DataSourceConnectionsContextType | undefined
>(undefined)

export function DataSourceConnectionsProvider({
  children,
}: {
  children: ReactNode
}) {
  const { workspace } = useWorkspace()
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  const workspaceId = workspace?.id
  const workspaceConnections = workspace?.dataSourceConnections ?? []

  const { data: installedPlugins = [] } = useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: async () => {
      const res = await bridge.addons.listInstalled()
      if (!res.isSuccess) return []
      return res.data ?? []
    },
  })

  const connections = useMemo<AddonConnectionView[]>(() => {
    return workspaceConnections.map((conn) => {
      const addon = installedPlugins.find((a) => a.id === conn.dataSourceId)

      return {
        connectionId: conn.id,
        dataSourceId: conn.dataSourceId,
        status: conn.status,
        config: conn.config,
        member: conn.member,
        addon,
      }
    })
  }, [workspaceConnections, installedPlugins])

  const getConnection = useCallback(
    (connectionInstanceId: string) => {
      return connections.find((c) => c.connectionId === connectionInstanceId)
    },
    [connections],
  )

  const isConnected = useCallback(
    (connectionInstanceId: string): boolean => {
      return (
        workspaceConnections.find((c) => c.id === connectionInstanceId)
          ?.status === 'connected'
      )
    },
    [workspaceConnections],
  )

  const link = useCallback(
    async ({
      connectionInstanceId,
      pluginId,
    }: {
      connectionInstanceId: ConnectionInstanceId
      pluginId: string
    }) => {
      if (!workspaceId) return

      const res = await bridge.workspaces.linkDataSource({
        body: {
          workspaceId,
          dataSourceId: pluginId,
          connectionInstanceId,
        },
      })

      if (res.isSuccess) {
        queryClient.setQueryData<WorkspaceViewModel>(
          ['workspace', workspaceId],
          (prev) => {
            if (!prev) return prev

            const exists = prev.dataSourceConnections.some(
              (c) => c.id === connectionInstanceId,
            )

            if (exists) return prev

            return {
              ...prev,
              dataSourceConnections: [
                ...prev.dataSourceConnections,
                {
                  id: connectionInstanceId,
                  dataSourceId: pluginId,
                  status: 'disconnected',
                },
              ],
            }
          },
        )
      }

      return res
    },
    [bridge, workspaceId, queryClient],
  )

  const unlink = useCallback(
    async (connectionInstanceId?: ConnectionInstanceId) => {
      if (!workspaceId || !connectionInstanceId) return

      const res = await bridge.workspaces.unlinkDataSource({
        body: {
          workspaceId,
          connectionInstanceId,
        },
      })

      if (res.isSuccess) {
        queryClient.setQueryData<WorkspaceViewModel>(
          ['workspace', workspaceId],
          (prev) => {
            if (!prev) return prev

            return {
              ...prev,
              dataSourceConnections: connectionInstanceId
                ? prev.dataSourceConnections.filter(
                    (c) => c.id !== connectionInstanceId,
                  )
                : [],
            }
          },
        )
      }

      return res
    },
    [bridge, workspaceId, queryClient],
  )

  const connect = useCallback(
    async ({
      connectionInstanceId,
      pluginId,
      credentials,
      configuration,
    }: {
      connectionInstanceId: ConnectionInstanceId
      pluginId: string
      credentials: Record<string, string | number | boolean>
      configuration: Record<string, string | number | boolean>
    }) => {
      if (!workspaceId) return

      const res = await bridge.workspaces.connectDataSource({
        body: {
          workspaceId,
          connectionInstanceId,
          pluginId,
          credentials,
          configuration,
        },
      })

      if (res.isSuccess && res.data) {
        queryClient.setQueryData<WorkspaceViewModel>(
          ['workspace', workspaceId],
          (prev) => {
            if (!prev) return prev

            return {
              ...prev,
              dataSourceConnections: prev.dataSourceConnections.map((c) =>
                c.id === connectionInstanceId
                  ? {
                      ...c,
                      status: 'connected',
                      config: configuration,
                      member: {
                        id: res.data?.member?.id.toString() ?? '',
                        login: res.data?.member?.login ?? '',
                        name: `${res.data?.member?.firstname ?? ''} ${res.data?.member?.lastname ?? ''}`.trim(),
                        avatarUrl: res.data?.member?.avatarUrl ?? undefined,
                      },
                    }
                  : c,
              ),
            }
          },
        )
      }

      return res
    },
    [bridge, workspaceId, queryClient],
  )

  const disconnect = useCallback(
    async (connectionInstanceId: ConnectionInstanceId) => {
      if (!workspaceId) return

      const res = await bridge.workspaces.disconnectDataSource({
        body: {
          workspaceId,
          connectionInstanceId,
        },
      })

      if (res.isSuccess) {
        queryClient.setQueryData<WorkspaceViewModel>(
          ['workspace', workspaceId],
          (prev) => {
            if (!prev) return prev

            return {
              ...prev,
              dataSourceConnections: prev.dataSourceConnections.map((c) =>
                c.id === connectionInstanceId
                  ? {
                      ...c,
                      status: 'disconnected',
                      config: undefined,
                      member: undefined,
                    }
                  : c,
              ),
            }
          },
        )
      }

      return res
    },
    [bridge, workspaceId, queryClient],
  )

  const value = useMemo<DataSourceConnectionsContextType>(
    () => ({
      isLoading: false,
      connections,
      workspaceConnections,
      installedPlugins,
      link,
      unlink,
      connect,
      disconnect,
      getConnection,
      isConnected,
    }),
    [
      connections,
      workspaceConnections,
      installedPlugins,
      link,
      unlink,
      connect,
      disconnect,
      getConnection,
      isConnected,
    ],
  )

  return (
    <DataSourceConnectionsContext.Provider value={value}>
      {children}
    </DataSourceConnectionsContext.Provider>
  )
}

export function useDataSourceConnections(): DataSourceConnectionsContextType {
  const context = useContext(DataSourceConnectionsContext)

  if (!context) {
    throw new Error(
      'useDataSourceConnections must be used within a DataSourceConnectionsProvider',
    )
  }

  return context
}
