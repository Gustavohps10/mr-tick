import type { AppError, Either } from '@mr-tick/shared/helpers'

import type { MappingFieldDefinition } from '../data/providers/IMetadataProvider'

export interface GetMappingFieldsInput {
  workspaceId: string
  connectionInstanceId: string
}

export interface IGetMappingFieldsUseCase {
  execute(
    input: GetMappingFieldsInput,
  ): Promise<Either<AppError, MappingFieldDefinition[]>>
}
