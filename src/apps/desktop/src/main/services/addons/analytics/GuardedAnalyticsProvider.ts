import type {
  AnalyticsDatasetManifest,
  AnalyticsDatasetQueryInput,
  AnalyticsDatasetResult,
  AnalyticsFilterDynamicSource,
  AnalyticsFilterOption,
  IAnalyticsProvider,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonBindingLifetime } from '../lifecycle/AddonLifetime'

export class GuardedAnalyticsProvider implements IAnalyticsProvider {
  constructor(
    private readonly inner: IAnalyticsProvider,
    private readonly binding: AddonBindingLifetime,
    private readonly generation: number,
    private readonly isSupported: (operation: string) => boolean,
    private readonly scope: {
      workspaceId: string
      connectionInstanceId: string
    },
  ) {}

  private async execute<T>(
    operation: string,
    run: () => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    if (
      !this.scope.workspaceId.trim() ||
      !this.scope.connectionInstanceId.trim()
    )
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    if (!this.isSupported(operation))
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    if (!this.binding.isCurrentGeneration(this.generation))
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    const result = await run()
    if (!this.binding.isCurrentGeneration(this.generation))
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    if (!this.isSupported(operation))
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    return result
  }

  public listAnalyticsDatasets(): Promise<
    Either<AppError, AnalyticsDatasetManifest[]>
  > {
    return this.execute('listAnalyticsDatasets', () =>
      this.inner.listAnalyticsDatasets(),
    )
  }

  public fetchAnalyticsDataset(
    input: AnalyticsDatasetQueryInput,
  ): Promise<Either<AppError, AnalyticsDatasetResult>> {
    return this.execute('fetchAnalyticsDataset', () =>
      this.inner.fetchAnalyticsDataset(input),
    )
  }

  public getFilterOptions(
    source: AnalyticsFilterDynamicSource,
  ): Promise<Either<AppError, AnalyticsFilterOption[]>> {
    return this.execute('getFilterOptions', () =>
      this.inner.getFilterOptions(source),
    )
  }
}
