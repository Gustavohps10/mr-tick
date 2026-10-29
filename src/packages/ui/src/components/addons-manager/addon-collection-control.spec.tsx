import type {
  AddonCollectionItemEnvelope,
  AddonSettingsCollectionField,
} from '@mr-tick/application'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AddonCollectionControl } from './addon-collection-control'

describe('AddonCollectionControl', () => {
  const collectionField: AddonSettingsCollectionField = {
    id: 'observers',
    type: 'collection',
    label: 'Observadores de Canais',
    itemLabel: 'Regra',
    enabledFieldId: 'enabled',
    allowReorder: true,
    allowDuplicate: true,
    fields: [
      {
        id: 'channelId',
        type: 'text',
        label: 'ID do Canal',
        defaultValue: 'chan-default',
      },
      {
        id: 'enabled',
        type: 'boolean',
        label: 'Ativo',
        defaultValue: true,
      },
    ],
  }

  it('renders empty notice when collection has 0 items', () => {
    render(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={[]}
        onChange={vi.fn()}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId('addon-collection-empty-observers'),
    ).toHaveTextContent('Nenhum item configurado.')
  })

  it('adds a new item with unique UUID and schema default values', () => {
    let currentItems: readonly AddonCollectionItemEnvelope[] = []
    const onChange = vi.fn((items) => {
      currentItems = items
    })

    const { rerender } = render(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={currentItems}
        onChange={onChange}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    const addBtn = screen.getByTestId('addon-collection-add-observers')
    fireEvent.click(addBtn)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(currentItems).toHaveLength(1)
    const added = currentItems[0]
    expect(added).toBeDefined()
    expect(typeof added?.itemId).toBe('string')
    expect(added?.values['channelId']).toBe('chan-default')
    expect(added?.values['enabled']).toBe(true)

    rerender(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={currentItems}
        onChange={onChange}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    expect(
      screen.getByTestId(`addon-collection-item-${added?.itemId}`),
    ).toBeInTheDocument()
  })

  it('duplicates an existing item with a new UUID and preserves values', () => {
    const existing: AddonCollectionItemEnvelope = {
      itemId: 'orig-1',
      values: {
        channelId: 'custom-channel-99',
        enabled: true,
      },
    }

    let currentItems: readonly AddonCollectionItemEnvelope[] = [existing]
    const onChange = vi.fn((items) => {
      currentItems = items
    })

    render(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={currentItems}
        onChange={onChange}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    const duplicateBtn = screen.getByTestId(
      'addon-collection-item-duplicate-orig-1',
    )
    fireEvent.click(duplicateBtn)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(currentItems).toHaveLength(2)
    const dup = currentItems[1]
    expect(dup?.itemId).not.toBe('orig-1')
    expect(dup?.values['channelId']).toBe('custom-channel-99')
    expect(dup?.values['enabled']).toBe(true)
  })

  it('removes an item by target itemId', () => {
    const item1: AddonCollectionItemEnvelope = {
      itemId: 'item-1',
      values: { channelId: 'c1' },
    }
    const item2: AddonCollectionItemEnvelope = {
      itemId: 'item-2',
      values: { channelId: 'c2' },
    }

    let currentItems: readonly AddonCollectionItemEnvelope[] = [item1, item2]
    const onChange = vi.fn((items) => {
      currentItems = items
    })

    render(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={currentItems}
        onChange={onChange}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    const removeBtn = screen.getByTestId('addon-collection-item-remove-item-1')
    fireEvent.click(removeBtn)

    expect(onChange).toHaveBeenCalledWith([item2])
  })

  it('reorders items up and down preserving IDs', () => {
    const item1: AddonCollectionItemEnvelope = {
      itemId: 'item-1',
      values: { channelId: 'c1' },
    }
    const item2: AddonCollectionItemEnvelope = {
      itemId: 'item-2',
      values: { channelId: 'c2' },
    }

    let currentItems: readonly AddonCollectionItemEnvelope[] = [item1, item2]
    const onChange = vi.fn((items) => {
      currentItems = items
    })

    render(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={currentItems}
        onChange={onChange}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    const downBtn = screen.getByTestId('addon-collection-item-down-item-1')
    fireEvent.click(downBtn)

    expect(onChange).toHaveBeenCalledWith([item2, item1])
  })

  it('toggles item enable via declared enabledFieldId', () => {
    const item: AddonCollectionItemEnvelope = {
      itemId: 'item-1',
      values: { channelId: 'c1', enabled: true },
    }

    let currentItems: readonly AddonCollectionItemEnvelope[] = [item]
    const onChange = vi.fn((items) => {
      currentItems = items
    })

    render(
      <AddonCollectionControl
        field={collectionField}
        addonId="discord-addon"
        scope={{ kind: 'addon' }}
        parentAddress={{ path: [] }}
        value={currentItems}
        onChange={onChange}
        draftValues={{}}
        renderField={vi.fn()}
      />,
    )

    const toggleSwitch = screen.getByTestId(
      'addon-collection-item-toggle-enable-item-1',
    )
    fireEvent.click(toggleSwitch)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(currentItems[0]?.values['enabled']).toBe(false)
  })
})
