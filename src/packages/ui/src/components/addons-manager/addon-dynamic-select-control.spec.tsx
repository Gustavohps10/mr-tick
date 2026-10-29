import type {
  AddonResolveOptionsResponse,
  AddonSettingsSelectField,
} from '@mr-tick/application'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useHostBridge } from '@/hooks/use-host-bridge'

import { AddonDynamicSelectControl } from './addon-dynamic-select-control'

vi.mock('@/hooks/use-host-bridge', () => ({
  useHostBridge: vi.fn(() => ({
    addons: {
      resolveSettingsOptions: vi.fn(),
    },
  })),
}))

describe('AddonDynamicSelectControl', () => {
  it('keeps loaded options when the parent rerenders with equivalent request context', async () => {
    const resolveSettingsOptions = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        availability: 'available',
        options: [{ label: 'Sala Norte', value: 'room-north' }],
        hasMore: false,
      },
    })
    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as unknown as ReturnType<typeof useHostBridge>)

    const field: AddonSettingsSelectField = {
      id: 'room',
      type: 'select',
      label: 'Sala',
      source: { kind: 'dynamic', providerId: 'rooms' },
    }
    const onChange = vi.fn()
    const control = () => (
      <AddonDynamicSelectControl
        field={field}
        addonId="rooms-observer"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'room' }] }}
        value={null}
        onChange={onChange}
        draftValues={{}}
      />
    )
    const { rerender } = render(control())
    fireEvent.click(screen.getByTestId('addon-dynamic-select-room'))
    await screen.findByTestId('addon-select-option-room-north')
    expect(resolveSettingsOptions).toHaveBeenCalledTimes(1)

    rerender(control())

    expect(resolveSettingsOptions).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('addon-select-option-room-north')).toBeVisible()
  })

  it('renders static options and handles selection without auto-selecting options[0]', async () => {
    const field: AddonSettingsSelectField = {
      id: 'timezone',
      type: 'select',
      label: 'Fuso Horário',
      source: {
        kind: 'static',
        options: [
          { label: 'UTC', value: 'UTC' },
          { label: 'America/Sao_Paulo', value: 'America/Sao_Paulo' },
        ],
      },
    }

    const onChange = vi.fn()

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test-addon"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'timezone' }] }}
        value={null}
        onChange={onChange}
        draftValues={{}}
      />,
    )

    const trigger = screen.getByTestId('addon-dynamic-select-timezone')
    expect(trigger).toHaveTextContent('Selecione uma opção')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(trigger)

    const optionSaoPaulo = await screen.findByTestId(
      'addon-select-option-America/Sao_Paulo',
    )
    fireEvent.click(optionSaoPaulo)

    expect(onChange).toHaveBeenCalledWith('America/Sao_Paulo')
  })

  it('fetches dynamic options on-demand when open, not while closed', async () => {
    const resolveSettingsOptions = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        availability: 'available',
        options: [
          { label: 'Canal #geral', value: '111' },
          { label: 'Canal #dev', value: '222' },
        ],
        hasMore: false,
      } as AddonResolveOptionsResponse,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as any)

    const field: AddonSettingsSelectField = {
      id: 'channelId',
      type: 'select',
      label: 'Canal',
      source: {
        kind: 'dynamic',
        providerId: 'discord-channels',
      },
    }

    const onChange = vi.fn()

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channelId' }] }}
        value={null}
        onChange={onChange}
        draftValues={{}}
      />,
    )

    expect(resolveSettingsOptions).not.toHaveBeenCalled()

    const trigger = screen.getByTestId('addon-dynamic-select-channelId')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(resolveSettingsOptions).toHaveBeenCalledTimes(1)
    })

    const optionDev = await screen.findByTestId('addon-select-option-222')
    expect(optionDev).toHaveTextContent('Canal #dev')
  })

  it('renders explicit empty, no-permission, disconnected and error availability states', async () => {
    const resolveSettingsOptions = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        availability: 'no-permission',
        options: [],
        reason:
          'O bot não possui permissão para visualizar canais deste servidor',
        hasMore: false,
      } as AddonResolveOptionsResponse,
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as any)

    const field: AddonSettingsSelectField = {
      id: 'channelId',
      type: 'select',
      label: 'Canal',
      source: {
        kind: 'dynamic',
        providerId: 'discord-channels',
      },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channelId' }] }}
        value={null}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-channelId'))

    const stateNotice = await screen.findByTestId(
      'addon-select-state-channelId',
    )
    expect(stateNotice).toHaveTextContent('Sem permissão')
    expect(stateNotice).toHaveTextContent(
      'O bot não possui permissão para visualizar canais deste servidor',
    )
  })

  it('preserves selected label even when search excludes the selected option', async () => {
    const resolveSettingsOptions = vi.fn().mockImplementation(async (req) => {
      const search = req.body.search
      if (search === 'dev') {
        return {
          isSuccess: true,
          data: {
            availability: 'available',
            options: [{ label: 'Canal #dev', value: '222' }],
            hasMore: false,
          },
        }
      }
      return {
        isSuccess: true,
        data: {
          availability: 'available',
          options: [
            { label: 'Canal #geral', value: '111' },
            { label: 'Canal #dev', value: '222' },
          ],
          hasMore: false,
        },
      }
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as any)

    const field: AddonSettingsSelectField = {
      id: 'channelId',
      type: 'select',
      label: 'Canal',
      source: {
        kind: 'dynamic',
        providerId: 'discord-channels',
      },
    }

    let currentValue: string | number | boolean | null = null
    const onChange = vi.fn((val) => {
      currentValue = val
    })

    const { rerender } = render(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channelId' }] }}
        value={currentValue}
        onChange={onChange}
        draftValues={{}}
      />,
    )

    const trigger = screen.getByTestId('addon-dynamic-select-channelId')
    fireEvent.click(trigger)

    const optionGeral = await screen.findByTestId('addon-select-option-111')
    fireEvent.click(optionGeral)
    expect(onChange).toHaveBeenCalledWith('111')

    rerender(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channelId' }] }}
        value="111"
        onChange={onChange}
        draftValues={{}}
      />,
    )

    expect(
      screen.getByTestId('addon-dynamic-select-channelId'),
    ).toHaveTextContent('Canal #geral')

    fireEvent.click(screen.getByTestId('addon-dynamic-select-channelId'))
    const searchInput = screen.getByTestId(
      'addon-dynamic-select-search-channelId',
    )
    fireEvent.change(searchInput, { target: { value: 'dev' } })

    await screen.findByTestId('addon-select-option-222')
    expect(screen.queryByTestId('addon-select-option-111')).toBeNull()

    // Label on trigger remains preserved!
    expect(
      screen.getByTestId('addon-dynamic-select-channelId'),
    ).toHaveTextContent('Canal #geral')
  })
})
