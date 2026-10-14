import '../../index.css'

import { Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export function PageShell({
  children,
  locale,
}: {
  children: React.ReactNode
  locale: string
}) {
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistMono.variable} h-full font-mono antialiased`}
    >
      <body
        className="flex min-h-full flex-col font-mono"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
