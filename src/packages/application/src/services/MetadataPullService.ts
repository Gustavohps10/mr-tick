import { AppError, Either } from '@mr-tick/shared/helpers'

import { IDataSourceResolver } from '@/contracts/resolvers'
import {
  IMetadataPullUseCase,
  PullMetadataInput,
} from '@/contracts/use-cases/IMetadataPullUseCase'
import { MetadataDTO } from '@/dtos'

export class MetadataPullService implements IMetadataPullUseCase {
  constructor(private readonly dataSourceResolver: IDataSourceResolver) {}

  async execute(
    input: PullMetadataInput,
  ): Promise<Either<AppError, MetadataDTO>> {
    try {
      const adapter = await this.dataSourceResolver.getDataSource(
        input.workspaceId,
        input.connectionInstanceId,
      )

      const result = await adapter.getAuthenticatedMemberData()
      if (result.isFailure()) return result.forwardFailure()

      const member = result.success

      const metadataResult = await adapter.metadataProvider.getMetadata(
        member.id.toString(),
        input.checkpoint,
        input.batch,
      )
      if (metadataResult.isFailure()) return metadataResult.forwardFailure()

      return Either.success(metadataResult.success)
    } catch {
      return Either.failure(AppError.NotFound('Failed to pull metadata'))
    }
  }
}
