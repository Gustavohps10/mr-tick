import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchRepositoryStars } from './github-stars'

afterEach(() => vi.unstubAllGlobals())

describe('GitHub stars transport', () => {
  it('returns the actual count, including zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ stargazers_count: 0 })),
    )
    expect(await fetchRepositoryStars()).toBe(0)
  })

  it('does not invent stars on upstream failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    )
    expect(await fetchRepositoryStars()).toBeNull()
  })

  it.each([
    { stargazers_count: '120' },
    { stargazers_count: -1 },
    { stargazers_count: 1.5 },
    null,
  ])('rejects invalid counts: %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)))
    expect(await fetchRepositoryStars()).toBeNull()
  })

  it('handles a network failure in the transport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await fetchRepositoryStars()).toBeNull()
  })

  it('requests the repository on the server with hourly revalidation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ stargazers_count: 42 }))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchRepositoryStars()).toBe(42)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/gustavohps10/mr-tick',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Mr-Tick-Landing-Page',
        },
        next: { revalidate: 3600 },
      },
    )
  })
})
