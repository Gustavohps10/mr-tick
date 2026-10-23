import type { AddonManifestViewModel } from '@mr-tick/sdk'
import { describe, expect, it } from 'vitest'

import { resolveAddonCapabilities } from './addon-settings-dialog'

const addon: AddonManifestViewModel = {
  id: 'theme',
  name: 'Theme',
  version: '1.0.0',
  author: 'Tests',
  shortDescription: '',
  description: '',
  capabilities: ['theme'],
}

describe('Settings capabilities', () => {
  it('shows only theme settings for a theme without auth', () => {
    expect(resolveAddonCapabilities(addon).map((item) => item.id)).toEqual([
      'theme',
    ])
  })

  it('shows authentication only when declared', () => {
    expect(
      resolveAddonCapabilities({
        ...addon,
        capabilities: ['auth', 'watcher'],
      }).map((item) => item.id),
    ).toEqual(['auth', 'watcher'])
    expect(
      resolveAddonCapabilities({ ...addon, capabilities: ['dataSource'] }).map(
        (item) => item.id,
      ),
    ).toEqual(['dataSource'])
  })
})
