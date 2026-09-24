export const DEFAULT_MIN_API_VERSION = '0.1.0'

export interface ParsedSemVer {
  major: number
  minor: number
  patch: number
}

export function parseSemVer(versionString: string): ParsedSemVer | null {
  const trimmed = versionString.trim().replace(/^[vV]/, '')
  const parts = trimmed.split('.')
  if (parts.length === 0) return null

  const major = parseInt(parts[0], 10)
  if (isNaN(major) || major < 0) return null

  const minor = parts.length > 1 ? parseInt(parts[1], 10) : 0
  if (isNaN(minor) || minor < 0) return null

  const patch = parts.length > 2 ? parseInt(parts[2], 10) : 0
  if (isNaN(patch) || patch < 0) return null

  return { major, minor, patch }
}

export function compareSemVer(a: ParsedSemVer, b: ParsedSemVer): number {
  if (a.major !== b.major) {
    if (a.major > b.major) return 1
    return -1
  }

  if (a.minor !== b.minor) {
    if (a.minor > b.minor) return 1
    return -1
  }

  if (a.patch !== b.patch) {
    if (a.patch > b.patch) return 1
    return -1
  }

  return 0
}

function checkSingleConstraint(appVer: ParsedSemVer, clause: string): boolean {
  const trimmed = clause.trim()
  if (!trimmed) return true

  // Check operator prefix
  const operatorMatch = trimmed.match(/^([><=!~^]+)\s*(.*)$/)
  if (!operatorMatch) {
    // Plain version without operator (e.g. "0.1.0" or "0.1") -> treat as minimum required version (>=)
    const target = parseSemVer(trimmed)
    if (!target) return true
    return compareSemVer(appVer, target) >= 0
  }

  const op = operatorMatch[1]
  const targetVerStr = operatorMatch[2]
  const target = parseSemVer(targetVerStr)
  if (!target) return true

  if (op === '>=') {
    return compareSemVer(appVer, target) >= 0
  }

  if (op === '>') {
    return compareSemVer(appVer, target) > 0
  }

  if (op === '<=') {
    return compareSemVer(appVer, target) <= 0
  }

  if (op === '<') {
    return compareSemVer(appVer, target) < 0
  }

  if (op === '=' || op === '==') {
    return compareSemVer(appVer, target) === 0
  }

  if (op === '~') {
    const isGte = compareSemVer(appVer, target) >= 0
    const sameMajorMinor =
      appVer.major === target.major && appVer.minor === target.minor
    return isGte && sameMajorMinor
  }

  if (op === '^') {
    const isGte = compareSemVer(appVer, target) >= 0
    if (!isGte) return false

    if (target.major > 0) {
      return appVer.major === target.major
    }

    if (target.minor > 0) {
      return appVer.major === 0 && appVer.minor === target.minor
    }

    return (
      appVer.major === 0 && appVer.minor === 0 && appVer.patch === target.patch
    )
  }

  return compareSemVer(appVer, target) >= 0
}

/**
 * Checks whether the current host application version satisfies an addon's requiredApiVersion.
 * If requiredApiVersion is missing, empty, or undefined, it defaults to DEFAULT_MIN_API_VERSION ('0.1.0').
 */
export function isApiVersionCompatible(
  requiredApiVersion: string | undefined | null,
  currentAppVersion: string,
): boolean {
  const appVer = parseSemVer(currentAppVersion)
  if (!appVer) return false

  const effectiveRequired =
    requiredApiVersion && requiredApiVersion.trim().length > 0
      ? requiredApiVersion.trim()
      : `>=${DEFAULT_MIN_API_VERSION}`

  // Support multiple space-separated constraints, e.g. ">=0.1.0 <0.4.0"
  const clauses = effectiveRequired.split(/\s+/)
  for (const clause of clauses) {
    const satisfied = checkSingleConstraint(appVer, clause)
    if (!satisfied) return false
  }

  return true
}
