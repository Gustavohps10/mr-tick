import { describe, expect, it } from 'vitest'

import {
  areFieldAddressesEqual,
  clearValueAtAddress,
  extractResolvedDependencies,
  resolveDependencyAddress,
  resolveValueAtAddress,
  serializeFieldAddress,
} from './address-helpers'

describe('address-helpers', () => {
  it('serializes field addresses without colliding on opaque IDs with slashes, dots, and colons', () => {
    expect(serializeFieldAddress({ path: [] })).toBe('')

    const addrA = {
      path: [
        { kind: 'field' as const, fieldId: 'discord.guild/primary:main' },
        { kind: 'item' as const, itemId: 'item/1:2.3' },
      ],
    }
    const addrB = {
      path: [
        { kind: 'field' as const, fieldId: 'discord' },
        { kind: 'field' as const, fieldId: 'guild/primary:main' },
        { kind: 'item' as const, itemId: 'item/1:2.3' },
      ],
    }

    const serializedA = serializeFieldAddress(addrA)
    const serializedB = serializeFieldAddress(addrB)

    expect(serializedA).not.toBe(serializedB)
    expect(serializedA).toBe(
      JSON.stringify([
        { kind: 'field', fieldId: 'discord.guild/primary:main' },
        { kind: 'item', itemId: 'item/1:2.3' },
      ]),
    )
  })

  it('compares addresses equality strictly', () => {
    const addr1 = { path: [{ kind: 'field' as const, fieldId: 'a.b/c' }] }
    const addr2 = { path: [{ kind: 'field' as const, fieldId: 'a.b/c' }] }
    const addr3 = { path: [{ kind: 'field' as const, fieldId: 'b' }] }
    const addr4 = {
      path: [
        { kind: 'field' as const, fieldId: 'a.b/c' },
        { kind: 'item' as const, itemId: '1' },
      ],
    }

    expect(areFieldAddressesEqual(addr1, addr2)).toBe(true)
    expect(areFieldAddressesEqual(addr1, addr3)).toBe(false)
    expect(areFieldAddressesEqual(addr1, addr4)).toBe(false)
  })

  it('resolves value at address for simple fields with opaque IDs', () => {
    const values = {
      'guild.primary/v1': 'guild-123',
      count: 42,
    }

    expect(
      resolveValueAtAddress(values, {
        path: [{ kind: 'field', fieldId: 'guild.primary/v1' }],
      }),
    ).toBe('guild-123')
    expect(
      resolveValueAtAddress(values, {
        path: [{ kind: 'field', fieldId: 'count' }],
      }),
    ).toBe(42)
    expect(
      resolveValueAtAddress(values, {
        path: [{ kind: 'field', fieldId: 'missing' }],
      }),
    ).toBeUndefined()
  })

  it('resolves value at address inside collection item envelopes', () => {
    const values = {
      'custom/observers': [
        {
          itemId: 'obs:1/special',
          values: {
            'channel.id': 'chan-abc',
            enabled: true,
          },
        },
      ],
    }

    expect(
      resolveValueAtAddress(values, {
        path: [
          { kind: 'field', fieldId: 'custom/observers' },
          { kind: 'item', itemId: 'obs:1/special' },
          { kind: 'field', fieldId: 'channel.id' },
        ],
      }),
    ).toBe('chan-abc')

    expect(
      resolveValueAtAddress(values, {
        path: [
          { kind: 'field', fieldId: 'custom/observers' },
          { kind: 'item', itemId: 'obs-2' },
          { kind: 'field', fieldId: 'channel.id' },
        ],
      }),
    ).toBeUndefined()
  })

  it('resolves dependency address for root and parent bases with complex path IDs', () => {
    const currentAddress = {
      path: [
        { kind: 'field' as const, fieldId: 'observers/list' },
        { kind: 'item' as const, itemId: 'obs:1' },
        { kind: 'field' as const, fieldId: 'channel.id' },
      ],
    }

    const rootDep = {
      base: 'root' as const,
      address: {
        path: [{ kind: 'field' as const, fieldId: 'guild.id' }],
      },
    }

    const resolvedRoot = resolveDependencyAddress(currentAddress, rootDep)
    expect(resolvedRoot.path).toEqual([{ kind: 'field', fieldId: 'guild.id' }])

    const parentDep = {
      base: 'parent' as const,
      address: {
        path: [{ kind: 'field' as const, fieldId: 'peer.type' }],
      },
    }

    const resolvedParent = resolveDependencyAddress(currentAddress, parentDep)
    expect(resolvedParent.path).toEqual([
      { kind: 'field', fieldId: 'observers/list' },
      { kind: 'item', itemId: 'obs:1' },
      { kind: 'field', fieldId: 'peer.type' },
    ])
  })

  it('extracts resolved dependencies as AddonResolvedDependencyEntry array', () => {
    const draftValues = {
      'guild.id': 'guild-42',
      observers: [
        {
          itemId: 'obs-1',
          values: {
            channelType: 'text',
          },
        },
      ],
    }

    const currentAddress = {
      path: [
        { kind: 'field' as const, fieldId: 'observers' },
        { kind: 'item' as const, itemId: 'obs-1' },
        { kind: 'field' as const, fieldId: 'channelId' },
      ],
    }

    const dependencies = [
      {
        base: 'root' as const,
        address: { path: [{ kind: 'field' as const, fieldId: 'guild.id' }] },
      },
      {
        base: 'parent' as const,
        address: {
          path: [{ kind: 'field' as const, fieldId: 'channelType' }],
        },
      },
    ]

    const entries = extractResolvedDependencies(
      draftValues,
      currentAddress,
      dependencies,
    )

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      address: { path: [{ kind: 'field', fieldId: 'guild.id' }] },
      value: 'guild-42',
    })
    expect(entries[1]).toEqual({
      address: {
        path: [
          { kind: 'field', fieldId: 'observers' },
          { kind: 'item', itemId: 'obs-1' },
          { kind: 'field', fieldId: 'channelType' },
        ],
      },
      value: 'text',
    })
  })

  it('clears value at address for root, group, and nested collection item paths', () => {
    const initial = {
      rootField: 'valueA',
      keepField: 123,
      groupField: {
        sub1: 'val1',
        sub2: 'val2',
      },
      watchers: [
        {
          itemId: 'item-1',
          values: {
            channelId: 'chan-1',
            autoAssign: true,
          },
        },
        {
          itemId: 'item-2',
          values: {
            channelId: 'chan-2',
            autoAssign: false,
          },
        },
      ],
    }

    // 1. Clear root field
    const clearedRoot = clearValueAtAddress(initial, {
      path: [{ kind: 'field', fieldId: 'rootField' }],
    })
    expect(clearedRoot['rootField']).toBeUndefined()
    expect(clearedRoot['keepField']).toBe(123)

    // 2. Clear group subfield
    const clearedGroupSub = clearValueAtAddress(initial, {
      path: [
        { kind: 'field', fieldId: 'groupField' },
        { kind: 'field', fieldId: 'sub1' },
      ],
    })
    const groupVal = clearedGroupSub['groupField'] as Record<string, unknown>
    expect(groupVal['sub1']).toBeUndefined()
    expect(groupVal['sub2']).toBe('val2')

    // 3. Clear nested collection item field
    const clearedCollectionField = clearValueAtAddress(initial, {
      path: [
        { kind: 'field', fieldId: 'watchers' },
        { kind: 'item', itemId: 'item-1' },
        { kind: 'field', fieldId: 'channelId' },
      ],
    })
    const watchersList = clearedCollectionField['watchers'] as Array<{
      itemId: string
      values: Record<string, unknown>
    }>
    expect(watchersList[0]?.values['channelId']).toBeUndefined()
    expect(watchersList[0]?.values['autoAssign']).toBe(true)
    expect(watchersList[1]?.values['channelId']).toBe('chan-2')
  })
})
