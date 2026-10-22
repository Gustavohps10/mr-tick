import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  IAddonAccessService,
  ICoreAddonCapabilities,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

export const unavailableCore: ICoreAddonCapabilities = {
  runtime: {
    getState: () => 'starting',
    onStateChanged: (listener) => {
      listener('starting')
      return () => {}
    },
  },
  workspaces: {
    list: async () => Either.success([]),
    get: async () => Either.failure(AppError.NotFound('WORKSPACE_NOT_FOUND')),
  },
  connections: {
    list: async () => Either.success([]),
    get: async () => Either.failure(AppError.NotFound('CONNECTION_NOT_FOUND')),
    create: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    createAuthorizationRequest: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    completeAuthentication: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    submitCredentials: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    withCredentials: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    disconnect: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    archive: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    restore: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    refresh: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    remove: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
  },
  tasks: {
    list: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
    get: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
  },
  metadata: {
    get: async () =>
      Either.failure(AppError.Http(503, 'CORE_CACHE_UNAVAILABLE')),
  },
}

function readRequiredApiVersionFromManifest(
  directoryPath: string,
): string | undefined {
  const manifestPath = join(directoryPath, 'manifest.yaml')
  if (!existsSync(manifestPath)) {
    return '-1'
  }
  const content = readFileSync(manifestPath, 'utf-8')
  const match = /^\s*requiredApiVersion:\s*['"]?([^'"\r\n]+)['"]?/m.exec(
    content,
  )
  if (!match) {
    return undefined
  }
  return match[1].trim()
}

export const permissiveAddonAccessService: IAddonAccessService = {
  authorizeFiles: async (files, addonId, version) => {
    void files
    return Either.success({
      addonId,
      version,
      classification: 'free',
      fingerprint: 'a'.repeat(64),
    })
  },
  authorizeDirectory: async (addonId, directoryPath) =>
    Either.success({
      addonId,
      version: '1.0.0',
      requiredApiVersion: readRequiredApiVersionFromManifest(directoryPath),
      classification: 'free',
      fingerprint: 'a'.repeat(64),
    }),
}
