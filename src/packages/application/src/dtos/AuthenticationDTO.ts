import { MemberDTO } from '@/dtos/MemberDTO'

export interface AuthenticationDTO {
  member: MemberDTO
  token: string
}
