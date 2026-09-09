export interface DesktopReleaseInfo {
  version: string
  rawVersion: string
  publishedAt: string
  formattedDate: string
  releaseUrl: string
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

    if (!releases || !Array.isArray(releases))
      return { stable: null, beta: null }

    const desktopReleases = releases.filter((r: GitHubRelease) =>
      r.tag_name?.startsWith('@mr-tick/desktop@'),
    )

    const stableRelease = desktopReleases.find(
      (r) => !r.prerelease && !r.tag_name.includes('-beta'),
    )
    const betaRelease = desktopReleases.find(
      (r) => r.prerelease || r.tag_name.includes('-beta'),
    )

    const parseRelease = async (
      release?: GitHubRelease,
    ): Promise<DesktopReleaseInfo | null> => {
      if (!release) return null

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

      const extractReleaseCommit = (text?: string | null): string | null => {
        if (!text) return null
        const urlMatch = text.match(/commit\/([a-f0-9]{7,40})/)
        if (urlMatch) return urlMatch[1]
        const listMatch = text.match(/(?:^|\n)-\s*([a-f0-9]{7,40}):/)
        if (listMatch) return listMatch[1]
        return null
      }

      const commitSha = extractReleaseCommit(release.body)

      if (commitSha) {
        try {
          const commitData = await fetchGithubJson<GitHubCommit>(
            `https://api.github.com/repos/Gustavohps10/mr-tick/commits/${commitSha}`,
            headers,
          )

          if (commitData && commitData.author) {
            commitInfo = {
              sha: commitData.sha,
              shortSha: commitData.sha.substring(0, 7),
              url: commitData.html_url,
              author: {
                login: commitData.author.login,
                name: commitData.author.name || commitData.author.login,
                avatarUrl: commitData.author.avatar_url,
                profileUrl: commitData.author.html_url,
              },
            }
          }
        } catch (e) {
          console.warn('Could not resolve commit details for release:', e)
        }
      }

      let resolvedPrNumber: string | null = null

      if (release.body) {
        const bodyPrMatch = release.body.match(/(?:pull\/|#)(\d+)/)
        if (bodyPrMatch) {
          resolvedPrNumber = bodyPrMatch[1]
        }
      }

      if (!resolvedPrNumber && commitSha) {
        try {
          const pulls = await fetchGithubJson<GitHubPullRequest[]>(
            `https://api.github.com/repos/Gustavohps10/mr-tick/commits/${commitSha}/pulls`,
            headers,
          )
          if (pulls && Array.isArray(pulls) && pulls.length > 0) {
            resolvedPrNumber = String(pulls[0].number)
          }
        } catch {
          // ignore
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
        pr,
        installer,
        portable,
        commit: commitInfo,
      }
    }

    const [stable, beta] = await Promise.all([
      parseRelease(stableRelease),
      parseRelease(betaRelease),
    ])

    return { stable, beta }
  } catch (error) {
    console.error('Error fetching desktop releases:', error)
    return { stable: null, beta: null }
  }
}
