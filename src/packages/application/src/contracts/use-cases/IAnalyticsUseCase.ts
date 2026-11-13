import type { AppError, Either } from '@mr-tick/shared/helpers'

import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsFilterDynamicSource,
  AnalyticsFilterOption,
} from '../data/providers/IAnalyticsProvider'

export interface GetAnalyticsDatasetsInput {
  workspaceId: string
  connectionInstanceId: string
}

export interface FetchAnalyticsDatasetInput extends GetAnalyticsDatasetsInput {
  query: AnalyticsDatasetQueryInput
}

export interface GetAnalyticsFilterOptionsInput extends GetAnalyticsDatasetsInput {
  source: AnalyticsFilterDynamicSource
}

export interface IAnalyticsUseCase {
  listAnalyticsDatasets(
    input: GetAnalyticsDatasetsInput,
  ): Promise<Either<AppError, AnalyticsDatasetManifest[]>>
  fetchAnalyticsDataset(
    input: FetchAnalyticsDatasetInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>>
  getFilterOptions(
    input: GetAnalyticsFilterOptionsInput,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>>
}
