import { MemberDTO, PagedResultDTO, PaginationOptionsDTO } from '@/dtos'

export interface IMemberProvider {
  getCurrentUser(): Promise<MemberDTO | undefined>
  findById(id: string): Promise<MemberDTO | undefined>
  findByCredentials(login: string, password: string): Promise<MemberDTO>
  findAll(pagination?: PaginationOptionsDTO): Promise<PagedResultDTO<MemberDTO>>
}
