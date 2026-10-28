export interface MemberDTO {
  /** Native provider identity: numeric IDs and opaque account IDs are both valid. */
  id: string | number
  login: string
  firstname: string
  lastname: string
  admin?: boolean
  createdOn?: string
  lastLoginOn?: string
  avatarUrl?: string
  customFields: { id: number; name: string; value: string }[]
}
