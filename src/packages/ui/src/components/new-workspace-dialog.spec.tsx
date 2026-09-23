import { WorkspaceViewModel } from '@mr-tick/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React, { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockUpdateIdentity = vi.fn()
const mockGetById = vi.fn()
const mockMarkConfigured = vi.fn()
const mockListInstalled = vi.fn()

vi.mock('@/hooks/use-open-api', () => ({
  useOpenAPI: () => ({
    services: {
      workspaces: {
        create: mockCreate,
        updateIdentity: mockUpdateIdentity,
        getById: mockGetById,
        markWorkspaceAsConfigured: mockMarkConfigured,
      },
    },
    integrations: {
      addons: {
        listInstalled: mockListInstalled,
      },
    },
    events: { on: () => () => {}, emit: () => {} },
  }),
}))

import { NewWorkspaceDialog } from '@/components/new-workspace-dialog'
import {
  WorkspaceContext,
  WorkspaceContextType,
} from '@/contexts/WorkspaceContext'

const backgroundWorkspace: WorkspaceViewModel = {
  id: 'active-background-id',
  name: 'Existing Background Workspace',
  description: 'Background description',
  status: 'configured',
  dataSourceConnections: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockWorkspaceContextValue: WorkspaceContextType = {
  workspace: backgroundWorkspace,
  workspaces: [backgroundWorkspace],
  isLoading: false,
  isLoadingWorkspaces: false,
  create: async () => undefined,
  updateIdentity: async () => undefined,
  remove: async () => undefined,
  isCreating: false,
  isUpdatingIdentity: false,
  isRemoving: false,
}

function TestContainer({
  initialOpen = true,
  workspaceId,
  onWorkspaceCreated,
}: {
  initialOpen?: boolean
  workspaceId?: string
  onWorkspaceCreated?: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={mockWorkspaceContextValue}>
        <NewWorkspaceDialog
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          workspaceId={workspaceId}
          onWorkspaceCreated={onWorkspaceCreated}
        />
      </WorkspaceContext.Provider>
    </QueryClientProvider>
  )
}

describe('NewWorkspaceDialog and StepperForm Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListInstalled.mockResolvedValue({ isSuccess: true, data: [] })
  })

  it('starts with empty fields and does not leak the active background workspace data', () => {
    render(<TestContainer />)

    const nameInput = screen.getByTestId('workspace-name-input')
    const textarea = screen.getByPlaceholderText(
      'Descreva o propósito deste workspace...',
    )

    const nameValue =
      nameInput instanceof HTMLInputElement ? nameInput.value : null
    const textValue =
      textarea instanceof HTMLTextAreaElement ? textarea.value : null

    expect(nameValue).toBe('')
    expect(textValue).toBe('')
    expect(screen.queryByText('Existing Background Workspace')).toBeNull()
  })

  it('creates workspace on Step 1 and advances to Step 2 without closing or flickering', async () => {
    const createdWorkspaceData: WorkspaceViewModel = {
      id: 'brand-new-ws-id',
      name: 'Brand New Workspace',
      description: 'Brand new desc',
      status: 'draft',
      dataSourceConnections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockCreate.mockResolvedValue({
      isSuccess: true,
      data: createdWorkspaceData,
    })

    render(<TestContainer />)

    const nameInput = screen.getByTestId('workspace-name-input')
    fireEvent.change(nameInput, { target: { value: 'Brand New Workspace' } })

    const nextBtn = screen.getByTestId('workspace-stepper-next-btn')
    expect(nextBtn.textContent).toContain('Criar e Continuar')

    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    expect(mockCreate).toHaveBeenCalledWith({
      body: {
        name: 'Brand New Workspace',
        description: '',
        avatarFile: undefined,
      },
    })

    // Dialog must stay open and advance to Step 2
    await waitFor(() => {
      expect(screen.getByText('Como deseja iniciar?')).toBeTruthy()
    })

    // Header now reflects the saved workspace
    expect(screen.getByText('Brand New Workspace')).toBeTruthy()
  })

  it('progresses to confirmation step and only activates on finalize', async () => {
    const onCreated = vi.fn()
    const createdWorkspaceData: WorkspaceViewModel = {
      id: 'ws-finish-id',
      name: 'Complete WS Flow',
      description: '',
      status: 'draft',
      dataSourceConnections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockCreate.mockResolvedValue({
      isSuccess: true,
      data: createdWorkspaceData,
    })
    mockMarkConfigured.mockResolvedValue({
      isSuccess: true,
    })

    render(<TestContainer onWorkspaceCreated={onCreated} />)

    // Step 1: Create
    const nameInput = screen.getByTestId('workspace-name-input')
    fireEvent.change(nameInput, { target: { value: 'Complete WS Flow' } })
    fireEvent.click(screen.getByTestId('workspace-stepper-next-btn'))

    await waitFor(() => {
      expect(screen.getByText('Como deseja iniciar?')).toBeTruthy()
    })

    // Step 2: Source selection -> choose preset
    const presetRadio = screen.getByText('Preset Local')
    fireEvent.click(presetRadio)

    // Advance to Step 3
    fireEvent.click(screen.getByTestId('workspace-stepper-next-btn'))

    await waitFor(() => {
      expect(screen.getByText('Configurações Rápidas')).toBeTruthy()
    })

    // Advance to Step 4 (Confirmation)
    fireEvent.click(screen.getByTestId('workspace-stepper-next-btn'))

    // Step 4: Finish button
    await waitFor(() => {
      expect(screen.getByTestId('workspace-stepper-finish-btn')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('workspace-stepper-finish-btn'))

    await waitFor(() => {
      expect(mockMarkConfigured).toHaveBeenCalledWith({
        body: { workspaceId: 'ws-finish-id' },
      })
      expect(onCreated).toHaveBeenCalledWith('ws-finish-id')
    })
  })

  it('loads draft workspace data and starts on step 2 when editing a draft workspace', async () => {
    const draftWorkspace: WorkspaceViewModel = {
      id: 'existing-draft-id',
      name: 'My Existing Draft',
      description: 'Draft description',
      status: 'draft',
      dataSourceConnections: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockGetById.mockResolvedValue({
      isSuccess: true,
      data: draftWorkspace,
    })

    render(<TestContainer workspaceId="existing-draft-id" />)

    await waitFor(() => {
      expect(mockGetById).toHaveBeenCalledWith({
        body: { workspaceId: 'existing-draft-id' },
      })
    })

    // Stepper starts on source-selection (Step 2) when editing a draft
    await waitFor(() => {
      expect(screen.getByText('Como deseja iniciar?')).toBeTruthy()
    })

    expect(screen.getByText('My Existing Draft')).toBeTruthy()
  })
})
