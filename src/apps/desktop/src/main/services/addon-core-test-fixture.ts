import type { ICoreReadAPI } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

export const unavailableCore: ICoreReadAPI = {
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
