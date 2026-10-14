import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import middleware from '../middleware'

function request(path: string, language: string, cookie?: string) {
  const headers = new Headers({ 'accept-language': language })
  if (cookie) headers.set('cookie', cookie)
  return middleware(
    new NextRequest('http://localhost:3000' + path, { headers }),
  )
}

describe('landing language negotiation', () => {
  it('detects Brazilian Portuguese on the first visit', () => {
    const response = request('/', 'pt-BR,pt;q=0.9,en;q=0.8')
    expect(response.headers.get('location')).toBe('http://localhost:3000/pt-br')
  })

  it('serves English at the root for an English browser', () => {
    const response = request('/', 'en-US,en;q=0.9')
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost:3000/en',
    )
  })

  it('honors a saved manual preference ahead of the browser language', () => {
    const response = request('/', 'pt-BR', 'NEXT_LOCALE=en')
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost:3000/en',
    )
    expect(response.headers.get('location')).toBeNull()
  })

  it('honors the explicit URL ahead of a saved cookie', () => {
    const response = request('/pt-br', 'en-US', 'NEXT_LOCALE=en')
    expect(response.headers.get('location')).toBeNull()
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale'),
    ).toBe('pt-br')
  })

  it('switches detected Portuguese docs to English and saves the choice', () => {
    const response = request(
      '/en/docs/quickstart?source=navbar',
      'pt-BR',
      'NEXT_LOCALE=pt-br',
    )
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/docs/quickstart?source=navbar',
    )
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('en')
  })

  it('switches English docs to Portuguese and saves the choice', () => {
    const response = request(
      '/pt-br/docs/quickstart',
      'en-US',
      'NEXT_LOCALE=en',
    )
    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get('NEXT_LOCALE')?.value).toBe('pt-br')
    expect(
      response.headers.get('x-middleware-request-x-next-intl-locale'),
    ).toBe('pt-br')
  })

  it('negotiates the locale for download and preserves checkout parameters', () => {
    expect(request('/download', 'pt-BR').headers.get('location')).toBe(
      'http://localhost:3000/pt-br/download',
    )
    expect(
      request('/billing/success?session_id=test', 'pt-BR').headers.get(
        'location',
      ),
    ).toBe('http://localhost:3000/pt-br/billing/success?session_id=test')
  })
})
