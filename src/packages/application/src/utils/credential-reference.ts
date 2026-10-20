import type { AddonVaultScope } from '../contracts/addons/vault/IAddonVaultAPI'

export type CredentialReferenceInput = {
  ownerId: string
  workspaceId: string
  connectionId: string
  authorizationId: string
}

export type CredentialReference = {
  service: string
  account: string
  id: string
}

export class CredentialReferenceFactory {
  public static create(input: CredentialReferenceInput): CredentialReference {
    const parts = [
      input.ownerId,
      input.workspaceId,
      input.connectionId,
      input.authorizationId,
    ]
    const encoded = parts.map((part) => `${part.length}:${part}`).join('')
    return CredentialReferenceFactory.createNamed(
      'mr-tick',
      `credential-v1:${encoded}`,
    )
  }

  public static parseConnectionReference(
    reference: CredentialReference,
  ): CredentialReferenceInput | undefined {
    if (!reference.account.startsWith('credential-v1:')) return undefined
    const parts = decodeParts(
      reference.account.slice('credential-v1:'.length),
      4,
    )
    if (parts === undefined) return undefined
    return {
      ownerId: parts[0],
      workspaceId: parts[1],
      connectionId: parts[2],
      authorizationId: parts[3],
    }
  }

  public static createConnectionCandidate(input: {
    ownerId: string
    workspaceId: string
    connectionId: string
    authorizationId: string
    operationId: string
  }): CredentialReference {
    const parts = [
      input.ownerId,
      input.workspaceId,
      input.connectionId,
      input.authorizationId,
      input.operationId,
    ]
    const encoded = parts.map((part) => `${part.length}:${part}`).join('')
    return CredentialReferenceFactory.createNamed(
      'mr-tick',
      `credential_candidate-v1:${encoded}`,
    )
  }

  public static createAddonWorkspace(
    addonId: string,
    workspaceId: string,
  ): CredentialReference {
    return CredentialReferenceFactory.createNamed(
      addonId,
      `ws_${workspaceId}_config`,
    )
  }

  public static createAddonWorkspaceCandidate(
    addonId: string,
    workspaceId: string,
    operationId: string,
  ): CredentialReference {
    const parts = [workspaceId, operationId]
    const encoded = parts.map((part) => `${part.length}:${part}`).join('')
    return CredentialReferenceFactory.createNamed(
      addonId,
      `ws_candidate_v1:${encoded}`,
    )
  }

  public static createAddonSecret(
    addonId: string,
    scope: AddonVaultScope,
    fieldId: string,
  ): CredentialReference {
    if (scope.kind === 'addon') {
      return CredentialReferenceFactory.createNamed(
        addonId,
        `addon_secret_v1:${encodeParts([fieldId])}`,
      )
    }
    if (scope.kind === 'workspace') {
      return CredentialReferenceFactory.createNamed(
        addonId,
        `ws_secret_v1:${encodeParts([scope.workspaceId, fieldId])}`,
      )
    }
    if (scope.kind === 'connection') {
      return CredentialReferenceFactory.createNamed(
        addonId,
        `conn_secret_v1:${encodeParts([
          scope.workspaceId,
          scope.connectionInstanceId,
          fieldId,
        ])}`,
      )
    }
    return CredentialReferenceFactory.createNamed(
      addonId,
      `cap_secret_v1:${encodeParts([
        scope.workspaceId,
        scope.connectionInstanceId,
        scope.capabilityId,
        fieldId,
      ])}`,
    )
  }

  public static createAddonSecretCandidate(
    addonId: string,
    scope: AddonVaultScope,
    fieldId: string,
    operationId: string,
  ): CredentialReference {
    if (scope.kind === 'addon') {
      return CredentialReferenceFactory.createNamed(
        addonId,
        `addon_secret_candidate_v1:${encodeParts([fieldId, operationId])}`,
      )
    }
    if (scope.kind === 'workspace') {
      return CredentialReferenceFactory.createNamed(
        addonId,
        `ws_secret_candidate_v1:${encodeParts([
          scope.workspaceId,
          fieldId,
          operationId,
        ])}`,
      )
    }
    if (scope.kind === 'connection') {
      return CredentialReferenceFactory.createNamed(
        addonId,
        `conn_secret_candidate_v1:${encodeParts([
          scope.workspaceId,
          scope.connectionInstanceId,
          fieldId,
          operationId,
        ])}`,
      )
    }
    return CredentialReferenceFactory.createNamed(
      addonId,
      `cap_secret_candidate_v1:${encodeParts([
        scope.workspaceId,
        scope.connectionInstanceId,
        scope.capabilityId,
        fieldId,
        operationId,
      ])}`,
    )
  }

  public static isAddonWorkspaceLogicalReference(
    id: string,
    addonId: string,
    workspaceId: string,
  ): boolean {
    const reference = CredentialReferenceFactory.fromId(id)
    if (
      reference === undefined ||
      reference.id !== id ||
      reference.service !== addonId
    )
      return false
    const configuration = CredentialReferenceFactory.createAddonWorkspace(
      addonId,
      workspaceId,
    )
    if (reference.id === configuration.id) return true
    if (reference.account.startsWith('ws_secret_v1:')) {
      const parts = decodeParts(
        reference.account.slice('ws_secret_v1:'.length),
        2,
      )
      return parts !== undefined && parts[0] === workspaceId
    }
    if (reference.account.startsWith('conn_secret_v1:')) {
      const parts = decodeParts(
        reference.account.slice('conn_secret_v1:'.length),
        3,
      )
      return parts !== undefined && parts[0] === workspaceId
    }
    if (reference.account.startsWith('cap_secret_v1:')) {
      const parts = decodeParts(
        reference.account.slice('cap_secret_v1:'.length),
        4,
      )
      return parts !== undefined && parts[0] === workspaceId
    }
    return false
  }

  public static createNamed(
    service: string,
    account: string,
  ): CredentialReference {
    const id = `${service.length}:${service}${account.length}:${account}`
    return {
      service,
      account,
      id,
    }
  }

  public static fromId(id: string): CredentialReference | undefined {
    const separator = id.indexOf(':')
    if (separator < 0) return undefined
    const serviceLength = Number(id.slice(0, separator))
    if (!Number.isInteger(serviceLength) || serviceLength < 0) return undefined
    const serviceStart = separator + 1
    const service = id.slice(serviceStart, serviceStart + serviceLength)
    const accountLengthStart = serviceStart + serviceLength
    let accountLengthEnd = accountLengthStart
    while (accountLengthEnd < id.length && id[accountLengthEnd] !== ':')
      accountLengthEnd += 1
    if (accountLengthEnd >= id.length) return undefined
    const accountLength = Number(id.slice(accountLengthStart, accountLengthEnd))
    if (!Number.isInteger(accountLength) || accountLength < 0) return undefined
    const account = id.slice(accountLengthEnd + 1)
    if (account.length !== accountLength) return undefined
    return CredentialReferenceFactory.createNamed(service, account)
  }

  public static isAddonWorkspaceReference(
    id: string,
    addonId: string,
    workspaceId: string,
  ): boolean {
    const reference = CredentialReferenceFactory.fromId(id)
    if (
      reference === undefined ||
      reference.id !== id ||
      reference.service !== addonId
    )
      return false
    const canonical = CredentialReferenceFactory.createAddonWorkspace(
      addonId,
      workspaceId,
    )
    if (reference.id === canonical.id) return true
    if (
      reference.account.startsWith('ws_secret_v1:') &&
      decodeParts(reference.account.slice('ws_secret_v1:'.length), 2)?.[0] ===
        workspaceId
    )
      return true
    if (
      reference.account.startsWith('conn_secret_v1:') &&
      decodeParts(reference.account.slice('conn_secret_v1:'.length), 3)?.[0] ===
        workspaceId
    )
      return true
    if (
      reference.account.startsWith('cap_secret_v1:') &&
      decodeParts(reference.account.slice('cap_secret_v1:'.length), 4)?.[0] ===
        workspaceId
    )
      return true
    if (reference.account.startsWith('ws_secret_candidate_v1:')) {
      const parts = decodeParts(
        reference.account.slice('ws_secret_candidate_v1:'.length),
        3,
      )
      if (parts !== undefined && parts[0] === workspaceId) return true
    }
    if (reference.account.startsWith('conn_secret_candidate_v1:')) {
      const parts = decodeParts(
        reference.account.slice('conn_secret_candidate_v1:'.length),
        4,
      )
      if (parts !== undefined && parts[0] === workspaceId) return true
    }
    if (reference.account.startsWith('cap_secret_candidate_v1:')) {
      const parts = decodeParts(
        reference.account.slice('cap_secret_candidate_v1:'.length),
        5,
      )
      if (parts !== undefined && parts[0] === workspaceId) return true
    }
    const candidatePrefix = `ws_candidate_v1:${workspaceId.length}:${workspaceId}`
    if (!reference.account.startsWith(candidatePrefix)) return false
    const operationSegment = reference.account.slice(candidatePrefix.length)
    const separator = operationSegment.indexOf(':')
    if (separator < 1) return false
    const operationLengthText = operationSegment.slice(0, separator)
    if (!/^\d+$/.test(operationLengthText)) return false
    const operationLength = Number(operationLengthText)
    const operationId = operationSegment.slice(separator + 1)
    return (
      Number.isSafeInteger(operationLength) &&
      operationLength > 0 &&
      operationId.length === operationLength
    )
  }
}

function encodeParts(parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('')
}

function decodeParts(encoded: string, count: number): string[] | undefined {
  const parts: string[] = []
  let offset = 0
  for (let index = 0; index < count; index += 1) {
    let separator = offset
    while (separator < encoded.length && encoded[separator] !== ':')
      separator += 1
    if (separator === encoded.length) return undefined
    const lengthText = encoded.slice(offset, separator)
    if (!/^\d+$/.test(lengthText)) return undefined
    const length = Number(lengthText)
    if (!Number.isSafeInteger(length) || length < 0) return undefined
    const start = separator + 1
    const end = start + length
    if (end > encoded.length) return undefined
    parts.push(encoded.slice(start, end))
    offset = end
  }
  if (offset !== encoded.length) return undefined
  return parts
}
