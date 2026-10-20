import type { ConnectionIdentity } from '@mr-tick/domain'

import type { MemberDTO } from '@/dtos/MemberDTO'

export interface ConnectionResultDTO {
  identity?: ConnectionIdentity
  member?: MemberDTO
}
