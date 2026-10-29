import type {
  AddonFormEvaluationResponse,
  AddonSettingsSchema,
  AddonSettingsView,
} from '@mr-tick/application'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostBridge } from '@/hooks/use-host-bridge'

import { AddonSettingsRenderer } from './addon-settings-renderer'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('AddonSettingsRenderer', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  it('renders application status banner (applied) and revision', async () => {
    const savedSettings: AddonSettingsView = {
      schemaVersion: 1,
      revision: 4,
      values: { channel: 'general' },
      credentialStates: {},
      applicationStatus: 'applied',
    }

    const schema: AddonSettingsSchema = [
      {
        id: 'channel',
        type: 'text',
        label: 'Canal',
      },
    ]

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getSchema: vi.fn().mockResolvedValue({ isSuccess: true, data: schema }),
        getSettings: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: savedSettings }),
        listInstalled: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
      },
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <AddonSettingsRenderer
          addonId="test-addon"
          scope={{ kind: 'addon' }}
          hideHeader={true}
        />
      </QueryClientProvider>,
    )

    const appliedBanner = await screen.findByTestId(
      'addon-settings-status-applied',
    )
    expect(appliedBanner).toHaveTextContent(
      'Configurações aplicadas com sucesso (Revisão 4)',
    )
  })

  it('renders failed application banner with reapply button and executes reapplySettings', async () => {
    const savedSettings: AddonSettingsView = {
      schemaVersion: 1,
      revision: 3,
      values: { channel: 'general' },
      credentialStates: {},
      applicationStatus: 'failed',
      applicationError: 'Permissões insuficientes no Discord',
    }

    const schema: AddonSettingsSchema = [
      {
        id: 'channel',
        type: 'text',
        label: 'Canal',
      },
    ]

    const reapplySettings = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        ...savedSettings,
        applicationStatus: 'applied',
      },
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getSchema: vi.fn().mockResolvedValue({ isSuccess: true, data: schema }),
        getSettings: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: savedSettings }),
        listInstalled: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
        reapplySettings,
      },
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <AddonSettingsRenderer
          addonId="test-addon"
          scope={{ kind: 'addon' }}
          hideHeader={true}
        />
      </QueryClientProvider>,
    )

    const failedBanner = await screen.findByTestId(
      'addon-settings-status-failed',
    )
    expect(failedBanner).toHaveTextContent(
      'Permissões insuficientes no Discord',
    )

    const reapplyBtn = screen.getByTestId('reapply-settings-btn')
    fireEvent.click(reapplyBtn)

    await waitFor(() => {
      expect(reapplySettings).toHaveBeenCalledWith({
        body: {
          addonId: 'test-addon',
          scope: { kind: 'addon' },
          revision: 3,
        },
      })
    })
  })

  it('runs form evaluator and displays field error messages on invalid draft', async () => {
    const savedSettings: AddonSettingsView = {
      schemaVersion: 1,
      revision: 1,
      values: { threshold: 10 },
      credentialStates: {},
    }

    const schema: AddonSettingsSchema = [
      {
        id: 'config-tab',
        label: 'Configurações',
        evaluatorId: 'eval-threshold',
        fields: [
          {
            id: 'threshold',
            type: 'number',
            label: 'Limite Mínimo',
          },
        ],
      },
    ]

    const evaluationResponse: AddonFormEvaluationResponse = {
      fieldMessages: [
        {
          address: { path: [{ kind: 'field', fieldId: 'threshold' }] },
          messages: ['O limite mínimo deve ser maior que 0'],
        },
      ],
      fieldVisibility: [
        {
          address: { path: [{ kind: 'field', fieldId: 'threshold' }] },
          visible: true,
        },
      ],
      fieldDisabled: [
        {
          address: { path: [{ kind: 'field', fieldId: 'threshold' }] },
          disabled: false,
        },
      ],
    }

    const evaluateSettingsForm = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: evaluationResponse,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getSchema: vi.fn().mockResolvedValue({ isSuccess: true, data: schema }),
        getSettings: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: savedSettings }),
        listInstalled: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
        evaluateSettingsForm,
      },
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <AddonSettingsRenderer
          addonId="test-addon"
          scope={{ kind: 'addon' }}
          hideHeader={true}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(evaluateSettingsForm).toHaveBeenCalled()
    })

    const errorMsg = await screen.findByText(
      'O limite mínimo deve ser maior que 0',
    )
    expect(errorMsg).toBeInTheDocument()
  })

  it('switches tabs and evaluates form using active tab evaluatorId', async () => {
    const savedSettings: AddonSettingsView = {
      schemaVersion: 1,
      revision: 1,
      values: { optA: 'valA', optB: 'valB' },
      credentialStates: {},
    }

    const schema: AddonSettingsSchema = [
      {
        id: 'tab-1',
        label: 'Aba 1',
        evaluatorId: 'eval-tab-1',
        fields: [
          {
            id: 'optA',
            type: 'text',
            label: 'Opção A',
          },
        ],
      },
      {
        id: 'tab-2',
        label: 'Aba 2',
        evaluatorId: 'eval-tab-2',
        fields: [
          {
            id: 'optB',
            type: 'text',
            label: 'Opção B',
          },
        ],
      },
    ]

    const evaluateSettingsForm = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        fieldMessages: [],
        fieldVisibility: [],
        fieldDisabled: [],
      },
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getSchema: vi.fn().mockResolvedValue({ isSuccess: true, data: schema }),
        getSettings: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: savedSettings }),
        listInstalled: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
        evaluateSettingsForm,
      },
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <AddonSettingsRenderer
          addonId="test-addon"
          scope={{ kind: 'addon' }}
          hideHeader={true}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(evaluateSettingsForm).toHaveBeenCalledWith({
        body: expect.objectContaining({
          evaluatorId: 'eval-tab-1',
        }),
      })
    })

    // Click on Aba 2 trigger
    const tab2Trigger = screen.getByRole('tab', { name: 'Aba 2' })
    await act(async () => {
      tab2Trigger.focus()
      fireEvent.keyDown(tab2Trigger, { key: 'Enter', code: 'Enter' })
    })

    await waitFor(() => {
      expect(evaluateSettingsForm).toHaveBeenCalledWith({
        body: expect.objectContaining({
          evaluatorId: 'eval-tab-2',
        }),
      })
    })
  })

  it('propagates evaluated visibility, disabled, and messages recursively into collection items and clears deep addresses', async () => {
    const savedSettings: AddonSettingsView = {
      schemaVersion: 1,
      revision: 1,
      values: {
        watchers: [
          {
            itemId: 'item-1',
            values: {
              channel: 'discord-chan-1',
              secretNotes: 'to-be-cleared',
            },
          },
        ],
      },
      credentialStates: {},
    }

    const schema: AddonSettingsSchema = [
      {
        id: 'watchers-tab',
        label: 'Observadores',
        evaluatorId: 'eval-watchers',
        fields: [
          {
            id: 'watchers',
            type: 'collection',
            label: 'Lista de Observadores',
            itemLabel: 'Observador',
            fields: [
              {
                id: 'channel',
                type: 'text',
                label: 'Canal Alvo',
              },
              {
                id: 'secretNotes',
                type: 'text',
                label: 'Notas Secretas',
              },
            ],
          },
        ],
      },
    ]

    const channelAddress = {
      path: [
        { kind: 'field' as const, fieldId: 'watchers' },
        { kind: 'item' as const, itemId: 'item-1' },
        { kind: 'field' as const, fieldId: 'channel' },
      ],
    }

    const secretNotesAddress = {
      path: [
        { kind: 'field' as const, fieldId: 'watchers' },
        { kind: 'item' as const, itemId: 'item-1' },
        { kind: 'field' as const, fieldId: 'secretNotes' },
      ],
    }

    const evaluateSettingsForm = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        fieldMessages: [
          {
            address: channelAddress,
            messages: ['Canal inválido ou inacessível'],
          },
        ],
        fieldDisabled: [
          {
            address: channelAddress,
            disabled: true,
          },
        ],
        fieldVisibility: [
          {
            address: secretNotesAddress,
            visible: false,
          },
        ],
        clearFields: [secretNotesAddress],
      },
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getSchema: vi.fn().mockResolvedValue({ isSuccess: true, data: schema }),
        getSettings: vi
          .fn()
          .mockResolvedValue({ isSuccess: true, data: savedSettings }),
        listInstalled: vi.fn().mockResolvedValue({ isSuccess: true, data: [] }),
        evaluateSettingsForm,
      },
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <AddonSettingsRenderer
          addonId="test-addon"
          scope={{ kind: 'addon' }}
          hideHeader={true}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(evaluateSettingsForm).toHaveBeenCalled()
    })

    // Message inside collection item is displayed
    const nestedError = await screen.findByText('Canal inválido ou inacessível')
    expect(nestedError).toBeInTheDocument()

    // Disabled state inside collection item
    const channelInput = screen.getByDisplayValue('discord-chan-1')
    expect(channelInput).toBeDisabled()

    // Field hidden by visibility: false
    expect(screen.queryByText('Notas Secretas')).not.toBeInTheDocument()
  })
})
