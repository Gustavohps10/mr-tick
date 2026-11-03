import { describe, expect, it } from 'vitest'

import { resolveTrailStatus } from './resolve-trail-status'

describe('resolveTrailStatus', () => {
  it('follows strict precedence: load_failure wins over everything', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: true,
        hasAuthError: true,
        hasSyncError: true,
        isSyncing: true,
        hasActiveConnections: true,
      }),
    ).toBe('load_failure')
  })

  it('auth_error wins over sync_error and below', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: false,
        hasAuthError: true,
        hasSyncError: true,
        isSyncing: true,
      }),
    ).toBe('auth_error')
  })

  it('disabled wins over sync_error and below', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: false,
        hasAuthError: false,
        isDisabled: true,
        hasSyncError: true,
        hasActiveConnections: true,
      }),
    ).toBe('disabled')
  })

  it('sync_error wins over syncing and connected', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: false,
        hasSyncError: true,
        isSyncing: true,
        hasActiveConnections: true,
      }),
    ).toBe('sync_error')
  })

  it('syncing wins over connected', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: false,
        isSyncing: true,
        hasActiveConnections: true,
      }),
    ).toBe('syncing')
  })

  it('connected returns when active connections exist and healthy', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: false,
        hasActiveConnections: true,
      }),
    ).toBe('connected')
  })

  it('no_connection returns when no active connections', () => {
    expect(
      resolveTrailStatus({
        hasLoadFailure: false,
        hasActiveConnections: false,
      }),
    ).toBe('no_connection')
  })
})
