import { loader } from 'fumadocs-core/source'

import { docsI18n } from '@/i18n/docs'

import { docs } from '../../.source/server'

export const source = loader({
  baseUrl: '/docs',
  i18n: docsI18n,
  source: docs.toFumadocsSource(),
})
