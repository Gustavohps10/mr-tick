import { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetResult,
  AnalyticsFilterOption,
  FetchAnalyticsDatasetInput,
  GetAnalyticsDatasetsInput,
  GetAnalyticsFilterOptionsInput,
  IAnalyticsResolver,
  IAnalyticsUseCase,
} from '@/contracts'

export class AnalyticsService implements IAnalyticsUseCase {
  constructor(private readonly analyticsResolver: IAnalyticsResolver) {}

  public async listAnalyticsDatasets(
    input: GetAnalyticsDatasetsInput,
  ): Promise<Either<AppError, AnalyticsDatasetManifest[]>> {
    const resolved = await this.analyticsResolver.resolve(
      input.workspaceId,
      input.connectionInstanceId,
    )
    if (resolved.isFailure()) return resolved.forwardFailure()
    return resolved.success.provider.listAnalyticsDatasets()
  }

  public async fetchAnalyticsDataset(
    input: FetchAnalyticsDatasetInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    if (!input.query.datasetId.trim())
      return Either.failure(AppError.ValidationError('DATASET_ID_REQUIRED'))
    const resolved = await this.analyticsResolver.resolve(
      input.workspaceId,
      input.connectionInstanceId,
    )
    if (resolved.isFailure()) return resolved.forwardFailure()
    return resolved.success.provider.fetchAnalyticsDataset(input.query)
  }

  public async getFilterOptions(
    input: GetAnalyticsFilterOptionsInput,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>> {
    const resolved = await this.analyticsResolver.resolve(
      input.workspaceId,
      input.connectionInstanceId,
    )
    if (resolved.isFailure()) return resolved.forwardFailure()
    return resolved.success.provider.getFilterOptions(input.source)
  }
}
