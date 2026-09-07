import { fetchLatestDesktopRelease } from '@/lib/github-release'

import { DownloadView } from './download-view'

export const revalidate = 60

export default async function DownloadPage() {
  const release = await fetchLatestDesktopRelease()

  return <DownloadView release={release} />
}
