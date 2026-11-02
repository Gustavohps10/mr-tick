import createMiddleware from 'next-intl/middleware'

import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Match internationalized pathnames, skipping api, _next, docs, static assets
  matcher: ['/((?!api|_next|_vercel|oauth|.*\\..*).*)'],
}
