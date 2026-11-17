import {
  type AppError,
  Either,
  type IMetadataProvider,
  type MappingFieldDefinition,
  type MetadataDTO,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeMetadataProvider implements IMetadataProvider {
  private readonly store = FakeDatabaseStore.getInstance()

  async getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, MetadataDTO>> {
    return Either.success(this.store.getMetadata())
  }

  async getMappingFields(): Promise<
    Either<AppError, MappingFieldDefinition[]>
  > {
    const metadata = this.store.getMetadata()
    const fields: MappingFieldDefinition[] = []

    if (metadata.trackStatuses) {
      for (const t of metadata.trackStatuses) {
        fields.push({
          id: t.id,
          name: t.name,
          category: 'tracker',
          categoryLabel: 'Tipos de Tarefa / Rastreadores',
          description: `Tipo de tarefa: ${t.name}`,
        })
      }
    }

    if (metadata.activities) {
      for (const a of metadata.activities) {
        fields.push({
          id: a.id,
          name: a.name,
          category: 'activity',
          categoryLabel: 'Atividades',
          description: `Atividade: ${a.name}`,
        })
      }
    }

    if (metadata.taskStatuses) {
      for (const s of metadata.taskStatuses) {
        fields.push({
          id: s.id,
          name: s.name,
          category: 'status',
          categoryLabel: 'Status de Tarefas',
          description: `Status: ${s.name}`,
        })
      }
    }

    if (metadata.taskPriorities) {
      for (const p of metadata.taskPriorities) {
        fields.push({
          id: p.id,
          name: p.name,
          category: 'priority',
          categoryLabel: 'Prioridades',
          description: `Prioridade: ${p.name}`,
        })
      }
    }

    return Either.success(fields)
  }
}
