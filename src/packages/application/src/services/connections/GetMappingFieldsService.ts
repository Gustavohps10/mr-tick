import { AppError, Either, isNonEmptyString } from '@mr-tick/shared/helpers'

import type {
  GetMappingFieldsInput,
  IDataSourceResolver,
  IGetMappingFieldsUseCase,
  MappingFieldDefinition,
} from '@/contracts'

export class GetMappingFieldsService implements IGetMappingFieldsUseCase {
  constructor(private readonly dataSourceResolver: IDataSourceResolver) {}

  public async execute(
    input: GetMappingFieldsInput,
  ): Promise<Either<AppError, MappingFieldDefinition[]>> {
    if (!isNonEmptyString(input.workspaceId)) {
      return Either.failure(AppError.ValidationError('WORKSPACE_ID_REQUIRED'))
    }
    if (!isNonEmptyString(input.connectionInstanceId)) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_INSTANCE_ID_REQUIRED'),
      )
    }

    const adapterResult = await this.dataSourceResolver.getDataSource(
      input.workspaceId,
      input.connectionInstanceId,
    )
    if (adapterResult.isFailure()) return adapterResult.forwardFailure()

    const adapter = adapterResult.success
    const provider = adapter.metadataProvider
    if (provider === undefined) {
      return Either.failure(
        AppError.NotFound('METADATA_PROVIDER_NOT_AVAILABLE'),
      )
    }
    if (provider.getMappingFields === undefined) {
      return Either.failure(AppError.NotFound('MAPPING_FIELDS_NOT_SUPPORTED'))
    }

    const result = await provider.getMappingFields()
    return result
  }
}
