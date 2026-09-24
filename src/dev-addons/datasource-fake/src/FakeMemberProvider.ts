import {
  AppError,
  type DataSourceContext,
  Either,
  type IMemberProvider,
  type MemberDTO,
  type PagedResultDTO,
  type PaginationOptionsDTO,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeMemberProvider implements IMemberProvider {
  private readonly store: FakeDatabaseStore

  constructor(private readonly context: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

  async getCurrentUser(): Promise<Either<AppError, MemberDTO | null>> {
    const members = this.store.getMembers()
    const member = members.length > 0 ? members[0] : null
    return Either.success(member)
  }

  async findByCredentials(
    login: string,
    password: string,
  ): Promise<Either<AppError, MemberDTO>> {
    const members = this.store.getMembers()
    const member = members.find((m) => m.email === login) ?? members[0]
    if (!member)
      return Either.failure(AppError.NotFound('USUARIO_NAO_ENCONTRADO'))
    return Either.success(member)
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<Either<AppError, PagedResultDTO<MemberDTO>>> {
    const members = this.store.getMembers()
    let page = 1
    if (pagination && pagination.page) page = pagination.page
    let pageSize = 10
    if (pagination && pagination.pageSize) pageSize = pagination.pageSize
    const startIndex = (page - 1) * pageSize
    const items = members.slice(startIndex, startIndex + pageSize)
    return Either.success({
      items,
      total: members.length,
      page,
      pageSize,
    })
  }

  async findById(id: string): Promise<Either<AppError, MemberDTO | null>> {
    const members = this.store.getMembers()
    const member = members.find((m) => String(m.id) === id) ?? null
    return Either.success(member)
  }
}
