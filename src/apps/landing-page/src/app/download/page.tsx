import { fetchLatestDesktopReleases } from '@/lib/github-release'

import { DownloadView } from './download-view'

export const revalidate = 60

export default async function DownloadPage() {
  const { stable, beta } = await fetchLatestDesktopReleases()

  return <DownloadView stable={stable} beta={beta} />
}
