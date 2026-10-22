import type {
  CreatedTaskResult,
  CreatedTimeEntryResult,
  IMemberProvider,
  IMetadataProvider,
  ITaskProvider,
  ITimeEntryProvider,
  MappingFieldDefinition,
  MemberDTO,
  MetadataDTO,
  PagedResultDTO,
  PaginationOptionsDTO,
  TaskDTO,
  TimeEntryCreateIdempotency,
  TimeEntryDTO,
  TimeEntryPullCheckpointDTO,
  TimeEntryPullPageDTO,
  UpdatedTaskResult,
  UpdatedTimeEntryResult,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

import type { AddonBindingLifetime } from '../lifecycle/AddonLifetime'

export type OperationSupportChecker = (operation: string) => boolean

export class GuardedTaskProvider implements ITaskProvider {
  constructor(
    private readonly inner: ITaskProvider,
    private readonly binding: AddonBindingLifetime,
    private readonly capturedGen: number,
    private readonly isOperationSupported: OperationSupportChecker,
    private readonly isScopeValid: boolean,
  ) {}

  public async pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, TaskDTO[]>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('pull')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.pull(memberId, checkpoint, batch)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TaskDTO>>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findAll')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findAll(pagination)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findById(id: string): Promise<Either<AppError, TaskDTO | null>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findById')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findById(id)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async create(
    task: TaskDTO,
  ): Promise<Either<AppError, CreatedTaskResult>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('create')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.create(task)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async update(
    task: TaskDTO,
  ): Promise<Either<AppError, UpdatedTaskResult>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('update')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.update(task)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async delete(id: string): Promise<Either<AppError, void>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('delete')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.delete(id)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }
}

export class GuardedTimeEntryProvider implements ITimeEntryProvider {
  declare public findByCorrelation?: (
    correlationId: string,
    entry: TimeEntryDTO,
  ) => Promise<Either<AppError, TimeEntryDTO | null>>

  declare public updateConditional?: (
    entry: TimeEntryDTO,
    expected: TimeEntryDTO,
  ) => Promise<Either<AppError, UpdatedTimeEntryResult>>

  constructor(
    private readonly inner: ITimeEntryProvider,
    private readonly binding: AddonBindingLifetime,
    private readonly capturedGen: number,
    private readonly isOperationSupported: OperationSupportChecker,
    private readonly isScopeValid: boolean,
  ) {
    if (inner.findByCorrelation !== undefined) {
      const innerFindByCorrelation = inner.findByCorrelation.bind(inner)
      this.findByCorrelation = async (correlationId, entry) => {
        if (!this.isScopeValid) {
          return Either.failure(
            AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
          )
        }
        if (!this.isOperationSupported('findByCorrelation')) {
          return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
        }
        if (!this.binding.isCurrentGeneration(this.capturedGen)) {
          return Either.failure(
            AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
          )
        }
        const result = await innerFindByCorrelation(correlationId, entry)
        if (!this.binding.isCurrentGeneration(this.capturedGen)) {
          return Either.failure(
            AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
          )
        }
        return result
      }
    }

    if (inner.updateConditional !== undefined) {
      const innerUpdateConditional = inner.updateConditional.bind(inner)
      this.updateConditional = async (entry, expected) => {
        if (!this.isScopeValid) {
          return Either.failure(
            AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
          )
        }
        if (!this.isOperationSupported('updateConditional')) {
          return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
        }
        if (!this.binding.isCurrentGeneration(this.capturedGen)) {
          return Either.failure(
            AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
          )
        }
        const result = await innerUpdateConditional(entry, expected)
        if (!this.binding.isCurrentGeneration(this.capturedGen)) {
          return Either.failure(
            AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
          )
        }
        return result
      }
    }
  }

  public get timeEntryCreateIdempotency():
    TimeEntryCreateIdempotency | undefined {
    return this.inner.timeEntryCreateIdempotency
  }

  public async pull(
    memberId: string,
    checkpoint: TimeEntryPullCheckpointDTO,
    batch: number,
  ): Promise<Either<AppError, TimeEntryPullPageDTO>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('pull')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.pull(memberId, checkpoint, batch)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findByMemberId')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findByMemberId(memberId, startDate, endDate)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async create(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, CreatedTimeEntryResult>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('create')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.create(entry)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async update(
    entry: TimeEntryDTO,
  ): Promise<Either<AppError, UpdatedTimeEntryResult>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('update')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.update(entry)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async delete(id: string): Promise<Either<AppError, void>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('delete')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.delete(id)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findById(
    id: string,
  ): Promise<Either<AppError, TimeEntryDTO | null>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findById')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findById(id)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<TimeEntryDTO>>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findAll')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findAll(pagination)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }
}

export class GuardedMemberProvider implements IMemberProvider {
  constructor(
    private readonly inner: IMemberProvider,
    private readonly binding: AddonBindingLifetime,
    private readonly capturedGen: number,
    private readonly isOperationSupported: OperationSupportChecker,
    private readonly isScopeValid: boolean,
  ) {}

  public async getCurrentUser(): Promise<Either<AppError, MemberDTO | null>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('getCurrentUser')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.getCurrentUser()
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findById(
    id: string,
  ): Promise<Either<AppError, MemberDTO | null>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findById')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findById(id)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findByCredentials(
    login: string,
    password: string,
  ): Promise<Either<AppError, MemberDTO>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findByCredentials')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findByCredentials(login, password)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }

  public async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<MemberDTO>>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('findAll')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.findAll(pagination)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }
}

export class GuardedMetadataProvider implements IMetadataProvider {
  declare public getMappingFields?: () => Promise<
    Either<AppError, MappingFieldDefinition[]>
  >

  constructor(
    private readonly inner: IMetadataProvider,
    private readonly binding: AddonBindingLifetime,
    private readonly capturedGen: number,
    private readonly isOperationSupported: OperationSupportChecker,
    private readonly isScopeValid: boolean,
  ) {
    if (inner.getMappingFields !== undefined) {
      const innerGetMappingFields = inner.getMappingFields.bind(inner)
      this.getMappingFields = async () => {
        if (!this.isScopeValid) {
          return Either.failure(
            AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
          )
        }
        if (!this.isOperationSupported('getMappingFields')) {
          return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
        }
        if (!this.binding.isCurrentGeneration(this.capturedGen)) {
          return Either.failure(
            AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
          )
        }
        const result = await innerGetMappingFields()
        if (!this.binding.isCurrentGeneration(this.capturedGen)) {
          return Either.failure(
            AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
          )
        }
        return result
      }
    }
  }

  public async getMetadata(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<Either<AppError, MetadataDTO>> {
    if (!this.isScopeValid) {
      return Either.failure(
        AppError.ValidationError('CONNECTION_SCOPE_REQUIRED'),
      )
    }
    if (!this.isOperationSupported('getMetadata')) {
      return Either.failure(AppError.Http(403, 'OPERATION_NOT_SUPPORTED'))
    }
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    const result = await this.inner.getMetadata(memberId, checkpoint, batch)
    if (!this.binding.isCurrentGeneration(this.capturedGen)) {
      return Either.failure(
        AppError.Unauthorized('CONNECTION_DISCONNECTED_OR_CHANGED'),
      )
    }
    return result
  }
}
