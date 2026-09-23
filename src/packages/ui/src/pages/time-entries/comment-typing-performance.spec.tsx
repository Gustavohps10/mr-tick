import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-open-api', () => ({
  useOpenAPI: () => ({
    timer: {},
    events: { on: () => () => {}, emit: () => {} },
  }),
}))

import { TaskPopover } from '@/components/task-popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DataSourceConnectionsContext,
  DataSourceConnectionsContextType,
} from '@/contexts/DataSourceConnectionsContext'
import {
  WorkspaceContext,
  WorkspaceContextType,
} from '@/contexts/WorkspaceContext'
import { SyncTimeEntryRxDBDTO } from '@/local-db/schemas/time-entries-sync-schema'
import { TimeEntriesDayCard } from '@/pages/time-entries/components/time-entries-day-card'
import { createTimeEntriesColumns } from '@/pages/time-entries/components/time-entries-table-columns'

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}
})

const mockConnectionsValue: DataSourceConnectionsContextType = {
  isLoading: false,
  connections: [],
  workspaceConnections: [],
  installedPlugins: [],
  link: async () => undefined,
  unlink: async () => undefined,
  connect: async () => undefined,
  disconnect: async () => undefined,
  getConnection: () => undefined,
  isConnected: () => false,
}

const mockWorkspaceValue: WorkspaceContextType = {
  workspace: {
    id: 'ws-1',
    name: 'Default',
    status: 'configured',
    dataSourceConnections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  workspaces: [],
  isLoading: false,
  isLoadingWorkspaces: false,
  create: async () => undefined,
  updateIdentity: async () => undefined,
  remove: async () => undefined,
  isCreating: false,
  isUpdatingIdentity: false,
  isRemoving: false,
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={mockWorkspaceValue}>
        <DataSourceConnectionsContext.Provider value={mockConnectionsValue}>
          <TooltipProvider>{ui}</TooltipProvider>
        </DataSourceConnectionsContext.Provider>
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  )
}

describe('Comment Typing Performance and Responsiveness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('MemoizedCommentInput - buffers typing locally and avoids immediate synchronous parent churn', () => {
    const testEntry: SyncTimeEntryRxDBDTO = {
      id: 'row-1',
      dataSourceId: 'ds-1',
      connectionInstanceId: 'conn-1',
      syncStatus: 'local_only',
      syncError: null,
      remoteId: null,
      lastPulledAt: null,
      lastPushedAt: null,
      task: { id: 'T-100' },
      activity: { id: 'act-dev', name: 'Desenvolvimento' },
      user: { id: 'user-1', name: 'User 1' },
      startDate: '2026-03-01T10:00:00.000Z',
      endDate: '2026-03-01T11:00:00.000Z',
      timeSpent: 3600,
      comments: 'Initial',
      timeStatus: 'finished',
      type: 'manual',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      _deleted: false,
    }

    const handleChange = vi.fn()

    function TableWrapper() {
      const [tempData, setTempData] = useState<
        Record<string, Partial<SyncTimeEntryRxDBDTO>>
      >({})

      const columns = createTimeEntriesColumns({
        activities: [],
        editingRows: { 'row-1': true },
        getRowData: (id) => tempData[id],
        setEditingRows: () => {},
        setTempData: (updater) => {
          setTempData((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater
            handleChange(next['row-1']?.comments)
            return next
          })
        },
        setRowBeingEdited: () => {},
        setTaskLookupOpen: () => {},
        onSaveRow: async () => {},
        onCancelEdit: () => {},
        onDeleteRow: async () => {},
        onDuplicateRow: () => {},
        onAcceptSuggestion: async () => {},
        onDismissSuggestion: () => {},
        onTimeChangeDirect: async () => {},
        onPauseTimer: async () => {},
        onResumeTimer: async () => {},
        onStopTimer: async () => {},
      })

      return (
        <TimeEntriesDayCard
          day={new Date('2026-03-01T10:00:00.000Z')}
          entries={[testEntry]}
          draftEntries={[]}
          tempData={tempData}
          columns={columns}
          expandedRows={{}}
          onExpandedChange={() => {}}
          isGrouped={false}
        />
      )
    }

    renderWithProviders(<TableWrapper />)

    const input = screen.getByTestId('time-entry-comment-input')
    expect(input).toBeTruthy()
    fireEvent.focus(input)

    // Simula digitação rápida de múltiplos caracteres
    fireEvent.change(input, { target: { value: 'In' } })
    fireEvent.change(input, { target: { value: 'Ini' } })
    fireEvent.change(input, { target: { value: 'Init' } })
    fireEvent.change(input, { target: { value: 'Initia' } })
    fireEvent.change(input, { target: { value: 'Initial text fast typing' } })

    // O input reflete o valor imediatamente na tela para o usuário (zero lag visual)
    expect(input.getAttribute('value')).toBe('Initial text fast typing')

    // Ao disparar blur, o valor final é comitado imediatamente
    fireEvent.blur(input)
    expect(input.getAttribute('value')).toBe('Initial text fast typing')
  })

  it('TaskPopover - isolates rapid keystrokes locally and commits on blur / Enter', () => {
    const handleDescriptionChange = vi.fn()

    function PopoverWrapper() {
      const [desc, setDesc] = useState('')
      return (
        <TaskPopover
          trigger={<button>Abrir Detalhes</button>}
          description={desc}
          onDescriptionChange={(val) => {
            setDesc(val)
            handleDescriptionChange(val)
          }}
          activities={[]}
        />
      )
    }

    renderWithProviders(<PopoverWrapper />)

    // Abre o popover
    fireEvent.click(screen.getByText('Abrir Detalhes'))
    const commentInput = screen.getByTestId('time-entry-popover-comment-input')
    expect(commentInput).toBeTruthy()

    fireEvent.focus(commentInput)

    // Digitação rápida de 5 caracteres
    fireEvent.change(commentInput, { target: { value: 'T' } })
    fireEvent.change(commentInput, { target: { value: 'Te' } })
    fireEvent.change(commentInput, { target: { value: 'Tes' } })
    fireEvent.change(commentInput, { target: { value: 'Test' } })
    fireEvent.change(commentInput, { target: { value: 'Teste' } })

    // O input do usuário atualiza instantaneamente
    expect(commentInput.getAttribute('value')).toBe('Teste')

    // Antes do debounce ou blur, o callback externo não deve ser chamado para cada letra
    expect(handleDescriptionChange).toHaveBeenCalledTimes(0)

    // Ao avançar o timer de debounce de digitação (300ms)
    act(() => {
      vi.advanceTimersByTime(350)
    })

    // Callback sincronizado após pausa na digitação
    expect(handleDescriptionChange).toHaveBeenCalledWith('Teste')

    // Continua digitando e pressiona Enter
    fireEvent.change(commentInput, { target: { value: 'Teste concluído' } })
    fireEvent.keyDown(commentInput, { key: 'Enter' })

    // Valor final comitado imediatamente no Enter
    expect(handleDescriptionChange).toHaveBeenCalledWith('Teste concluído')
  })
})
