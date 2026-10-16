import { PageShell } from '@/app/components/page-shell'

export default function OAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PageShell locale="en">{children}</PageShell>
}
