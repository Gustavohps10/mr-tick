import { IQueryBase } from '@/contracts/data/queries/IQueryBase'
import { MemberDTO } from '@/dtos'

export interface IMemberQuery extends IQueryBase<MemberDTO> {
  findByCredentials(login: string, password: string): Promise<MemberDTO>
}
