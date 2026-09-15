import { MetadataDTO } from '@/dtos'

export interface IMetadataProvider {
  getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<MetadataDTO>
}
