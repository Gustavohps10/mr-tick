import type { ConnectionIdentity } from '@mr-tick/domain'

export interface ConnectionAuthorizationDTO {
  readonly authorizationId: string
  readonly authorizationRole: string
  readonly authProfileId: string
  readonly identity: ConnectionIdentity
  readonly status: 'active' | 'revoked' | 'expired' | 'reauth_required'
  readonly createdAt?: string
  readonly updatedAt?: string
}

export interface WorkspaceConnectionMemberDTO {
  id: string
  name: string
  login: string
  avatarUrl?: string
}

export interface WorkspaceConnectionDTO {
  id: string
  addonId: string
  connectionProfileId: string
  cardinality: 'single' | 'multi'
  status: 'connected' | 'disabled' | 'disconnected' | 'archived'
  authorizations: readonly ConnectionAuthorizationDTO[]
  identity?: ConnectionIdentity
  member?: WorkspaceConnectionMemberDTO
  config?: Record<string, string | number | boolean>
  lastAuthenticatedAt?: string
}

function resolveMemberFromIdentity(
  identity?: ConnectionIdentity,
): WorkspaceConnectionMemberDTO | undefined {
  if (identity === undefined) return undefined
  let displayName = identity.providerSubjectId
  if (identity.displayName !== undefined && identity.displayName.length > 0) {
    displayName = identity.displayName
  }
  return {
    id: identity.providerSubjectId,
    name: displayName,
    login: displayName,
  }
}

export function toWorkspaceConnectionDTO(c: {
  id: string
  addonId: string
  connectionProfileId: string
  cardinality: 'single' | 'multi'
  status: 'connected' | 'disabled' | 'disconnected' | 'archived'
  authorizations?: readonly ConnectionAuthorizationDTO[]
  identity?: ConnectionIdentity
  config?: Record<string, string | number | boolean>
}): WorkspaceConnectionDTO {
  const authorizations = c.authorizations !== undefined ? c.authorizations : []
  let resolvedIdentity = c.identity
  if (resolvedIdentity === undefined) {
    const activeAuth = authorizations.find((a) => a.status === 'active')
    if (activeAuth !== undefined) {
      resolvedIdentity = activeAuth.identity
    }
    if (resolvedIdentity === undefined && authorizations.length > 0) {
      const primaryAuth = authorizations.find(
        (a) => a.authorizationRole === 'primary',
      )
      if (primaryAuth !== undefined) {
        resolvedIdentity = primaryAuth.identity
      }
      if (resolvedIdentity === undefined) {
        const lastAuth = authorizations[authorizations.length - 1]
        if (lastAuth !== undefined) {
          resolvedIdentity = lastAuth.identity
        }
      }
    }
  }

  const member = resolveMemberFromIdentity(resolvedIdentity)

  let authRecord = authorizations.find((a) => a.status === 'active')
  if (authRecord === undefined && authorizations.length > 0) {
    authRecord = authorizations.find((a) => a.authorizationRole === 'primary')
    if (authRecord === undefined) {
      authRecord = authorizations[authorizations.length - 1]
    }
  }

  let lastAuthenticatedAt: string | undefined
  if (authRecord !== undefined) {
    if (authRecord.updatedAt !== undefined) {
      lastAuthenticatedAt = authRecord.updatedAt
    }
    if (
      lastAuthenticatedAt === undefined &&
      authRecord.createdAt !== undefined
    ) {
      lastAuthenticatedAt = authRecord.createdAt
    }
  }

  return {
    id: c.id,
    addonId: c.addonId,
    connectionProfileId: c.connectionProfileId,
    cardinality: c.cardinality,
    status: c.status,
    authorizations,
    ...(resolvedIdentity !== undefined && {
      identity: resolvedIdentity,
    }),
    ...(member !== undefined && {
      member,
    }),
    ...(c.config !== undefined && {
      config: c.config,
    }),
    ...(lastAuthenticatedAt !== undefined && {
      lastAuthenticatedAt,
    }),
  }
}

export type WorkspaceStatus = 'draft' | 'configured'

export interface WorkspaceFilterDTO {
  readonly status?: WorkspaceStatus
  readonly name?: string
}

export interface WorkspaceDTO {
  id: string
  name: string
  status: WorkspaceStatus
  description?: string
  avatarUrl?: string
  connections: WorkspaceConnectionDTO[]
  createdAt: Date
  updatedAt: Date
}
