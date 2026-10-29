import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { IAddonEventsAPI } from '../../host/events/IAddonEventsAPI'
import type {
  AddonSettingsValues,
  AddonVaultScope,
} from '../../host/vault/IAddonVaultAPI'
import type { AddonSettingsSchema } from './AddonSettingsSchema'

export type {
  AddonEvaluateFormRequest,
  AddonExecuteOperationalActionRequest,
  AddonFieldDisabledEntry,
  AddonFieldMessageEntry,
  AddonFieldVisibilityEntry,
  AddonFormEvaluationResponse,
  AddonOperationalItem,
  AddonOperationalListPagination,
  AddonOperationalListRequest,
  AddonOperationalListResponse,
  AddonResolvedDependencyEntry,
  AddonResolveOptionsPagination,
  AddonResolveOptionsRequest,
  AddonResolveOptionsResponse,
  AddonSettingsApplyState,
  AddonSettingsApplyStatus,
  AddonSettingsContext,
  AddonSettingsFormEvaluatorHandler,
  AddonSettingsOperationalActionHandler,
  AddonSettingsOperationalListProviderHandler,
  AddonSettingsOptionsProviderHandler,
  AddonSettingsSchemaProvider,
  AddonSettingsValidateHandler,
  AddonValidateSettingsRequest,
} from '@mr-tick/application'

import type {
  AddonSettingsContext,
  AddonSettingsFormEvaluatorHandler,
  AddonSettingsOperationalActionHandler,
  AddonSettingsOperationalListProviderHandler,
  AddonSettingsOptionsProviderHandler,
  AddonSettingsSchemaProvider,
  AddonSettingsValidateHandler,
} from '@mr-tick/application'

export interface AddonSettingsApplyContext {
  readonly scope: AddonVaultScope
  readonly revision: number
  readonly values: AddonSettingsValues
  readonly events: IAddonEventsAPI
  readonly track: (cleanup: () => void) => () => void
}

export type AddonSettingsApplyHandler = (
  context: AddonSettingsApplyContext,
) => Promise<Either<AppError, void>> | Either<AppError, void>

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

export interface IAddonSettingsAPI {
  register(
    schema: AddonSettingsSchemaProvider,
    options?: AddonSettingsRegisterOptions,
  ): void
  getSchema(
    context?: AddonSettingsContext,
  ): Promise<AddonSettingsSchema | undefined> | AddonSettingsSchema | undefined
}
