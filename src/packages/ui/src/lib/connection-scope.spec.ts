import { describe, expect, it } from 'vitest'

import {
  connectionScopeKey,
  isNoneScope,
  parseConnectionsParam,
  resolveConnectionScope,
  serializeConnectionScope,
  serializeConnectionSelection,
} from './connection-scope'

describe('connection-scope', () => {
  describe('parseConnectionsParam', () => {
    it('returns all when null, undefined or "all"', () => {
      expect(parseConnectionsParam(null)).toEqual({ kind: 'all' })
      expect(parseConnectionsParam(undefined)).toEqual({ kind: 'all' })
      expect(parseConnectionsParam('all')).toEqual({ kind: 'all' })
      expect(parseConnectionsParam('  all  ')).toEqual({ kind: 'all' })
    })

    it('returns none when empty string or "none"', () => {
      expect(parseConnectionsParam('')).toEqual({ kind: 'none' })
      expect(parseConnectionsParam('   ')).toEqual({ kind: 'none' })
      expect(parseConnectionsParam('none')).toEqual({ kind: 'none' })
      expect(parseConnectionsParam('none,conn-a')).toEqual({ kind: 'none' })
    })

    it('parses valid ids with deduplication and sorting', () => {
      expect(parseConnectionsParam('b,a,b')).toEqual({
        kind: 'ids',
        ids: ['a', 'b'],
      })
    })

    it('treats mixture of sentinel and ids as none (closed fail)', () => {
      expect(parseConnectionsParam('none,conn-a')).toEqual({ kind: 'none' })
      expect(parseConnectionsParam('all,conn-1')).toEqual({ kind: 'none' })
    })
  })

  describe('resolveConnectionScope', () => {
    it('preserves none and all regardless of catalog', () => {
      expect(resolveConnectionScope({ kind: 'none' }, ['c1'], false)).toEqual({
        kind: 'none',
      })
      expect(resolveConnectionScope({ kind: 'all' }, ['c1'], false)).toEqual({
        kind: 'all',
      })
    })

    it('preserves raw selection ids while catalog is loading', () => {
      expect(
        resolveConnectionScope({ kind: 'ids', ids: ['c1', 'c2'] }, [], true),
      ).toEqual({
        kind: 'subset',
        ids: ['c1', 'c2'],
      })
    })

    it('intersects ids with catalog once loaded', () => {
      expect(
        resolveConnectionScope(
          { kind: 'ids', ids: ['c1', 'unknown'] },
          ['c1', 'c2'],
          false,
        ),
      ).toEqual({
        kind: 'subset',
        ids: ['c1'],
      })
    })

    it('resolves to none if no ids match loaded catalog', () => {
      expect(
        resolveConnectionScope(
          { kind: 'ids', ids: ['unknown'] },
          ['c1', 'c2'],
          false,
        ),
      ).toEqual({
        kind: 'none',
      })
    })
  })

  describe('serialization and keys', () => {
    it('serializes scopes and selections correctly', () => {
      expect(serializeConnectionScope({ kind: 'all' })).toBeNull()
      expect(serializeConnectionScope({ kind: 'none' })).toBe('none')
      expect(
        serializeConnectionScope({ kind: 'subset', ids: ['a', 'b'] }),
      ).toBe('a,b')

      expect(serializeConnectionSelection({ kind: 'all' })).toBeNull()
      expect(serializeConnectionSelection({ kind: 'none' })).toBe('none')
      expect(serializeConnectionSelection({ kind: 'ids', ids: ['x'] })).toBe(
        'x',
      )
    })

    it('generates deterministic query cache keys', () => {
      expect(connectionScopeKey({ kind: 'all' })).toBe('all')
      expect(connectionScopeKey({ kind: 'none' })).toBe('none')
      expect(connectionScopeKey({ kind: 'subset', ids: ['a', 'b'] })).toBe(
        'ids:a|b',
      )
    })

    it('correctly checks isNoneScope', () => {
      expect(isNoneScope({ kind: 'none' })).toBe(true)
      expect(isNoneScope({ kind: 'all' })).toBe(false)
      expect(isNoneScope({ kind: 'subset', ids: ['a'] })).toBe(false)
    })
  })
})
