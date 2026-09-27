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
    const fields: MappingFieldDefinition[] = [
      {
        id: 'backlog',
        name: 'Backlog',
        category: 'status',
        defaultIcon: 'Inbox',
        defaultColor: '#64748b',
        description: 'Tarefas não iniciadas no backlog.',
      },
      {
        id: 'in_progress',
        name: 'Em Andamento',
        category: 'status',
        defaultIcon: 'PlayCircle',
        defaultColor: '#3b82f6',
        description: 'Tarefas em desenvolvimento ativo.',
      },
      {
        id: 'review',
        name: 'Em Revisão',
        category: 'status',
        defaultIcon: 'Eye',
        defaultColor: '#eab308',
        description: 'Tarefas aguardando code review ou validação.',
      },
      {
        id: 'done',
        name: 'Concluído',
        category: 'status',
        defaultIcon: 'CheckCircle2',
        defaultColor: '#22c55e',
        description: 'Tarefas finalizadas e entregues.',
      },
      {
        id: 'blocked',
        name: 'Bloqueado',
        category: 'status',
        defaultIcon: 'AlertOctagon',
        defaultColor: '#ef4444',
        description: 'Tarefas com impedimentos.',
      },
    ]

    return Either.success(fields)
  }
}
