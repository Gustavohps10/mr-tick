import {
  AppError,
  type DataSourceContext,
  Either,
  type IMetadataProvider,
  type MappingFieldDefinition,
  type MetadataDTO,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeMetadataProvider implements IMetadataProvider {
  private readonly store: FakeDatabaseStore

  constructor(private readonly context?: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

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

    metadata.trackStatuses?.forEach((t) => {
      fields.push({
        id: t.id,
        name: t.name,
        category: 'tracker',
        categoryLabel: 'Tipos de Tarefa / Rastreadores',
        description: `Tipo de tarefa: ${t.name}`,
      })
    })

    metadata.activities?.forEach((a) => {
      fields.push({
        id: a.id,
        name: a.name,
        category: 'activity',
        categoryLabel: 'Atividades',
        description: `Atividade: ${a.name}`,
      })
    })

    metadata.taskStatuses?.forEach((s) => {
      fields.push({
        id: s.id,
        name: s.name,
        category: 'status',
        categoryLabel: 'Status de Tarefas',
        description: `Status: ${s.name}`,
      })
    })

    metadata.taskPriorities?.forEach((p) => {
      fields.push({
        id: p.id,
        name: p.name,
        category: 'priority',
        categoryLabel: 'Prioridades',
        description: `Prioridade: ${p.name}`,
      })
    })

    return Either.success(fields)
  }
}
