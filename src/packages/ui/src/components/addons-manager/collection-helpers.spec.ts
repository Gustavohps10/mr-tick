import type { AddonSettingsValues } from '@mr-tick/application'
import type { AddonSettingsField } from '@mr-tick/sdk'
import { describe, expect, it } from 'vitest'

import {
  createCollectionItemEnvelope,
  createRequestTracker,
  duplicateCollectionItemEnvelope,
  findDependentFieldIds,
  isFieldValueEqual,
  removeCollectionItemEnvelope,
  reorderCollectionItemEnvelope,
  updateCollectionItemEnvelope,
  updateCollectionItemFieldValue,
} from './collection-helpers'

describe('collection-helpers (envelope { itemId, values } e rastreamento de requisicoes)', () => {
  it('cria envelope de item com novo itemId estavel e valores fornecidos', () => {
    const initial: AddonSettingsValues = {
      name: 'Regra de Daily',
      enabled: true,
      targetTaskId: 'task-123',
    }

    const created = createCollectionItemEnvelope(initial, 'uuid-1')

    expect(created.itemId).toBe('uuid-1')
    expect(created.values.name).toBe('Regra de Daily')
    expect(created.values.enabled).toBe(true)
    expect(created.values.targetTaskId).toBe('task-123')
  })

  it('duplica item com novo itemId mantendo os valores originais intactos', () => {
    const original = createCollectionItemEnvelope(
      {
        name: 'Regra Base',
        enabled: false,
        targetTaskId: 'task-999',
      },
      'uuid-original',
    )

    const duplicated = duplicateCollectionItemEnvelope(
      original,
      'uuid-duplicado',
    )

    expect(duplicated.itemId).toBe('uuid-duplicado')
    expect(duplicated.values.name).toBe('Regra Base')
    expect(duplicated.values.enabled).toBe(false)
    expect(duplicated.values.targetTaskId).toBe('task-999')
    expect(original.itemId).toBe('uuid-original')
  })

  it('remove item da colecao preservando os demais itens', () => {
    const item1 = createCollectionItemEnvelope({ name: 'A' }, '1')
    const item2 = createCollectionItemEnvelope({ name: 'B' }, '2')
    const item3 = createCollectionItemEnvelope({ name: 'C' }, '3')

    const items = [item1, item2, item3]
    const updated = removeCollectionItemEnvelope(items, '2')

    expect(updated).toHaveLength(2)
    expect(updated.map((item) => item.itemId)).toEqual(['1', '3'])
  })

  it('reordena itens explicitamente mantendo os itemIds e a estrutura', () => {
    const item1 = createCollectionItemEnvelope({ name: 'A' }, 'id-a')
    const item2 = createCollectionItemEnvelope({ name: 'B' }, 'id-b')
    const item3 = createCollectionItemEnvelope({ name: 'C' }, 'id-c')

    const items = [item1, item2, item3]

    // Move 'id-c' (indice 2) para o topo (indice 0)
    const reorderedTop = reorderCollectionItemEnvelope(items, 2, 0)
    expect(reorderedTop.map((item) => item.itemId)).toEqual([
      'id-c',
      'id-a',
      'id-b',
    ])

    // Move 'id-a' (indice 0) para o fim (indice 2)
    const reorderedBottom = reorderCollectionItemEnvelope(items, 0, 2)
    expect(reorderedBottom.map((item) => item.itemId)).toEqual([
      'id-b',
      'id-c',
      'id-a',
    ])

    // Retorna inalterado se os índices forem iguais ou inválidos
    expect(reorderCollectionItemEnvelope(items, 1, 1)).toBe(items)
    expect(reorderCollectionItemEnvelope(items, -1, 2)).toBe(items)
    expect(reorderCollectionItemEnvelope(items, 0, 10)).toBe(items)
  })

  it('atualiza item e forca preservacao do itemId mesmo se o updater tentar adulterar', () => {
    const item1 = createCollectionItemEnvelope(
      { name: 'Original', enabled: true },
      'fix-id',
    )

    const items = [item1]
    const updated = updateCollectionItemEnvelope(
      items,
      'fix-id',
      (current) => ({
        ...current,
        values: { ...current.values, name: 'Modificado' },
        itemId: 'tentativa-de-mudar-id',
      }),
    )

    expect(updated[0]?.itemId).toBe('fix-id')
    expect(updated[0]?.values.name).toBe('Modificado')
  })

  it('atualiza campo declarado genericamente sem presumir propriedade fixa', () => {
    const item = createCollectionItemEnvelope(
      {
        name: 'Regra Customizada',
        activeToggle: false,
      },
      'id-10',
    )

    const updated = updateCollectionItemFieldValue(item, 'activeToggle', true)
    expect(updated.itemId).toBe('id-10')
    expect(updated.values.activeToggle).toBe(true)

    const updatedName = updateCollectionItemFieldValue(
      item,
      'name',
      'Novo Nome',
    )
    expect(updatedName.itemId).toBe('id-10')
    expect(updatedName.values.name).toBe('Novo Nome')
  })

  it('rastreador de requisicoes identifica resposta atual e descarta chamadas obsoletas', () => {
    const tracker = createRequestTracker()

    const req1 = tracker.nextId()
    expect(tracker.isCurrent(req1)).toBe(true)

    const req2 = tracker.nextId()
    expect(tracker.isCurrent(req1)).toBe(false)
    expect(tracker.isCurrent(req2)).toBe(true)

    tracker.reset()
    expect(tracker.isCurrent(req2)).toBe(false)
  })

  it('identifica campos dependentes diretos e em cadeia', () => {
    const fields: readonly AddonSettingsField[] = [
      {
        id: 'guild',
        type: 'select',
        label: 'Servidor',
        source: { kind: 'dynamic', providerId: 'discord.guilds' },
      },
      {
        id: 'channel',
        type: 'select',
        label: 'Canal de voz',
        source: {
          kind: 'dynamic',
          providerId: 'discord.channels',
          dependsOn: [
            {
              base: 'parent',
              address: { path: [{ kind: 'field', fieldId: 'guild' }] },
            },
          ],
        },
      },
      {
        id: 'subChannelDetail',
        type: 'select',
        label: 'Detalhe do Canal',
        source: {
          kind: 'dynamic',
          providerId: 'discord.subchannels',
          dependsOn: [
            {
              base: 'parent',
              address: { path: [{ kind: 'field', fieldId: 'channel' }] },
            },
          ],
        },
      },
      {
        id: 'otherField',
        type: 'text',
        label: 'Outro',
      },
    ]

    const guildDependents = findDependentFieldIds(fields, 'guild')
    expect(guildDependents).toEqual(['channel', 'subChannelDetail'])

    const channelDependents = findDependentFieldIds(fields, 'channel')
    expect(channelDependents).toEqual(['subChannelDetail'])

    const otherDependents = findDependentFieldIds(fields, 'otherField')
    expect(otherDependents).toEqual([])
  })

  it('compara valores de campos semântica e deterministicamente (Snowflakes string e number)', () => {
    expect(isFieldValueEqual('100', 100)).toBe(true)
    expect(
      isFieldValueEqual('1294040636718317618', '1294040636718317618'),
    ).toBe(true)
    expect(isFieldValueEqual('server-a', 'server-a')).toBe(true)
    expect(isFieldValueEqual('server-a', 'server-b')).toBe(false)
    expect(isFieldValueEqual(undefined, null)).toBe(true)
    expect(isFieldValueEqual(null, undefined)).toBe(true)
  })

  it('limpa campo canal ao trocar servidor na colecao evitando estado sujo', () => {
    const fields: readonly AddonSettingsField[] = [
      {
        id: 'guild',
        type: 'select',
        label: 'Servidor',
        source: { kind: 'dynamic', providerId: 'discord.guilds' },
      },
      {
        id: 'channel',
        type: 'select',
        label: 'Canal de voz',
        source: {
          kind: 'dynamic',
          providerId: 'discord.channels',
          dependsOn: [
            {
              base: 'parent',
              address: { path: [{ kind: 'field', fieldId: 'guild' }] },
            },
          ],
        },
      },
    ]

    const item = createCollectionItemEnvelope(
      {
        guild: '1294040636718317618',
        channel: '1294040636718317622',
      },
      'rule-1',
    )

    // Troca para um servidor diferente -> limpa canal
    const updatedDifferentGuild = updateCollectionItemFieldValue(
      item,
      'guild',
      '9999999999999999999',
      fields,
    )
    expect(updatedDifferentGuild.values.guild).toBe('9999999999999999999')
    expect(updatedDifferentGuild.values.channel).toBeUndefined()

    // Mantém o mesmo servidor (mesmo Snowflake em número) -> preserva canal
    const sameGuild = updateCollectionItemFieldValue(
      item,
      'guild',
      '1294040636718317618',
      fields,
    )
    expect(sameGuild.values.guild).toBe('1294040636718317618')
    expect(sameGuild.values.channel).toBe('1294040636718317622')
  })

  it('processa campos select sem propriedade source sem estourar excecao', () => {
    const fieldsWithMissingSource: readonly AddonSettingsField[] = [
      {
        id: 'redmineVersion',
        type: 'select',
        label: 'Versão do Redmine',
        options: [
          { label: 'Redmine 5.x', value: '5' },
          { label: 'Redmine 6.x', value: '6' },
        ],
      },
    ]

    const dependentIds = findDependentFieldIds(
      fieldsWithMissingSource,
      'someOtherField',
    )

    expect(dependentIds).toEqual([])
  })
})
