export interface User {
  id: number
  avatarUrl?: string
  login: string
  firstname: string
  lastname: string
  admin: boolean
  createdOn: string
  lastLoginOn: string
  customFields: { id: number; name: string; value: string }[]
}
