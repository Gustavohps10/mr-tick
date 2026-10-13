import createMiddleware from 'next-intl/middleware'

import { defaultLocale, locales } from './i18n/routing'

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: true,
})

export const config = {
  // Match only internationalized pathnames, skipping api, _next, docs, static assets
  matcher: ['/((?!api|_next|_vercel|docs|.*\\..*).*)'],
}
