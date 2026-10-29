import {
  type AddonContext,
  type AddonSettingsGroup,
  AppError,
  type CreatedTaskResult,
  type CreatedTimeEntryResult,
  createTimeEntrySnapshotPage,
  type DataSourceContext,
  Either,
  type IAddon,
  type IDataSource,
  type IMemberProvider,
  type IMetadataProvider,
  type ITaskProvider,
  type ITimeEntryProvider,
  type MappingFieldDefinition,
  type MemberDTO,
  type MetadataDTO,
  type MetadataItem,
  type PagedResultDTO,
  type PaginationOptionsDTO,
  type TaskDTO,
  type TimeEntryCreateIdempotency,
  type TimeEntryDTO,
  type TimeEntryPullCheckpointDTO,
  type TimeEntryPullPageDTO,
  type UpdatedTaskResult,
  type UpdatedTimeEntryResult,
} from '@mr-tick/sdk'

const palette = {
  purple: {
    badge: '#7C3AED',
    background: '#EDE9FE',
    text: '#5B21B6',
    border: '#A78BFA',
  },
  emerald: {
    badge: '#059669',
    background: '#D1FAE5',
    text: '#047857',
    border: '#34D399',
  },
} as const

export const ALPHA_MEMBER: MemberDTO = {
  id: 201,
  login: 'beatriz.alpha',
  firstname: 'Beatriz',
  lastname: 'Alpha',
  admin: false,
  createdOn: '2026-10-01T10:00:00.000Z',
  lastLoginOn: '2026-10-28T10:00:00.000Z',
  customFields: [],
}

export const ALPHA_TASKS: TaskDTO[] = [
  {
    id: 'ALPHA-101',
    title: 'Alpha Architecture Spike',
    description: 'Investigação e prova de conceito arquitetural independente',
    status: { id: 'status-open', name: 'Em Progresso' },
    priority: { id: 'priority-high', name: 'Alta' },
    projectName: 'Alpha Core',
    tracker: { id: 'track-feature', name: 'Feature' },
    assignedTo: {
      id: String(ALPHA_MEMBER.id),
      name: `${ALPHA_MEMBER.firstname} ${ALPHA_MEMBER.lastname}`,
    },
    updatedAt: new Date('2026-10-28T10:00:00.000Z'),
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    url: 'https://alpha.corp/tasks/ALPHA-101',
  },
  {
    id: 'ALPHA-102',
    title: 'Alpha Verification Suite',
    description: 'Suíte de testes de isolamento com tarefas alfanuméricas',
    status: { id: 'status-open', name: 'Em Aberto' },
    priority: { id: 'priority-normal', name: 'Normal' },
    projectName: 'Alpha Core',
    tracker: { id: 'track-task', name: 'Tarefa' },
    assignedTo: {
      id: String(ALPHA_MEMBER.id),
      name: `${ALPHA_MEMBER.firstname} ${ALPHA_MEMBER.lastname}`,
    },
    updatedAt: new Date('2026-10-28T11:00:00.000Z'),
    createdAt: new Date('2026-10-01T11:00:00.000Z'),
    url: 'https://alpha.corp/tasks/ALPHA-102',
  },
]

const ALPHA_ACTIVITIES: MetadataItem[] = [
  {
    id: 'act-alpha-dev',
    name: 'Alpha Development',
    icon: 'Terminal',
    colors: palette.purple,
  },
]

const ALPHA_STATUSES: MetadataItem[] = [
  {
    id: 'status-open',
    name: 'Em Progresso',
    icon: 'Play',
    colors: palette.emerald,
  },
]

export const ALPHA_METADATA: MetadataDTO = {
  taskStatuses: ALPHA_STATUSES,
  taskPriorities: [],
  activities: ALPHA_ACTIVITIES,
  trackStatuses: ALPHA_STATUSES,
  participantRoles: [],
  estimationTypes: [],
}

class FakeAlphaTaskProvider implements ITaskProvider {
  private readonly context: DataSourceContext

  constructor(context: DataSourceContext) {
    this.context = context
  }

  async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    void memberId
    const cpTime = checkpoint.updatedAt.getTime()
    const filtered = ALPHA_TASKS.filter((task) => {
      const taskTime = task.updatedAt.getTime()
      if (taskTime > cpTime) return true
      if (taskTime === cpTime) return task.id > checkpoint.id
      return false
    })
    return Either.success(filtered.slice(0, batch))
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TaskDTO>>> {
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? ALPHA_TASKS.length
    const startIndex = (page - 1) * pageSize
    const items = ALPHA_TASKS.slice(startIndex, startIndex + pageSize)
    return Either.success({
      items,
      total: ALPHA_TASKS.length,
      page,
      pageSize,
    })
  }

  async findById(id: string): Promise<Either<AppError, TaskDTO | null>> {
    const found = ALPHA_TASKS.find((task) => task.id === id) ?? null
    return Either.success(found)
  }

  async create(task: TaskDTO): Promise<Either<AppError, CreatedTaskResult>> {
    ALPHA_TASKS.push(task)
    return Either.success({ id: task.id, updatedAt: new Date() })
  }

  async update(task: TaskDTO): Promise<Either<AppError, UpdatedTaskResult>> {
    const idx = ALPHA_TASKS.findIndex((existing) => existing.id === task.id)
    if (idx >= 0) {
      ALPHA_TASKS[idx] = task
    }
    return Either.success({ id: task.id, updatedAt: new Date() })
  }

  async delete(id: string): Promise<Either<AppError, void>> {
    const idx = ALPHA_TASKS.findIndex((task) => task.id === id)
    if (idx >= 0) {
      ALPHA_TASKS.splice(idx, 1)
    }
    return Either.success()
  }
}

class FakeAlphaMemberProvider implements IMemberProvider {
  private readonly context: DataSourceContext

  constructor(context: DataSourceContext) {
    this.context = context
  }

  async getCurrentUser(): Promise<Either<AppError, MemberDTO | null>> {
    return Either.success(ALPHA_MEMBER)
  }

  async findById(id: string): Promise<Either<AppError, MemberDTO | null>> {
    const isMatch = String(ALPHA_MEMBER.id) === id
    return Either.success(isMatch ? ALPHA_MEMBER : null)
  }

  async findByCredentials(
    login: string,
    password: string,
  ): Promise<Either<AppError, MemberDTO>> {
    void login
    void password
    return Either.success(ALPHA_MEMBER)
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<MemberDTO>>> {
    void pagination
    return Either.success({
      items: [ALPHA_MEMBER],
      total: 1,
      page: 1,
      pageSize: 1,
    })
  }
}

class FakeAlphaMetadataProvider implements IMetadataProvider {
  private readonly context?: DataSourceContext

  constructor(context?: DataSourceContext) {
    this.context = context
  }

  async getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, MetadataDTO>> {
    void memberId
    void checkpoint
    void batch
    return Either.success(ALPHA_METADATA)
  }

  async getMappingFields(): Promise<
    Either<AppError, MappingFieldDefinition[]>
  > {
    return Either.success([
      {
        id: 'act-alpha-dev',
        name: 'Alpha Development',
        category: 'activity',
        categoryLabel: 'Atividade Alpha',
      },
    ])
  }
}

class FakeAlphaTimeEntryProvider implements ITimeEntryProvider {
  public readonly timeEntryCreateIdempotency: TimeEntryCreateIdempotency =
    'reconcilable'
  private readonly entries: TimeEntryDTO[] = []
  private readonly context: DataSourceContext

  constructor(context: DataSourceContext) {
    this.context = context
  }

  async pull(
    memberId: string,
    checkpoint: TimeEntryPullCheckpointDTO,
    batch: number,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>> {
    return createTimeEntrySnapshotPage(
      this.entries,
      checkpoint,
      batch,
      memberId,
    )
  }

  async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    void memberId
    void startDate
    void endDate
    return Either.success({
      items: this.entries,
      total: this.entries.length,
      page: 1,
      pageSize: this.entries.length > 0 ? this.entries.length : 10,
    })
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? this.entries.length
    const startIndex = (page - 1) * pageSize
    const items = this.entries.slice(startIndex, startIndex + pageSize)
    return Either.success({
      items,
      total: this.entries.length,
      page,
      pageSize,
    })
  }

  async findById(id: string): Promise<Either<AppError, TimeEntryDTO | null>> {
    const found = this.entries.find((entry) => entry.id === id) ?? null
    return Either.success(found)
  }

  async create(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, CreatedTimeEntryResult>> {
    const id = entry.id ?? `alpha-entry-${Date.now()}`
    const saved: TimeEntryDTO = {
      ...entry,
      id,
    }
    this.entries.push(saved)
    return Either.success({
      id,
      remoteId: id,
      updatedAt: new Date(),
    })
  }

  async update(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    const id = entry.id ?? `alpha-entry-${Date.now()}`
    const idx = this.entries.findIndex((existing) => existing.id === id)
    if (idx >= 0) {
      this.entries[idx] = { ...entry, id }
    }
    return Either.success({
      id,
      remoteId: id,
      updatedAt: new Date(),
    })
  }

  async delete(id: string): Promise<Either<AppError, void>> {
    const idx = this.entries.findIndex((existing) => existing.id === id)
    if (idx >= 0) {
      this.entries.splice(idx, 1)
    }
    return Either.success()
  }
}

export const AlphaDataSource: IDataSource = {
  getMappingFields: async () =>
    new FakeAlphaMetadataProvider().getMappingFields(),
  createInstance: (context) => ({
    tasksProvider: new FakeAlphaTaskProvider(context),
    timeEntriesProvider: new FakeAlphaTimeEntryProvider(context),
    membersProvider: new FakeAlphaMemberProvider(context),
    metadataProvider: new FakeAlphaMetadataProvider(context),
  }),
}

const configGroups: AddonSettingsGroup[] = [
  {
    id: 'alpha_auth_group',
    label: 'Autenticação Alpha Fixture',
    description: 'Credenciais de teste para o DataSource Alpha.',
    fields: [
      {
        id: 'apiKey',
        scope: 'credential',
        type: 'password',
        label: 'Alpha Token',
      },
    ],
  },
]

export default class AlphaDataSourceAddon implements IAddon {
  activate(context: AddonContext): void {
    console.log('🏛️ [AlphaDataSourceAddon] Registrando AlphaDataSource...')

    const profiles = context.contributions.connections.registerProfiles([
      {
        connectionProfileId: 'alpha-main',
        capability: 'dataSource',
        cardinality: 'multi',
        default: true,
        allowedAuthProfileIds: ['alpha-main'],
        defaultAuthProfileId: 'alpha-main',
        roles: [
          {
            authorizationRole: 'primary',
            allowedAuthProfileIds: ['alpha-main'],
            defaultAuthProfileId: 'alpha-main',
            required: true,
          },
        ],
      },
    ])

    if (profiles.isFailure()) {
      void context.host.notifications.error(profiles.failure.messageKey)
      return
    }

    const schema = context.contributions.connections.registerSchema(
      'alpha-main',
      [
        {
          id: 'alpha-access',
          label: 'Acesso Alpha',
          groups: configGroups,
        },
      ],
    )

    if (schema.isFailure()) {
      context.contributions.connections.unregisterProfiles()
      void context.host.notifications.error(schema.failure.messageKey)
      return
    }

    const authenticator =
      context.contributions.connections.registerAuthenticator({
        method: 'credentials',
        authProfileId: 'alpha-main',
        supportsRefresh: false,
        supportsRevocation: false,
        authenticate: async () =>
          Either.success({
            kind: 'authorized',
            identity: {
              kind: 'human',
              providerId: 'alpha',
              tenantId: 'alpha.corp',
              providerSubjectId: String(ALPHA_MEMBER.id),
              displayName: `${ALPHA_MEMBER.firstname} ${ALPHA_MEMBER.lastname}`,
            },
            credentials: { apiKey: 'alpha-secret-token-123' },
          }),
      })

    if (authenticator.isFailure()) {
      context.contributions.connections.unregisterProfiles()
      void context.host.notifications.error(authenticator.failure.messageKey)
      return
    }

    context.contributions.dataSources.register(AlphaDataSource)
  }

  deactivate(): void {
    console.log('🛑 [AlphaDataSourceAddon] Desativado.')
  }
}
