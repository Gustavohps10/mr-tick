import * as rootParams from 'next/root-params'
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { routing } from './routing'

export default getRequestConfig(async ({ locale: localeOverride }) => {
  let requestedLocale = localeOverride
  if (!requestedLocale) requestedLocale = await rootParams.locale()
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  const messages = (await import(`../../messages/${locale}.json`)).default
  return { locale, messages }
})
