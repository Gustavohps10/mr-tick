import { AddonManifestViewModel, WorkspaceViewModel } from '@mr-tick/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  DataSourceConnectionsProvider,
  useDataSourceConnections,
} from './DataSourceConnectionsContext'

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    workspace: {
      id: 'workspace',
      connections: [
        { id: 'source', addonId: 'source-addon', status: 'connected' },
        { id: 'watcher', addonId: 'watcher-addon', status: 'connected' },
        { id: 'missing', addonId: 'missing-addon', status: 'connected' },
      ],
    } as WorkspaceViewModel,
  }),
}))
vi.mock('@/hooks', () => ({ useHostBridge: () => ({}) }))

function Probe() {
  const { connections, dataSourceConnections } = useDataSourceConnections()
  return (
    <div>
      <span data-testid="all">
        {connections.map((connection) => connection.connectionId).join(',')}
      </span>
      <span data-testid="sources">
        {dataSourceConnections
          .map((connection) => connection.connectionId)
          .join(',')}
      </span>
    </div>
  )
}

describe('DataSourceConnectionsProvider capability selection', () => {
  it('retains every account and exposes only explicit dataSources for synchronization', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    })
    const addons: AddonManifestViewModel[] = [
      {
        id: 'source-addon',
        version: '1.0.0',
        name: 'Source',
        creator: 'Tests',
        description: '',
        path: '',
        logo: '',
        downloads: 0,
        stars: 0,
        installed: true,
        capabilities: ['dataSource', 'theme'],
      },
      {
        id: 'watcher-addon',
        version: '1.0.0',
        name: 'Watcher',
        creator: 'Tests',
        description: '',
        path: '',
        logo: '',
        downloads: 0,
        stars: 0,
        installed: true,
        capabilities: ['watcher'],
      },
    ]
    client.setQueryData(['plugins', 'installed'], addons)
    render(
      <QueryClientProvider client={client}>
        <DataSourceConnectionsProvider>
          <Probe />
        </DataSourceConnectionsProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('all').textContent).toBe('source,watcher,missing')
    expect(screen.getByTestId('sources').textContent).toBe('source')
  })
})
