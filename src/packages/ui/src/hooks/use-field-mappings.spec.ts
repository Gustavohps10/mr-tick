import type { ConfiguredFieldMapping } from '@mr-tick/sdk'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  getAllStoredFieldMappings,
  getStoredFieldMappings,
  resolveEntityMapping,
  saveStoredFieldMappings,
} from './use-field-mappings'

describe('use-field-mappings utils', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('resolveEntityMapping', () => {
    it('deve retornar neutro sem ícone e sem cor quando a entidade não estiver mapeada', () => {
      const result = resolveEntityMapping(
        { id: 'unmapped', name: 'Qualquer' },
        'activity',
      )
      expect(result.icon).toBeUndefined()
      expect(result.badgeColor).toBeUndefined()
      expect(result.backgroundColor).toBeUndefined()
      expect(result.textColor).toBeUndefined()
    })

    it('deve retornar neutro quando a entidade for nula ou indefinida', () => {
      const result = resolveEntityMapping(undefined, 'tracker')
      expect(result.icon).toBeUndefined()
      expect(result.badgeColor).toBeUndefined()
    })

    it('deve resolver mapeamento correspondente pelo ID exato', () => {
      const mappings: Record<string, ConfiguredFieldMapping> = {
        dev_activity: {
          icon: 'Code',
          color: '#3b82f6',
        },
      }

      const result = resolveEntityMapping(
        { id: 'dev_activity', name: 'Desenvolvimento' },
        'activity',
        mappings,
      )
      expect(result.icon).toBe('Code')
      expect(result.badgeColor).toBe('#3b82f6')
      expect(result.backgroundColor).toBe(
        'color-mix(in srgb, #3b82f6 14%, var(--card, #ffffff))',
      )
      expect(result.textColor).toBe('#3b82f6')
    })

    it('deve resolver mapeamento pelo category_id ou prefixado pela categoria', () => {
      const mappings: Record<string, ConfiguredFieldMapping> = {
        'tracker:bug': {
          icon: 'Bug',
          color: '#ef4444',
        },
      }

      const result = resolveEntityMapping(
        { id: 'bug', name: 'Bug' },
        'tracker',
        mappings,
      )
      expect(result.icon).toBe('Bug')
      expect(result.badgeColor).toBe('#ef4444')
    })

    it('deve resolver mapeamento pelo nome da entidade (case-insensitive)', () => {
      const mappings: Record<string, ConfiguredFieldMapping> = {
        'Em Andamento': {
          icon: 'PlayCircle',
          color: '#eab308',
        },
      }

      const result = resolveEntityMapping(
        { id: 'status_2', name: 'em andamento' },
        'status',
        mappings,
      )
      expect(result.icon).toBe('PlayCircle')
      expect(result.badgeColor).toBe('#eab308')
    })

    it('deve retornar neutro quando o mapeamento possuir icon="none" ou vazio', () => {
      const mappings: Record<string, ConfiguredFieldMapping> = {
        meeting: {
          icon: 'none',
          color: '',
        },
      }

      const result = resolveEntityMapping(
        { id: 'meeting', name: 'Reunião' },
        'activity',
        mappings,
      )
      expect(result.icon).toBeUndefined()
      expect(result.badgeColor).toBeUndefined()
    })
  })

  describe('localStorage persistence', () => {
    it('deve salvar e recuperar mapeamentos por targetId', () => {
      const sampleMappings: Record<string, ConfiguredFieldMapping> = {
        bug: { icon: 'Bug', color: '#ef4444' },
      }

      saveStoredFieldMappings('target-instance-1', sampleMappings)

      const retrieved = getStoredFieldMappings('target-instance-1')
      expect(retrieved.bug.icon).toBe('Bug')
      expect(retrieved.bug.color).toBe('#ef4444')
    })

    it('getAllStoredFieldMappings deve combinar múltiplos alvos salvos', () => {
      saveStoredFieldMappings('conn-a', {
        feat: { icon: 'Sparkles', color: '#22c55e' },
      })
      saveStoredFieldMappings('conn-b', {
        fix: { icon: 'Wrench', color: '#f97316' },
      })

      const all = getAllStoredFieldMappings()
      expect(all.feat.icon).toBe('Sparkles')
      expect(all.fix.icon).toBe('Wrench')
    })
  })
})
