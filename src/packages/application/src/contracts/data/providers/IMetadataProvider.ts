import { AppError, Either } from '@mr-tick/shared/helpers'

import { MetadataDTO } from '@/dtos'

export interface MappingFieldDefinition {
  id: string
  name: string
  category: 'status' | 'activity' | 'priority' | 'tracker' | 'custom'
  defaultIcon?: string
  defaultColor?: string
  description?: string
}

export interface IMetadataProvider {
  getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, MetadataDTO>>

  getMappingFields?(): Promise<Either<AppError, MappingFieldDefinition[]>>
}
