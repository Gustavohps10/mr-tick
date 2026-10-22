import { describe, expect, it } from 'vitest'

import { createOAuthDesktopCallbackUrl } from './oauth-callback'

describe('OAuth desktop return', () => {
  it.each([
    [true, 'electron:'],
    [false, 'mr-tick:'],
  ])(
    'uses the environment protocol for development=%s',
    (development, protocol) => {
      const query = new URLSearchParams({
        code: 'code+with&symbols',
        state: 'state/value',
      }).toString()
      const result = new URL(createOAuthDesktopCallbackUrl(query, development))
      expect(result.protocol).toBe(protocol)
      expect(result.host).toBe('oauth')
      expect(result.pathname).toBe('/callback')
      expect(result.searchParams.get('code')).toBe('code+with&symbols')
      expect(result.searchParams.get('state')).toBe('state/value')
    },
  )
  it('does not append an empty query', () => {
    expect(createOAuthDesktopCallbackUrl('', false)).toBe(
      'mr-tick://oauth/callback',
    )
  })
})
