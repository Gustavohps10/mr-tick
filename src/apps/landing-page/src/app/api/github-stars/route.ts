import { NextResponse } from 'next/server'

export const revalidate = 3600 // Cache for 1 hour

export async function GET() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/gustavohps10/mr-tick',
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Mr-Tick-Landing-Page',
        },
        next: { revalidate: 3600 },
      },
    )

    if (!res.ok) {
      return NextResponse.json({ stars: 1 })
    }

    const data = await res.json()
    const stars =
      typeof data.stargazers_count === 'number' ? data.stargazers_count : 1
    return NextResponse.json({ stars })
  } catch {
    return NextResponse.json({ stars: 1 })
  }
}
