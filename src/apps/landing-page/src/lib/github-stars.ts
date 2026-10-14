export interface GitHubStarsResponse {
  stars: number | null
}

interface GitHubRepositoryStars {
  stargazers_count: number
}

export async function fetchRepositoryStars(): Promise<number | null> {
  const response = await fetch(
    'https://api.github.com/repos/gustavohps10/mr-tick',
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Mr-Tick-Landing-Page',
      },
      next: { revalidate: 3600 },
    },
  ).catch(() => null)
  if (!response || !response.ok) return null
  const data: GitHubRepositoryStars | null = await response
    .json()
    .catch(() => null)
  if (!data) return null
  if (!Number.isSafeInteger(data.stargazers_count) || data.stargazers_count < 0)
    return null
  return data.stargazers_count
}
