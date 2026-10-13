import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const headerStore = await headers()

  let locale = cookieStore.get('NEXT_LOCALE')?.value

  if (!locale || (locale !== 'en' && locale !== 'pt-br')) {
    const acceptLanguage =
      headerStore.get('accept-language')?.toLowerCase() || ''
    if (acceptLanguage.includes('pt')) {
      locale = 'pt-br'
    } else {
      locale = 'en'
    }
  }

  const messages = (await import(`../../messages/${locale}.json`)).default

  return {
    locale,
    messages,
  }
})
