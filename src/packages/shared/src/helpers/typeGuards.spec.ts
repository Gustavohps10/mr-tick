import { describe, expect, it } from 'vitest'

import {
  hasProperty,
  isFunction,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
  isWorkspaceScoped,
} from './typeGuards'

describe('Canonical type guards', () => {
  describe('isRecord', () => {
    it('accepts plain objects', () => {
      expect(isRecord({})).toBe(true)
      expect(isRecord({ foo: 'bar' })).toBe(true)
    })

    it('rejects null, arrays and primitives', () => {
      expect(isRecord(null)).toBe(false)
      expect(isRecord(undefined)).toBe(false)
      expect(isRecord([])).toBe(false)
      expect(isRecord([1, 2])).toBe(false)
      expect(isRecord('string')).toBe(false)
      expect(isRecord(123)).toBe(false)
      expect(isRecord(true)).toBe(false)
    })
  })

  describe('isString', () => {
    it('accepts strings including empty', () => {
      expect(isString('')).toBe(true)
      expect(isString('hello')).toBe(true)
    })

    it('rejects non-strings', () => {
      expect(isString(null)).toBe(false)
      expect(isString(undefined)).toBe(false)
      expect(isString(123)).toBe(false)
    })
  })

  describe('isNumber', () => {
    it('accepts valid numbers', () => {
      expect(isNumber(0)).toBe(true)
      expect(isNumber(42)).toBe(true)
      expect(isNumber(-10.5)).toBe(true)
    })

    it('rejects NaN and non-numbers', () => {
      expect(isNumber(Number.NaN)).toBe(false)
      expect(isNumber('42')).toBe(false)
      expect(isNumber(null)).toBe(false)
    })
  })

  describe('isNonEmptyString', () => {
    it('accepts non-empty strings', () => {
      expect(isNonEmptyString('a')).toBe(true)
      expect(isNonEmptyString('workspace-123')).toBe(true)
    })

    it('rejects empty or whitespace-only strings and non-strings', () => {
      expect(isNonEmptyString('')).toBe(false)
      expect(isNonEmptyString('   ')).toBe(false)
      expect(isNonEmptyString(null)).toBe(false)
      expect(isNonEmptyString(undefined)).toBe(false)
      expect(isNonEmptyString(42)).toBe(false)
    })
  })

  describe('isFunction', () => {
    it('accepts functions', () => {
      expect(isFunction(() => {})).toBe(true)
      expect(isFunction(function test() {})).toBe(true)
    })

    it('rejects non-functions', () => {
      expect(isFunction({})).toBe(false)
      expect(isFunction(null)).toBe(false)
      expect(isFunction('fn')).toBe(false)
    })
  })

  describe('hasProperty', () => {
    it('checks property existence safely', () => {
      expect(hasProperty({ a: 1 }, 'a')).toBe(true)
      expect(hasProperty({ a: 1 }, 'b')).toBe(false)
      expect(hasProperty(null, 'a')).toBe(false)
      expect(hasProperty([], 'length')).toBe(false)
    })
  })

  describe('isWorkspaceScoped', () => {
    it('validates workspace scoped records', () => {
      expect(isWorkspaceScoped({ workspaceId: 'ws-1' })).toBe(true)
      expect(isWorkspaceScoped({ workspaceId: 'ws-1', data: 123 })).toBe(true)
      expect(isWorkspaceScoped({ workspaceId: '' })).toBe(false)
      expect(isWorkspaceScoped({ workspaceId: '   ' })).toBe(false)
      expect(isWorkspaceScoped({})).toBe(false)
      expect(isWorkspaceScoped(null)).toBe(false)
      expect(isWorkspaceScoped('ws-1')).toBe(false)
    })
  })
})
