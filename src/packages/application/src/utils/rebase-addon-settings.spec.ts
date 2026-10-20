import { describe, expect, it } from 'vitest'

import { rebaseAddonSettings } from './rebase-addon-settings'

describe('rebase addon settings patch', () => {
  it('preserves dirty fields over fresh server values and adopts independent updates', () => {
    expect(
      rebaseAddonSettings(
        { locale: 'en-US', theme: 'light' },
        { theme: 'dark' },
      ),
    ).toEqual({ locale: 'en-US', theme: 'dark' })
  })
})
