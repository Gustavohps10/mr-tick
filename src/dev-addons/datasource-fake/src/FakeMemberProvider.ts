import type {
  DataSourceContext,
  IMemberProvider,
  MemberDTO,
  PagedResultDTO,
  PaginationOptionsDTO,
} from '@mr-tick/sdk'

import { FakeDatabaseStore } from './FakeDatabaseStore'

export class FakeMemberProvider implements IMemberProvider {
  private readonly store: FakeDatabaseStore

  constructor(private readonly context: DataSourceContext) {
    this.store = FakeDatabaseStore.getInstance()
  }

  async getCurrentUser(): Promise<MemberDTO | undefined> {
    const members = this.store.getMembers()
    return members[0]
  }

  async findByCredentials(login: string, password: string): Promise<MemberDTO> {
    const members = this.store.getMembers()
    return members[0]
  }

  async findAll(
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<MemberDTO>> {
    const members = this.store.getMembers()
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? 10
    const startIndex = (page - 1) * pageSize
    const items = members.slice(startIndex, startIndex + pageSize)
    return {
      items,
      total: members.length,
      page,
      pageSize,
    }
  }

  async findById(id: string): Promise<MemberDTO | undefined> {
    const members = this.store.getMembers()
    return members.find((member) => String(member.id) === id)
  }
}
