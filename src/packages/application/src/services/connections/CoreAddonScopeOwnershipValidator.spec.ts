import { AppError, Either } from '@mr-tick/shared/helpers'
import { describe, expect, it } from 'vitest'

import type {
  CoreConnection,
  CoreConnectionScope,
  IAddonCapabilityOwnershipValidator,
  ICoreConnectionsReadAPI,
} from '@/contracts'

import { CoreAddonScopeOwnershipValidator } from './CoreAddonScopeOwnershipValidator'

class MockConnectionsReader implements ICoreConnectionsReadAPI {
  constructor(private readonly connections: CoreConnection[]) {}

  public async list(): Promise<Either<AppError, CoreConnection[]>> {
    return Either.success(this.connections)
  }

  public async get(
    scope: CoreConnectionScope,
  ): Promise<Either<AppError, CoreConnection>> {
    const found = this.connections.find(
      (c) =>
        c.workspaceId === scope.workspaceId &&
        c.connectionInstanceId === scope.connectionInstanceId,
    )
    if (found === undefined) {
      return Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND'))
    }
    return Either.success(found)
  }
}

class MockCapabilityValidator implements IAddonCapabilityOwnershipValidator {
  constructor(private readonly validCapabilities: string[]) {}

  public async validateCapability(
    _addonId: string,
    capabilityId: string,
    _connectionProfileId?: string,
  ): Promise<Either<AppError, void>> {
    if (!this.validCapabilities.includes(capabilityId)) {
      return Either.failure(AppError.NotFound('CAPABILITY_NOT_FOUND'))
    }
    return Either.success()
  }
}

describe('CoreAddonScopeOwnershipValidator', () => {
  const existingConnection: CoreConnection = {
    workspaceId: 'ws-1',
    connectionInstanceId: 'conn-1',
    addonId: 'my-addon',
    connectionProfileId: 'profile-a',
    cardinality: 'single',
    status: 'connected',
    identity: null,
  }

  const otherAddonConnection: CoreConnection = {
    workspaceId: 'ws-1',
    connectionInstanceId: 'conn-2',
    addonId: 'other-addon',
    connectionProfileId: 'profile-b',
    cardinality: 'single',
    status: 'connected',
    identity: null,
  }

  const reader = new MockConnectionsReader([
    existingConnection,
    otherAddonConnection,
  ])
  const capValidator = new MockCapabilityValidator(['watcher', 'calendar'])

  const validator = new CoreAddonScopeOwnershipValidator(
    () => reader,
    capValidator,
  )

  it('validates addon and workspace scopes', async () => {
    const addonResult = await validator.validateScope('my-addon', {
      kind: 'addon',
    })
    expect(addonResult.isSuccess()).toBe(true)

    const wsResult = await validator.validateScope('my-addon', {
      kind: 'workspace',
      workspaceId: 'ws-1',
    })
    expect(wsResult.isSuccess()).toBe(true)
  })

  it('fails if workspaceId, connectionInstanceId or capabilityId is empty', async () => {
    const emptyWs = await validator.validateScope('my-addon', {
      kind: 'workspace',
      workspaceId: '',
    })
    expect(emptyWs.isFailure()).toBe(true)
    if (emptyWs.isSuccess()) return
    expect(emptyWs.failure.messageKey).toBe('WORKSPACE_ID_REQUIRED')

    const emptyConn = await validator.validateScope('my-addon', {
      kind: 'connection',
      workspaceId: 'ws-1',
      connectionInstanceId: '',
    })
    expect(emptyConn.isFailure()).toBe(true)
    if (emptyConn.isSuccess()) return
    expect(emptyConn.failure.messageKey).toBe('CONNECTION_INSTANCE_ID_REQUIRED')

    const emptyCap = await validator.validateScope('my-addon', {
      kind: 'capability',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      capabilityId: '',
    })
    expect(emptyCap.isFailure()).toBe(true)
    if (emptyCap.isSuccess()) return
    expect(emptyCap.failure.messageKey).toBe('CAPABILITY_ID_REQUIRED')
  })

  it('validates connection belongs to the given addon and workspace', async () => {
    const validConn = await validator.validateScope('my-addon', {
      kind: 'connection',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
    })
    expect(validConn.isSuccess()).toBe(true)

    const foreignConn = await validator.validateScope('my-addon', {
      kind: 'connection',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-2',
    })
    expect(foreignConn.isFailure()).toBe(true)
    if (foreignConn.isSuccess()) return
    expect(foreignConn.failure.statusCode).toBe(401)
    expect(foreignConn.failure.messageKey).toBe('ADDON_SCOPE_OWNERSHIP_INVALID')

    const notFoundConn = await validator.validateScope('my-addon', {
      kind: 'connection',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-unknown',
    })
    expect(notFoundConn.isFailure()).toBe(true)
    if (notFoundConn.isSuccess()) return
    expect(notFoundConn.failure.statusCode).toBe(401)
    expect(notFoundConn.failure.messageKey).toBe(
      'ADDON_SCOPE_OWNERSHIP_INVALID',
    )
  })

  it('validates capability belongs to the addon when using capability scope', async () => {
    const validCap = await validator.validateScope('my-addon', {
      kind: 'capability',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      capabilityId: 'watcher',
    })
    expect(validCap.isSuccess()).toBe(true)

    const invalidCap = await validator.validateScope('my-addon', {
      kind: 'capability',
      workspaceId: 'ws-1',
      connectionInstanceId: 'conn-1',
      capabilityId: 'unknown-cap',
    })
    expect(invalidCap.isFailure()).toBe(true)
    if (invalidCap.isSuccess()) return
    expect(invalidCap.failure.messageKey).toBe('CAPABILITY_NOT_FOUND')
  })
})
