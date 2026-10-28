import { MetadataDTO } from '@/dtos'

export interface IMetadataQuery {
  getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<MetadataDTO>
}
