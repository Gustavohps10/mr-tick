import type {
  AddonOperationalListResponse,
  AddonSettingsOperationalListField,
} from '@mr-tick/application'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useHostBridge } from '@/hooks/use-host-bridge'

import { AddonOperationalRecordsCard } from './addon-operational-records-card'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: vi.fn(),
}))

describe('AddonOperationalRecordsCard', () => {
  const field: AddonSettingsOperationalListField = {
    id: 'pendingCaptures',
    type: 'operational-list',
    label: 'Capturas Pendentes',
    providerId: 'discord-voice-captures',
    actions: [
      {
        id: 'dismiss',
        label: 'Descartar',
        variant: 'destructive',
      },
      {
        id: 'assign',
        label: 'Vincular à Tarefa',
        variant: 'default',
        fields: [
          {
            id: 'comment',
            type: 'text',
            label: 'Comentário',
          },
        ],
      },
    ],
  }

  it('queries operational items and renders badges, duration and data', async () => {
    const getOperationalList = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        items: [
          {
            itemId: 'rec-1',
            title: 'Canal de Voz: Reunião Diária',
            subtitle: 'Guild: Equipe Core',
            status: 'pending',
            timestamp: new Date().toISOString(),
            durationSeconds: 3600,
            data: { participants: '3' },
            availableActions: [
              {
                id: 'dismiss',
                label: 'Descartar',
                variant: 'destructive',
              },
            ],
          },
        ],
        hasMore: false,
      } as AddonOperationalListResponse,
    })

    const executeOperationalAction = vi.fn().mockResolvedValue({
      isSuccess: true,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getOperationalList,
        executeOperationalAction,
      },
    } as any)

    render(
      <AddonOperationalRecordsCard
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
      />,
    )

    await waitFor(() => {
      expect(getOperationalList).toHaveBeenCalled()
    })

    expect(screen.getByText('Canal de Voz: Reunião Diária')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText('60m 0s')).toBeInTheDocument()
    expect(screen.getByText('participants:')).toBeInTheDocument()

    const dismissBtn = screen.getByTestId(
      'addon-operational-action-rec-1-dismiss',
    )
    fireEvent.click(dismissBtn)

    await waitFor(() => {
      expect(executeOperationalAction).toHaveBeenCalledWith({
        body: {
          addonId: 'discord-addon',
          scope: { kind: 'workspace', workspaceId: 'ws-1' },
          providerId: 'discord-voice-captures',
          itemId: 'rec-1',
          actionId: 'dismiss',
        },
      })
    })
  })

  it('renders empty notice when operational list has no pending records', async () => {
    const getOperationalList = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        items: [],
        hasMore: false,
      } as AddonOperationalListResponse,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getOperationalList,
        executeOperationalAction: vi.fn(),
      },
    } as any)

    render(
      <AddonOperationalRecordsCard
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
      />,
    )

    const empty = await screen.findByTestId(
      'addon-operational-empty-pendingCaptures',
    )
    expect(empty).toHaveTextContent('Nenhum registro operacional pendente.')
  })

  it('opens modal for actions with fields, dispatches payload on confirm, and closes modal on scope change', async () => {
    const getOperationalList = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        items: [
          {
            itemId: 'rec-2',
            title: 'Gravação #2',
            status: 'pending',
            timestamp: new Date().toISOString(),
            data: {},
            availableActions: [
              {
                id: 'assign',
                label: 'Vincular à Tarefa',
              },
            ],
          },
        ],
        hasMore: false,
      } as AddonOperationalListResponse,
    })

    const executeOperationalAction = vi.fn().mockResolvedValue({
      isSuccess: true,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: {
        getOperationalList,
        executeOperationalAction,
      },
    } as any)

    const renderCustomField = vi.fn(({ field: f, value, onChange }) => (
      <input
        data-testid={`modal-field-${f.id}`}
        value={value || ''}
        onChange={(e) => onChange(f.id, e.target.value)}
      />
    ))

    const { rerender } = render(
      <AddonOperationalRecordsCard
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        renderField={renderCustomField}
      />,
    )

    await waitFor(() => {
      expect(getOperationalList).toHaveBeenCalled()
    })

    const assignBtn = screen.getByTestId(
      'addon-operational-action-rec-2-assign',
    )
    fireEvent.click(assignBtn)

    expect(
      await screen.findByTestId('addon-operational-action-modal'),
    ).toBeInTheDocument()

    const commentInput = screen.getByTestId('modal-field-comment')
    fireEvent.change(commentInput, {
      target: { value: 'Tarefa do ticket #123' },
    })

    const confirmBtn = screen.getByTestId('addon-operational-modal-confirm')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(executeOperationalAction).toHaveBeenCalledWith({
        body: {
          addonId: 'discord-addon',
          scope: { kind: 'workspace', workspaceId: 'ws-1' },
          providerId: 'discord-voice-captures',
          itemId: 'rec-2',
          actionId: 'assign',
          payload: {
            comment: 'Tarefa do ticket #123',
          },
        },
      })
    })

    // Reopen modal to test scope change reset
    fireEvent.click(assignBtn)
    expect(
      await screen.findByTestId('addon-operational-action-modal'),
    ).toBeInTheDocument()

    // Change scope
    rerender(
      <AddonOperationalRecordsCard
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-2' }}
        renderField={renderCustomField}
      />,
    )

    await waitFor(() => {
      expect(
        screen.queryByTestId('addon-operational-action-modal'),
      ).not.toBeInTheDocument()
    })
  })
})
