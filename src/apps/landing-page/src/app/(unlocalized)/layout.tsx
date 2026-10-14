import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'

import { PageShell } from '@/app/components/page-shell'

export default async function UnlocalizedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = 'en'
  const messages = await getMessages({ locale })
  return (
    <PageShell locale={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </PageShell>
  )
}
