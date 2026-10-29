import type { AddonSettingsValues } from '@mr-tick/application'
import { describe, expect, it } from 'vitest'

import {
  createCollectionItemEnvelope,
  createRequestTracker,
  duplicateCollectionItemEnvelope,
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
})
