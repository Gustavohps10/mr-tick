import type { AppError, Either, FieldErrors } from '@mr-tick/shared/helpers'

import type {
  AddonSettingScalarValue,
  AddonSettingsValues,
  AddonSettingValue,
  AddonVaultScope,
} from '../vault/IAddonVaultAPI'
import type {
  AddonFieldAddress,
  AddonOperationalActionDefinition,
  AddonSettingsOption,
  AddonSettingsSchema,
} from './AddonSettingsSchema'

export interface AddonSettingsContext {
  readonly scope?: AddonVaultScope
  readonly workspaceId?: string
}

export type AddonSettingsApplyStatus = 'applied' | 'pending' | 'failed'

export interface AddonSettingsApplyState {
  readonly revision: number
  readonly status: AddonSettingsApplyStatus
  readonly error?: {
    readonly messageKey: string
    readonly statusCode: number
    readonly details?: FieldErrors
  }
}

export interface AddonSettingsApplyContext {
  readonly scope: AddonVaultScope
  readonly revision: number
  readonly values: AddonSettingsValues
  readonly track: (cleanup: () => void) => () => void
}

export type AddonSettingsApplyHandler = (
  context: AddonSettingsApplyContext,
) => Promise<Either<AppError, void>> | Either<AppError, void>

export interface AddonValidateSettingsRequest {
  readonly scope: AddonVaultScope
  readonly values: AddonSettingsValues
}

export type AddonSettingsValidateHandler = (
  request: AddonValidateSettingsRequest,
) => Promise<Either<AppError, void>> | Either<AppError, void>

export interface AddonResolvedDependencyEntry {
  readonly address: AddonFieldAddress
  readonly value: AddonSettingValue
}

export interface AddonResolveOptionsRequest {
  readonly scope: AddonVaultScope
  readonly providerId: string
  readonly fieldAddress: AddonFieldAddress
  readonly dependencies: readonly AddonResolvedDependencyEntry[]
  readonly draftValues: AddonSettingsValues
  readonly search?: string
  readonly cursor?: string
  readonly limit?: number
}

export type AddonResolveOptionsPagination =
  | { readonly hasMore: true; readonly nextCursor: string }
  | { readonly hasMore: false }

export type AddonResolveOptionsResponse = {
  readonly availability:
    'available' | 'empty' | 'no-permission' | 'disconnected' | 'error'
  readonly options: readonly AddonSettingsOption[]
  readonly reason?: string
  readonly error?: {
    readonly messageKey: string
    readonly statusCode: number
    readonly details?: FieldErrors
  }
} & AddonResolveOptionsPagination

export type AddonSettingsOptionsProviderHandler = (
  request: AddonResolveOptionsRequest,
) =>
  | Promise<Either<AppError, AddonResolveOptionsResponse>>
  | Either<AppError, AddonResolveOptionsResponse>

export interface AddonOperationalItem {
  readonly itemId: string
  readonly title: string
  readonly subtitle?: string
  readonly status: 'pending' | 'resolved' | 'interrupted' | 'error'
  readonly reason?: string
  readonly timestamp: string
  readonly durationSeconds?: number
  readonly data: Record<string, AddonSettingScalarValue>
  readonly availableActions: readonly AddonOperationalActionDefinition[]
}

export interface AddonOperationalListRequest {
  readonly scope: AddonVaultScope
  readonly providerId: string
  readonly cursor?: string
  readonly limit?: number
}

export type AddonOperationalListPagination =
  | { readonly hasMore: true; readonly nextCursor: string }
  | { readonly hasMore: false }

export type AddonOperationalListResponse = {
  readonly items: readonly AddonOperationalItem[]
} & AddonOperationalListPagination

export type AddonSettingsOperationalListProviderHandler = (
  request: AddonOperationalListRequest,
) =>
  | Promise<Either<AppError, AddonOperationalListResponse>>
  | Either<AppError, AddonOperationalListResponse>

export interface AddonExecuteOperationalActionRequest {
  readonly scope: AddonVaultScope
  readonly providerId: string
  readonly itemId: string
  readonly actionId: string
  readonly payload?: Record<string, AddonSettingValue>
}

export type AddonSettingsOperationalActionHandler = (
  request: AddonExecuteOperationalActionRequest,
) => Promise<Either<AppError, void>> | Either<AppError, void>

export interface AddonFieldMessageEntry {
  readonly address: AddonFieldAddress
  readonly messages: readonly string[]
}

export interface AddonFieldVisibilityEntry {
  readonly address: AddonFieldAddress
  readonly visible: boolean
}

export interface AddonFieldDisabledEntry {
  readonly address: AddonFieldAddress
  readonly disabled: boolean
}

export interface AddonEvaluateFormRequest {
  readonly scope: AddonVaultScope
  readonly evaluatorId: string
  readonly draftValues: AddonSettingsValues
  readonly targetAddress?: AddonFieldAddress
}

export interface AddonFormEvaluationResponse {
  readonly fieldMessages?: readonly AddonFieldMessageEntry[]
  readonly fieldVisibility?: readonly AddonFieldVisibilityEntry[]
  readonly fieldDisabled?: readonly AddonFieldDisabledEntry[]
  readonly clearFields?: readonly AddonFieldAddress[]
}

export type AddonSettingsFormEvaluatorHandler = (
  request: AddonEvaluateFormRequest,
) =>
  | Promise<Either<AppError, AddonFormEvaluationResponse>>
  | Either<AppError, AddonFormEvaluationResponse>

export interface AddonSettingsRegisterOptions {
  readonly onApply?: AddonSettingsApplyHandler
  readonly onValidate?: AddonSettingsValidateHandler
  readonly optionsProviders?: Record<
    string,
    AddonSettingsOptionsProviderHandler
  >
  readonly operationalListProviders?: Record<
    string,
    AddonSettingsOperationalListProviderHandler
  >
  readonly operationalActionHandlers?: Record<
    string,
    AddonSettingsOperationalActionHandler
  >
  readonly formEvaluators?: Record<string, AddonSettingsFormEvaluatorHandler>
}

export type AddonSettingsSchemaProvider =
  | AddonSettingsSchema
  | ((
      context?: AddonSettingsContext,
    ) => Promise<AddonSettingsSchema> | AddonSettingsSchema)

export interface IAddonSettingsAPI {
  register(
    schema: AddonSettingsSchemaProvider,
    options?: AddonSettingsRegisterOptions,
  ): void
  getSchema(
    context?: AddonSettingsContext,
  ): Promise<AddonSettingsSchema | undefined> | AddonSettingsSchema | undefined
}
