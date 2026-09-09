import { NextResponse } from 'next/server'

import { fetchLatestDesktopReleases } from '@/lib/github-release'

export const revalidate = 60

export async function GET() {
  const { stable } = await fetchLatestDesktopReleases()
  if (!stable) {
    return NextResponse.json({ error: 'No release found' }, { status: 404 })
  }
  return NextResponse.json(stable)
}
