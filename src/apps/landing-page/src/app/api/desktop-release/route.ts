import { NextResponse } from 'next/server'

import { fetchLatestDesktopRelease } from '@/lib/github-release'

export const revalidate = 60

export async function GET() {
  const release = await fetchLatestDesktopRelease()
  if (!release) {
    return NextResponse.json({ error: 'No release found' }, { status: 404 })
  }
  return NextResponse.json(release)
}
