import { routing } from '@/i18n/routing'
import { docsLlms, source } from '@/lib/source'

export async function GET(
  request: Request,
  props: { params: Promise<{ locale: string; slug?: string[] }> },
) {
  void request

  const { locale, slug } = await props.params

  if (!routing.locales.some((language) => language === locale))
    return new Response('Locale not found', { status: 404 })

  let slugs = slug

  if (slug?.at(-1) === 'index') slugs = slug.slice(0, -1)

  const page = source.getPage(slugs, locale)

  if (!page) return new Response('Page not found', { status: 404 })

  return new Response(await docsLlms.page(page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
