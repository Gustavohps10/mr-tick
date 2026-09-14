import semver from 'semver'

export function toSemver(ver: string): string | null {
  return (
    semver.clean(ver) ||
    semver.valid(ver) ||
    semver.coerce(ver)?.version ||
    null
  )
}

export function getTagSemver(tagName: string): string | null {
  return toSemver(tagName.replace('@mr-tick/desktop@', ''))
}

export interface DesktopReleaseInfo {
  version: string
  rawVersion: string
  publishedAt: string
  formattedDate: string
  releaseUrl: string
  isBeta: boolean
  isLatest: boolean
  pr: {
    number: string
    url: string
  } | null
  installer: {
    name: string
    downloadUrl: string
    sizeFormatted: string
    bytes: number
    sha256: string | null
  } | null
  portable: {
    name: string
    downloadUrl: string
    sizeFormatted: string
    bytes: number
    sha256: string | null
  } | null
  commit: {
    sha: string
    shortSha: string
    url: string
    author: {
      login: string
      name: string
      avatarUrl: string
      profileUrl: string
    }
  } | null
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function formatReleaseDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
  } catch {
    return dateString
  }
}

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
  size: number
  digest?: string
}

interface GitHubUser {
  login: string
  name?: string
  avatar_url: string
  html_url: string
}

interface GitHubRelease {
  tag_name: string
  published_at: string
  html_url: string
  body: string | null
  target_commitish?: string
  author?: GitHubUser
  assets?: GitHubReleaseAsset[]
  prerelease?: boolean
}

interface GitHubCommit {
  sha: string
  html_url: string
  author?: GitHubUser
  committer?: GitHubUser
  commit?: {
    message?: string
    author?: {
      name?: string
      email?: string
      date?: string
    }
  }
}

interface GitHubPullRequest {
  number: number
  html_url: string
  title?: string
  merged_at?: string | null
  user?: GitHubUser
}

async function fetchGithubJson<T>(
  url: string,
  headers: HeadersInit,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data: T = await res.json()
    return data
  } catch {
    return null
  }
}

export async function fetchLatestDesktopReleases(): Promise<{
  stable: DesktopReleaseInfo | null
  beta: DesktopReleaseInfo | null
  releases: DesktopReleaseInfo[]
  defaultVersion: string
}> {
  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Mr-Tick-Landing',
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        : {}),
    }

    const releases = await fetchGithubJson<GitHubRelease[]>(
      'https://api.github.com/repos/Gustavohps10/mr-tick/releases',
      headers,
    )

    if (!releases || !Array.isArray(releases)) {
      return { stable: null, beta: null, releases: [], defaultVersion: '' }
    }

    const desktopReleases = releases.filter((r: GitHubRelease) =>
      r.tag_name?.startsWith('@mr-tick/desktop@'),
    )

    const rawBetaReleases = desktopReleases.filter(
      (r) => r.prerelease || r.tag_name.includes('-beta'),
    )
    const rawStableReleases = desktopReleases.filter(
      (r) => !r.prerelease && !r.tag_name.includes('-beta'),
    )

    const parseRelease = async (
      release: GitHubRelease,
      isBeta: boolean,
      isLatest: boolean,
    ): Promise<DesktopReleaseInfo | null> => {
      const rawVersion = release.tag_name.replace('@mr-tick/desktop@', '')
      const version = rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`

      const installerAsset = release.assets?.find((a: GitHubReleaseAsset) =>
        a.name.endsWith('.exe'),
      )
      const portableAsset = release.assets?.find((a: GitHubReleaseAsset) =>
        a.name.endsWith('.zip'),
      )

      const installerSha256 = installerAsset?.digest || null
      const portableSha256 = portableAsset?.digest || null

      const installer = installerAsset
        ? {
            name: installerAsset.name,
            downloadUrl: installerAsset.browser_download_url,
            sizeFormatted: formatBytes(installerAsset.size),
            bytes: installerAsset.size,
            sha256: installerSha256,
          }
        : null

      const portable = portableAsset
        ? {
            name: portableAsset.name,
            downloadUrl: portableAsset.browser_download_url,
            sizeFormatted: formatBytes(portableAsset.size),
            bytes: portableAsset.size,
            sha256: portableSha256,
          }
        : null

      let commitInfo: DesktopReleaseInfo['commit'] = null
      let resolvedPrNumber: string | null = null

      try {
        // Resolve commit details directly from the release tag
        const commitData = await fetchGithubJson<GitHubCommit>(
          `https://api.github.com/repos/Gustavohps10/mr-tick/commits/${encodeURIComponent(release.tag_name)}`,
          headers,
        )

        if (commitData) {
          const author =
            commitData.author || commitData.committer || release.author
          if (commitData.sha) {
            commitInfo = {
              sha: commitData.sha,
              shortSha: commitData.sha.substring(0, 7),
              url:
                commitData.html_url ||
                `https://github.com/Gustavohps10/mr-tick/commit/${commitData.sha}`,
              author: author
                ? {
                    login: author.login,
                    name: author.name || author.login,
                    avatarUrl: author.avatar_url,
                    profileUrl: author.html_url,
                  }
                : {
                    login: 'github-actions[bot]',
                    name: 'github-actions[bot]',
                    avatarUrl: 'https://avatars.githubusercontent.com/in/15368',
                    profileUrl: 'https://github.com/apps/github-actions',
                  },
            }
          }

          // 1. Detect PR from the bot merge commit message (e.g. "Merge pull request #38 from ...")
          const mergeMatch = commitData.commit?.message?.match(
            /Merge pull request #(\d+)/i,
          )
          if (mergeMatch) {
            resolvedPrNumber = mergeMatch[1]
          } else if (commitData.sha) {
            // 2. Query GitHub pulls associated with the release commit
            const pulls = await fetchGithubJson<GitHubPullRequest[]>(
              `https://api.github.com/repos/Gustavohps10/mr-tick/commits/${commitData.sha}/pulls`,
              headers,
            )
            if (pulls && Array.isArray(pulls) && pulls.length > 0) {
              resolvedPrNumber = String(pulls[0].number)
            }
          }
        }
      } catch (e) {
        console.warn('Could not resolve release tag commit details:', e)
      }

      // Fallback 1: Check release body for direct PR reference (e.g. #38 or pull/38)
      if (!resolvedPrNumber && release.body) {
        const bodyPrMatch = release.body.match(/(?:pull\/|#)(\d+)/)
        if (bodyPrMatch) {
          resolvedPrNumber = bodyPrMatch[1]
        }
      }

      // Fallback 2: Check release body for commit SHA if tag commit failed
      if (!commitInfo && release.body) {
        const urlMatch = release.body.match(/commit\/([a-f0-9]{7,40})/)
        const listMatch = release.body.match(/(?:^|\n)-\s*([a-f0-9]{7,40}):/)
        const fallbackSha = urlMatch
          ? urlMatch[1]
          : listMatch
            ? listMatch[1]
            : null
        if (fallbackSha) {
          try {
            const commitData = await fetchGithubJson<GitHubCommit>(
              `https://api.github.com/repos/Gustavohps10/mr-tick/commits/${fallbackSha}`,
              headers,
            )
            if (commitData) {
              const author =
                commitData.author || commitData.committer || release.author
              commitInfo = {
                sha: commitData.sha,
                shortSha: commitData.sha.substring(0, 7),
                url: commitData.html_url,
                author: author
                  ? {
                      login: author.login,
                      name: author.name || author.login,
                      avatarUrl: author.avatar_url,
                      profileUrl: author.html_url,
                    }
                  : {
                      login: 'github-actions[bot]',
                      name: 'github-actions[bot]',
                      avatarUrl:
                        'https://avatars.githubusercontent.com/in/15368',
                      profileUrl: 'https://github.com/apps/github-actions',
                    },
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const pr = resolvedPrNumber
        ? {
            number: resolvedPrNumber,
            url: `https://github.com/Gustavohps10/mr-tick/pull/${resolvedPrNumber}`,
          }
        : null

      return {
        version,
        rawVersion,
        publishedAt: release.published_at,
        formattedDate: formatReleaseDate(release.published_at),
        releaseUrl: release.html_url,
        isBeta,
        isLatest,
        pr,
        installer,
        portable,
        commit: commitInfo,
      }
    }

    // Sort stables descending by semver
    const sortedRawStables = [...rawStableReleases].sort((a, b) => {
      const vA = getTagSemver(a.tag_name)
      const vB = getTagSemver(b.tag_name)
      if (vA && vB) return semver.rcompare(vA, vB)
      return 0
    })

    // Sort betas descending by semver
    const sortedRawBetas = [...rawBetaReleases].sort((a, b) => {
      const vA = getTagSemver(a.tag_name)
      const vB = getTagSemver(b.tag_name)
      if (vA && vB) return semver.rcompare(vA, vB)
      return 0
    })

    // Determine if an active beta should be shown:
    // 1. Only the single latest beta is considered (intermediate betas are hidden).
    // 2. If the stable version has already been released (beta <= latest stable),
    //    the beta is obsolete and must NOT be listed.
    // 3. Betas from multiple major/minor cycles are never mixed.
    let candidateBetaToParse: GitHubRelease | null = null
    const topRawBeta = sortedRawBetas[0] ?? null
    const topRawStable = sortedRawStables[0] ?? null

    if (topRawBeta) {
      if (topRawStable) {
        const betaVer = getTagSemver(topRawBeta.tag_name)
        const stableVer = getTagSemver(topRawStable.tag_name)
        if (betaVer && stableVer) {
          if (semver.gt(betaVer, stableVer)) {
            candidateBetaToParse = topRawBeta
          }
        } else {
          candidateBetaToParse = topRawBeta
        }
      } else {
        candidateBetaToParse = topRawBeta
      }
    }

    const [parsedBeta, parsedStables] = await Promise.all([
      candidateBetaToParse
        ? parseRelease(candidateBetaToParse, true, false)
        : Promise.resolve(null),
      Promise.all(
        sortedRawStables.map((r, index) => parseRelease(r, false, index === 0)),
      ),
    ])

    const validStables = parsedStables.filter(
      (r): r is DesktopReleaseInfo => r !== null,
    )

    const latestStable = validStables[0] ?? null
    const latestBeta = parsedBeta ?? null

    // If an active beta exists (strictly newer than latest stable), list it on top.
    // Intermediate and obsolete betas are completely omitted from the site.
    const allReleases = latestBeta
      ? [latestBeta, ...validStables]
      : [...validStables]

    const defaultVersion = latestStable?.version ?? latestBeta?.version ?? ''

    return {
      stable: latestStable,
      beta: latestBeta,
      releases: allReleases,
      defaultVersion,
    }
  } catch (error) {
    console.error('Error fetching desktop releases:', error)
    return { stable: null, beta: null, releases: [], defaultVersion: '' }
  }
}
