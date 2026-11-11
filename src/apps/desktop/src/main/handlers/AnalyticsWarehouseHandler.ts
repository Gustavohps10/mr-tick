import type {
  AnalyticsHydrateInput,
  AnalyticsHydrateResult,
  AnalyticsLoadInput,
  AnalyticsLoadResult,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  AnalyticsRefreshPolicy,
  AnalyticsResetStorageInput,
  AnalyticsResetStorageResult,
  AnalyticsWorkspaceState,
  IAnalyticsWarehouseUseCase,
  SaveAnalyticsWorkspaceStateInput,
} from '@mr-tick/application'
import {
  createResponseViewModel,
  isNonEmptyString,
} from '@mr-tick/shared/helpers'
import type { IRequest } from '@mr-tick/shared/transport'
import type { ViewModel } from '@mr-tick/shared/view-models'
import type { IpcMainInvokeEvent } from 'electron'

import {
  analyticsDatasetQuerySchema,
  analyticsHydrateSchema,
  analyticsRefreshPolicySchema,
  analyticsResetStorageSchema,
  analyticsSaveWorkspaceStateSchema,
} from '../validation/analyticsQuery'
import { analyticsLocalQuerySchema } from '../validation/analyticsWarehouse'

export class AnalyticsWarehouseHandler {
  constructor(
    private readonly analyticsWarehouseService: IAnalyticsWarehouseUseCase,
  ) {}

  public async load(
    event: IpcMainInvokeEvent,
    { body }: IRequest<AnalyticsLoadInput>,
  ): Promise<ViewModel<AnalyticsLoadResult>> {
    if (
      !event ||
      !isNonEmptyString(body?.workspaceId) ||
      !isNonEmptyString(body?.connectionInstanceId)
    )
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'CONNECTION_SCOPE_REQUIRED',
      }

    const query = analyticsDatasetQuerySchema.safeParse(body.query)
    if (!query.success)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_QUERY_INVALID',
      }

    let validatedPolicy: AnalyticsRefreshPolicy | undefined

    if (body.policy !== undefined) {
      const policy = analyticsRefreshPolicySchema.safeParse(body.policy)

      if (!policy.success)
        return {
          isSuccess: false,
          statusCode: 400,
          error: 'ANALYTICS_REFRESH_POLICY_INVALID',
        }

      validatedPolicy = policy.data
    }

    return createResponseViewModel(
      await this.analyticsWarehouseService.load({
        workspaceId: body.workspaceId,
        connectionInstanceId: body.connectionInstanceId,
        query: query.data,
        policy: validatedPolicy,
      }),
    )
  }

  public async query(
    event: IpcMainInvokeEvent,
    { body }: IRequest<AnalyticsQueryInput>,
  ): Promise<ViewModel<AnalyticsQueryResult>> {
    if (!event)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_QUERY_INVALID',
      }

    const query = analyticsLocalQuerySchema.safeParse(body)
    if (!query.success)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_QUERY_INVALID',
      }

    return createResponseViewModel(
      await this.analyticsWarehouseService.query(query.data),
    )
  }

  public async hydrate(
    event: IpcMainInvokeEvent,
    { body }: IRequest<AnalyticsHydrateInput>,
  ): Promise<ViewModel<AnalyticsHydrateResult>> {
    if (!event)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_HYDRATE_INVALID',
      }

    const validated = analyticsHydrateSchema.safeParse(body)
    if (!validated.success)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_HYDRATE_INVALID',
      }

    return createResponseViewModel(
      await this.analyticsWarehouseService.hydrate(validated.data),
    )
  }

  public async saveWorkspaceState(
    event: IpcMainInvokeEvent,
    { body }: IRequest<SaveAnalyticsWorkspaceStateInput>,
  ): Promise<ViewModel<AnalyticsWorkspaceState>> {
    if (!event)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_WORKSPACE_STATE_INVALID',
      }

    const validated = analyticsSaveWorkspaceStateSchema.safeParse(body)
    if (!validated.success)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_WORKSPACE_STATE_INVALID',
      }

    return createResponseViewModel(
      await this.analyticsWarehouseService.saveWorkspaceState(validated.data),
    )
  }

  public async resetStorage(
    event: IpcMainInvokeEvent,
    { body }: IRequest<AnalyticsResetStorageInput>,
  ): Promise<ViewModel<AnalyticsResetStorageResult>> {
    if (!event)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_RESET_STORAGE_INVALID',
      }

    const validated = analyticsResetStorageSchema.safeParse(body)
    if (!validated.success)
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'ANALYTICS_RESET_STORAGE_INVALID',
      }

    return createResponseViewModel(
      await this.analyticsWarehouseService.resetStorage(validated.data),
    )
  }
}
