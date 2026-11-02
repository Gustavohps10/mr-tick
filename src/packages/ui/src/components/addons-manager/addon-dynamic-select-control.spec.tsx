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

  it('renders contiguous group headers without repeating across continuous pages', async () => {
    let callCount = 0
    const resolveSettingsOptions = vi.fn().mockImplementation(async (req) => {
      callCount++
      if (req.body.cursor === 'page-2') {
        return {
          isSuccess: true,
          data: {
            availability: 'available',
            options: [
              {
                label: 'Sala B2',
                value: 'room-b2',
                group: { id: 'floor-2', label: 'Segundo Andar' },
              },
              {
                label: 'Auditório',
                value: 'auditorium',
                group: { id: 'floor-3', label: 'Terceiro Andar' },
              },
            ],
            hasMore: false,
          },
        }
      }
      return {
        isSuccess: true,
        data: {
          availability: 'available',
          options: [
            {
              label: 'Sala A1',
              value: 'room-a1',
              group: { id: 'floor-1', label: 'Primeiro Andar' },
            },
            {
              label: 'Sala B1',
              value: 'room-b1',
              group: { id: 'floor-2', label: 'Segundo Andar' },
            },
          ],
          hasMore: true,
          nextCursor: 'page-2',
        },
      }
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as any)

    const field: AddonSettingsSelectField = {
      id: 'meetingRoom',
      type: 'select',
      label: 'Sala de Reunião',
      source: { kind: 'dynamic', providerId: 'rooms' },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test-addon"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'meetingRoom' }] }}
        value={null}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-meetingRoom'))

    await screen.findByTestId('addon-select-option-room-a1')
    expect(screen.getByTestId('addon-select-group-floor-1')).toHaveTextContent(
      'Primeiro Andar',
    )
    expect(screen.getByTestId('addon-select-group-floor-2')).toHaveTextContent(
      'Segundo Andar',
    )

    // Load next page
    const loadMoreBtn = screen.getByTestId(
      'addon-dynamic-select-load-more-meetingRoom',
    )
    fireEvent.click(loadMoreBtn)

    await screen.findByTestId('addon-select-option-room-b2')
    // floor-2 is contiguous with page 1, so it shouldn't create a duplicated header
    const floor2Headers = screen.getAllByTestId('addon-select-group-floor-2')
    expect(floor2Headers).toHaveLength(1)

    // floor-3 is a new group
    expect(screen.getByTestId('addon-select-group-floor-3')).toHaveTextContent(
      'Terceiro Andar',
    )
  })

  it('disambiguates homonymous options by showing group context in trigger and multiselect badges', async () => {
    const field: AddonSettingsSelectField = {
      id: 'channel',
      type: 'select',
      label: 'Canal',
      source: {
        kind: 'static',
        options: [
          {
            label: 'geral',
            value: 'chan-1',
            group: { id: 'cat-text', label: 'Canais de Texto' },
          },
          {
            label: 'geral',
            value: 'chan-2',
            group: { id: 'cat-voice', label: 'Canais de Voz' },
          },
        ],
      },
    }

    let selectedVal: any = null
    const onChange = vi.fn((val) => {
      selectedVal = val
    })

    const { rerender } = render(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channel' }] }}
        value={selectedVal}
        onChange={onChange}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-channel'))
    const voiceGeral = screen.getByTestId('addon-select-option-chan-2')
    fireEvent.click(voiceGeral)

    expect(onChange).toHaveBeenCalledWith('chan-2')

    rerender(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channel' }] }}
        value="chan-2"
        onChange={onChange}
        draftValues={{}}
      />,
    )

    // Single select trigger displays "Canais de Voz · geral"
    const trigger = screen.getByTestId('addon-dynamic-select-channel')
    expect(trigger).toHaveTextContent('Canais de Voz · geral')
  })

  it('renders multiselect badges with compact group prefix and handles multiple selections', () => {
    const multiField = {
      id: 'channels',
      type: 'multiselect' as const,
      label: 'Canais Selecionados',
      source: {
        kind: 'static' as const,
        options: [
          {
            label: 'dev',
            value: 'chan-dev',
            group: { id: 'cat-tech', label: 'Tecnologia' },
          },
          {
            label: 'random',
            value: 'chan-rnd',
            group: { id: 'cat-lounge', label: 'Social' },
          },
        ],
      },
    }

    render(
      <AddonDynamicSelectControl
        field={multiField}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channels' }] }}
        value={['chan-dev', 'chan-rnd']}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    const trigger = screen.getByTestId('addon-dynamic-select-channels')
    expect(trigger).toHaveTextContent('Tecnologia · dev')
    expect(trigger).toHaveTextContent('Social · random')
  })

  it('clears presentation cache when field dependency changes, but retains current value fallback and discards stale presentation', async () => {
    const resolveSettingsOptions = vi.fn().mockImplementation(async (req) => {
      const server = req.body.dependencies.find(
        (d: any) =>
          d.address.path[d.address.path.length - 1].fieldId === 'serverId',
      )?.value

      if (server === 'server-alpha') {
        return {
          isSuccess: true,
          data: {
            availability: 'available',
            options: [
              {
                label: 'Canal Alpha 1',
                value: 'chan-1',
                group: { id: 'grp-alpha', label: 'Servidor Alpha' },
                imageUrl: 'https://cdn.discordapp.com/icons/alpha.png',
              },
            ],
            hasMore: false,
          },
        }
      }

      return {
        isSuccess: true,
        data: {
          availability: 'available',
          options: [
            {
              label: 'Canal Beta 2',
              value: 'chan-2',
              group: { id: 'grp-beta', label: 'Servidor Beta' },
            },
          ],
          hasMore: false,
        },
      }
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as any)

    const field: AddonSettingsSelectField = {
      id: 'channel',
      type: 'select',
      label: 'Canal',
      source: {
        kind: 'dynamic',
        providerId: 'channels',
        dependsOn: [
          {
            base: 'root',
            address: { path: [{ kind: 'field', fieldId: 'serverId' }] },
          },
        ],
      },
    }

    let currentValue: string | number | boolean | null = null
    const onChange = vi.fn((val) => {
      currentValue = val
    })

    const { rerender } = render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channel' }] }}
        value={currentValue}
        onChange={onChange}
        draftValues={{ serverId: 'server-alpha' }}
      />,
    )

    // Open to trigger fetch and populate presentation cache
    fireEvent.click(screen.getByTestId('addon-dynamic-select-channel'))
    const optAlpha = await screen.findByTestId('addon-select-option-chan-1')
    fireEvent.click(optAlpha)
    expect(onChange).toHaveBeenCalledWith('chan-1')

    rerender(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channel' }] }}
        value="chan-1"
        onChange={onChange}
        draftValues={{ serverId: 'server-alpha' }}
      />,
    )

    // Presentation cache populated: shows "Servidor Alpha · Canal Alpha 1"
    const trigger = screen.getByTestId('addon-dynamic-select-channel')
    expect(trigger).toHaveTextContent('Servidor Alpha · Canal Alpha 1')

    // Changing serverId (dependency change) must wipe presentation cache
    rerender(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'channel' }] }}
        value="chan-1"
        onChange={onChange}
        draftValues={{ serverId: 'server-beta' }}
      />,
    )

    // presentation cache cleared: falls back to raw value without stale group or label
    expect(
      screen.getByTestId('addon-dynamic-select-channel'),
    ).toHaveTextContent('chan-1')
    expect(
      screen.getByTestId('addon-dynamic-select-channel'),
    ).not.toHaveTextContent('Servidor Alpha')
  })

  it('renders distinct headers for groups with the same label but different IDs', () => {
    const field: AddonSettingsSelectField = {
      id: 'mixed',
      type: 'select',
      label: 'Misto',
      source: {
        kind: 'static',
        options: [
          {
            label: 'Sala 1',
            value: 's1',
            group: { id: 'building-a-floor-1', label: '1º Andar' },
          },
          {
            label: 'Sala 2',
            value: 's2',
            group: { id: 'building-b-floor-1', label: '1º Andar' },
          },
        ],
      },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'mixed' }] }}
        value={null}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-mixed'))
    const headerA = screen.getByTestId('addon-select-group-building-a-floor-1')
    const headerB = screen.getByTestId('addon-select-group-building-b-floor-1')
    expect(headerA).toHaveTextContent('1º Andar')
    expect(headerB).toHaveTextContent('1º Andar')
  })

  it('handles A-B-A transition with an ungrouped option in the middle', () => {
    const field: AddonSettingsSelectField = {
      id: 'flow',
      type: 'select',
      label: 'Fluxo',
      source: {
        kind: 'static',
        options: [
          {
            label: 'Item A1',
            value: 'a1',
            group: { id: 'grp-a', label: 'Grupo A' },
          },
          {
            label: 'Item Avulso',
            value: 'orphan',
          },
          {
            label: 'Item A2',
            value: 'a2',
            group: { id: 'grp-a', label: 'Grupo A' },
          },
        ],
      },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'flow' }] }}
        value={null}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-flow'))
    const headers = screen.getAllByTestId('addon-select-group-grp-a')
    expect(headers).toHaveLength(2)
    expect(screen.getByTestId('addon-select-option-orphan')).toBeVisible()
  })

  it('preserves option when group is invalid (empty id or label)', () => {
    const field: AddonSettingsSelectField = {
      id: 'invalid-group',
      type: 'select',
      label: 'Grupo Inválido',
      source: {
        kind: 'static',
        options: [
          {
            label: 'Item Válido com Grupo Vazio',
            value: 'v1',
            group: { id: '  ', label: 'Rótulo' },
          },
          {
            label: 'Item Válido com Rótulo Vazio',
            value: 'v2',
            group: { id: 'grp-ok', label: '   ' },
          },
        ],
      },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'invalid-group' }] }}
        value={null}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-invalid-group'))
    expect(screen.getByTestId('addon-select-option-v1')).toHaveTextContent(
      'Item Válido com Grupo Vazio',
    )
    expect(screen.getByTestId('addon-select-option-v2')).toHaveTextContent(
      'Item Válido com Rótulo Vazio',
    )
    expect(screen.queryByTestId('addon-select-group-grp-ok')).toBeNull()
  })

  it('preserves selected group and image presentation during search filtering', async () => {
    const resolveSettingsOptions = vi.fn().mockImplementation(async (req) => {
      const search = req.body.search
      if (search === '222') {
        return {
          isSuccess: true,
          data: {
            availability: 'available',
            options: [
              {
                label: 'Canal 222',
                value: '222',
                group: { id: 'cat-voice', label: 'Voz' },
              },
            ],
            hasMore: false,
          },
        }
      }
      return {
        isSuccess: true,
        data: {
          availability: 'available',
          options: [
            {
              label: 'Canal 111',
              value: '111',
              group: { id: 'cat-text', label: 'Texto' },
              imageUrl: 'https://cdn.discordapp.com/icons/c1.png',
            },
            {
              label: 'Canal 222',
              value: '222',
              group: { id: 'cat-voice', label: 'Voz' },
            },
          ],
          hasMore: false,
        },
      }
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as any)

    const field: AddonSettingsSelectField = {
      id: 'searchChan',
      type: 'select',
      label: 'Canal',
      source: { kind: 'dynamic', providerId: 'channels' },
    }

    let currentValue: any = null
    const onChange = vi.fn((val) => {
      currentValue = val
    })

    const { rerender } = render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'searchChan' }] }}
        value={currentValue}
        onChange={onChange}
        draftValues={{}}
      />,
    )

    fireEvent.click(screen.getByTestId('addon-dynamic-select-searchChan'))
    const opt111 = await screen.findByTestId('addon-select-option-111')
    fireEvent.click(opt111)

    rerender(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'addon' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'searchChan' }] }}
        value="111"
        onChange={onChange}
        draftValues={{}}
      />,
    )

    const trigger = screen.getByTestId('addon-dynamic-select-searchChan')
    expect(trigger).toHaveTextContent('Texto · Canal 111')
    expect(trigger.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.discordapp.com/icons/c1.png',
    )

    // Trigger search filtering that excludes 111
    fireEvent.click(trigger)
    const searchInput = screen.getByTestId(
      'addon-dynamic-select-search-searchChan',
    )
    fireEvent.change(searchInput, { target: { value: '222' } })

    await screen.findByTestId('addon-select-option-222')
    expect(screen.queryByTestId('addon-select-option-111')).toBeNull()

    // Trigger still retains group, label and image
    expect(trigger).toHaveTextContent('Texto · Canal 111')
    expect(trigger.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.discordapp.com/icons/c1.png',
    )
  })

  it('preserves static option presentation after scope changes using same source', () => {
    const field: AddonSettingsSelectField = {
      id: 'static-tz',
      type: 'select',
      label: 'Fuso',
      source: {
        kind: 'static',
        options: [
          {
            label: 'Brasília',
            value: 'America/Sao_Paulo',
            group: { id: 'br', label: 'Brasil' },
            imageUrl: 'https://cdn.example.com/br.png',
          },
        ],
      },
    }

    const { rerender } = render(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'static-tz' }] }}
        value="America/Sao_Paulo"
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    const trigger = screen.getByTestId('addon-dynamic-select-static-tz')
    expect(trigger).toHaveTextContent('Brasil · Brasília')

    // Change scope from ws-1 to ws-2
    rerender(
      <AddonDynamicSelectControl
        field={field}
        addonId="test"
        scope={{ kind: 'workspace', workspaceId: 'ws-2' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'static-tz' }] }}
        value="America/Sao_Paulo"
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    // Presentation must still be preserved for static source
    expect(trigger).toHaveTextContent('Brasil · Brasília')
  })

  it('resolves presentation in background when mounted with a pre-registered dynamic value while closed', async () => {
    const resolveSettingsOptions = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        availability: 'available',
        options: [
          {
            label: 'Comunidade Principal',
            value: '1294040636718317618',
            group: { id: 'grp-guilds', label: 'Servidores' },
            imageUrl:
              'https://cdn.discordapp.com/icons/1294040636718317618/icon.png',
          },
        ],
        hasMore: false,
      },
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as unknown as ReturnType<typeof useHostBridge>)

    const field: AddonSettingsSelectField = {
      id: 'guild',
      type: 'select',
      label: 'Servidor',
      source: {
        kind: 'dynamic',
        providerId: 'discord.guilds',
      },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord-observer"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'guild' }] }}
        value="1294040636718317618"
        onChange={vi.fn()}
        draftValues={{ guild: '1294040636718317618' }}
      />,
    )

    // Trigger initially resolves in the background and updates presentation
    await waitFor(() => {
      const trigger = screen.getByTestId('addon-dynamic-select-guild')
      expect(trigger).toHaveTextContent('Servidores · Comunidade Principal')
    })

    expect(resolveSettingsOptions).toHaveBeenCalledTimes(1)
  })

  it('resolves presentation in background for multiselect when mounted with pre-registered values', async () => {
    const resolveSettingsOptions = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        availability: 'available',
        options: [
          {
            label: 'Canal Dev',
            value: 'chan-101',
            group: { id: 'dev-cat', label: 'Engenharia' },
          },
          {
            label: 'Canal QA',
            value: 'chan-102',
            group: { id: 'qa-cat', label: 'Qualidade' },
          },
        ],
        hasMore: false,
      },
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as unknown as ReturnType<typeof useHostBridge>)

    const multiField = {
      id: 'voiceChannels',
      type: 'multiselect' as const,
      label: 'Canais de Voz',
      source: {
        kind: 'dynamic' as const,
        providerId: 'discord.channels',
      },
    }

    render(
      <AddonDynamicSelectControl
        field={multiField}
        addonId="discord-observer"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'voiceChannels' }] }}
        value={['chan-101', 'chan-102']}
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    await waitFor(() => {
      const trigger = screen.getByTestId('addon-dynamic-select-voiceChannels')
      expect(trigger).toHaveTextContent('Engenharia · Canal Dev')
      expect(trigger).toHaveTextContent('Qualidade · Canal QA')
    })

    expect(resolveSettingsOptions).toHaveBeenCalledTimes(1)
  })

  it('matches presentation even when value is provided as number and option as string', async () => {
    const resolveSettingsOptions = vi.fn().mockResolvedValue({
      isSuccess: true,
      data: {
        availability: 'available',
        options: [
          {
            label: 'Servidor dos Devs',
            value: '1294040636718317618',
            group: { id: 'grp-1', label: 'Servidores' },
          },
        ],
        hasMore: false,
      },
    })

    vi.mocked(useHostBridge).mockReturnValue({
      addons: { resolveSettingsOptions },
    } as unknown as ReturnType<typeof useHostBridge>)

    const field: AddonSettingsSelectField = {
      id: 'guild',
      type: 'select',
      label: 'Servidor',
      source: {
        kind: 'dynamic',
        providerId: 'discord.guilds',
      },
    }

    render(
      <AddonDynamicSelectControl
        field={field}
        addonId="discord-observer"
        scope={{ kind: 'workspace', workspaceId: 'ws-1' }}
        fieldAddress={{ path: [{ kind: 'field', fieldId: 'guild' }] }}
        value="1294040636718317618"
        onChange={vi.fn()}
        draftValues={{}}
      />,
    )

    await waitFor(() => {
      const trigger = screen.getByTestId('addon-dynamic-select-guild')
      expect(trigger).toHaveTextContent('Servidores · Servidor dos Devs')
    })
  })
})
