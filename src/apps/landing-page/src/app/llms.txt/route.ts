import { routing } from '@/i18n/routing'
import { docsLlms } from '@/lib/source'

export function GET(request: Request) {
  const locale = new URL(request.url).searchParams.get('locale')

  if (locale === null)
    return new Response(docsLlms.index(), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })

  if (!routing.locales.some((language) => language === locale))
    return new Response('Locale not found', { status: 404 })

  return new Response(docsLlms.index(locale), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
