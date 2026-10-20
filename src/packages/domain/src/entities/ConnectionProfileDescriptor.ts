export type ConnectionCardinality = 'single' | 'multi'

export interface AuthorizationRoleRequirement {
  readonly authorizationRole: string
  readonly allowedAuthProfileIds: readonly string[]
  readonly defaultAuthProfileId: string | null
  readonly required?: boolean
  readonly label?: string
}

export type ConnectionProfileDescriptor = Readonly<{
  connectionProfileId: string
  cardinality: ConnectionCardinality
  default: boolean
  allowedAuthProfileIds?: readonly string[]
  defaultAuthProfileId?: string | null
  roles?: readonly AuthorizationRoleRequirement[]
}>

export function isValidConnectionProfileDescriptors(
  profiles: ConnectionProfileDescriptor[],
): boolean {
  if (!Array.isArray(profiles)) return false
  if (profiles.length === 0) return false
  let defaultCount = 0
  const profileIds = new Set<string>()
  for (const profile of profiles) {
    if (typeof profile !== 'object') return false
    if (profile === null) return false
    if (typeof profile.connectionProfileId !== 'string') return false
    if (profile.connectionProfileId.trim().length === 0) return false
    if (profile.cardinality !== 'single' && profile.cardinality !== 'multi') {
      return false
    }
    if (typeof profile.default !== 'boolean') return false
    if (profileIds.has(profile.connectionProfileId)) return false
    profileIds.add(profile.connectionProfileId)
    if (profile.default) {
      defaultCount += 1
    }
  }
  return defaultCount <= 1
}
