import { MemberViewModel } from '@/view-models/MemberViewModel'

export interface ConnectionResultViewModel {
  member?: MemberViewModel
  identity?: {
    kind: string
    providerId: string
    tenantId?: string
    providerSubjectId: string
    displayName?: string
  }
}
