import { NextResponse } from 'next/server'

import {
  fetchRepositoryStars,
  type GitHubStarsResponse,
} from '@/lib/github-stars'

export const revalidate = 3600

export async function GET() {
  const stars = await fetchRepositoryStars()
  const body: GitHubStarsResponse = { stars }
  if (stars === null) return NextResponse.json(body, { status: 502 })
  return NextResponse.json(body)
}
