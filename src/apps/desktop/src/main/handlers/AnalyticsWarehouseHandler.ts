import type {
  AnalyticsLoadInput,
  AnalyticsLoadResult,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IAnalyticsWarehouseUseCase,
} from '@mr-tick/application'
import {
  createResponseViewModel,
  isNonEmptyString,
} from '@mr-tick/shared/helpers'
import type { IRequest } from '@mr-tick/shared/transport'
import type { ViewModel } from '@mr-tick/shared/view-models'
import type { IpcMainInvokeEvent } from 'electron'

import { analyticsDatasetQuerySchema } from '../validation/analyticsQuery'
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
    return createResponseViewModel(
      await this.analyticsWarehouseService.load({
        workspaceId: body.workspaceId,
        connectionInstanceId: body.connectionInstanceId,
        query: query.data,
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
}
