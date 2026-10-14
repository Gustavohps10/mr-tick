import { defineI18n } from 'fumadocs-core/i18n'

import { routing } from './routing'

export const docsI18n = defineI18n({
  languages: [...routing.locales],
  defaultLanguage: routing.defaultLocale,
  hideLocale: 'default-locale',
  fallbackLanguage: null,
})
