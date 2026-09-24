import type {
  DataSourceContext,
  IMetadataProvider,
  MetadataDTO,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeMetadataProvider implements IMetadataProvider {
  private readonly store: FakeDatabaseStore

  constructor(private readonly context: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

  async getMetadata(
    memberId?: string,
    checkpoint?: { updatedAt: Date; id: string },
    batch?: number,
  ): Promise<MetadataDTO> {
    return this.store.getMetadata()
  }
}
