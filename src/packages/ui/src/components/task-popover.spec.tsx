import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { toast } from 'sonner'
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

const TEST_ACTIVITIES = [
  { id: 'dev', name: 'Desenvolvimento' },
  { id: 'design', name: 'Design' },
]

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

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}
})

describe('TaskPopover - Activity selection and remote constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should keep the popover open when selecting an activity', async () => {
    function ControlledTest() {
      const [activity, setActivity] = useState('')
      return (
        <TaskPopover
          trigger={<button>Abrir Detalhes</button>}
          selectedActivity={activity}
          onActivityChange={setActivity}
          activities={TEST_ACTIVITIES}
        />
      )
    }

    const { baseElement } = renderWithProviders(<ControlledTest />)

    // Abre o popover
    fireEvent.click(screen.getByText('Abrir Detalhes'))
    expect(screen.getByText('Detalhes da Tarefa')).toBeTruthy()

    // Abre o select de atividade
    const selectTrigger = baseElement.querySelector(
      '[data-slot="select-trigger"]',
    )
    if (selectTrigger) {
      fireEvent.keyDown(selectTrigger, { key: 'ArrowDown' })
    }

    // Clica na opção de desenvolvimento
    const option = screen.getByRole('option', { name: /Desenvolvimento/ })
    fireEvent.click(option)

    // O popover de tarefa NÃO pode fechar ao selecionar atividade
    expect(screen.getByText('Detalhes da Tarefa')).toBeTruthy()
  })

  it('should allow returning to empty (Sem atividade) when isRemote is false', async () => {
    const handleActivityChange = vi.fn()

    const { baseElement } = renderWithProviders(
      <TaskPopover
        trigger={<button>Abrir Detalhes</button>}
        selectedActivity="dev"
        onActivityChange={handleActivityChange}
        activities={TEST_ACTIVITIES}
        isRemote={false}
      />,
    )

    // Abre o popover
    fireEvent.click(screen.getByText('Abrir Detalhes'))

    // Abre o select de atividade
    const selectTrigger = baseElement.querySelector(
      '[data-slot="select-trigger"]',
    )
    if (selectTrigger) {
      fireEvent.keyDown(selectTrigger, { key: 'ArrowDown' })
    }

    // Opção "Sem atividade" deve estar disponível quando local
    const semAtividadeOption = screen.getByRole('option', {
      name: /Sem atividade/,
    })
    expect(semAtividadeOption).toBeTruthy()

    // Clica para limpar a atividade
    fireEvent.click(semAtividadeOption)
    expect(handleActivityChange).toHaveBeenCalledWith('')
    expect(screen.getByText('Detalhes da Tarefa')).toBeTruthy()
  })

  it('should NOT show Sem atividade option when isRemote is true', async () => {
    const handleActivityChange = vi.fn()

    const { baseElement } = renderWithProviders(
      <TaskPopover
        trigger={<button>Abrir Detalhes</button>}
        selectedActivity="dev"
        onActivityChange={handleActivityChange}
        activities={TEST_ACTIVITIES}
        isRemote={true}
      />,
    )

    // Abre o popover
    fireEvent.click(screen.getByText('Abrir Detalhes'))

    // Abre o select de atividade
    const selectTrigger = baseElement.querySelector(
      '[data-slot="select-trigger"]',
    )
    if (selectTrigger) {
      fireEvent.keyDown(selectTrigger, { key: 'ArrowDown' })
    }

    // Opção "Sem atividade" NÃO deve estar disponível quando remoto
    expect(screen.queryByRole('option', { name: /Sem atividade/ })).toBeNull()
  })

  it('should prevent clearing task when isRemote is true upon commit', async () => {
    const toastErrorSpy = vi.spyOn(toast, 'error')

    function ControlledTaskTest() {
      const [id, setId] = useState('123')
      return (
        <TaskPopover
          trigger={<button>Abrir Detalhes</button>}
          taskId={id}
          onTaskIdChange={setId}
          activities={TEST_ACTIVITIES}
          isRemote={true}
        />
      )
    }

    renderWithProviders(<ControlledTaskTest />)

    // Abre o popover
    fireEvent.click(screen.getByText('Abrir Detalhes'))

    // Limpa o input de tarefa
    const taskInput = screen.getByTestId('time-entry-task-lookup-input')
    fireEvent.change(taskInput, { target: { value: '' } })

    // Tenta submeter com Enter
    fireEvent.keyDown(taskInput, { key: 'Enter' })

    // Deve exibir toast de erro e não permitir salvar vazio
    expect(toastErrorSpy).toHaveBeenCalledWith(
      'Registros sincronizados com o servidor não podem ficar sem tarefa',
    )
    expect(screen.getByText('Detalhes da Tarefa')).toBeTruthy()
  })
})
