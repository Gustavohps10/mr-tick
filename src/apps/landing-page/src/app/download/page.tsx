import { fetchLatestDesktopReleases } from '@/lib/github-release'

import { DownloadView } from './download-view'

export const revalidate = 60

export default async function DownloadPage() {
  const { releases, defaultVersion } = await fetchLatestDesktopReleases()

  return <DownloadView releases={releases} defaultVersion={defaultVersion} />
}
