import { describe, expect, it } from 'vitest'

import { getLatestReleasePerMinor } from './github-release'

describe('getLatestReleasePerMinor', () => {
  it('keeps only the newest patch release for each major/minor version', () => {
    const releases = [
      { version: 'v0.9.0', name: '0.9.0' },
      { version: 'v0.8.2', name: '0.8.2' },
      { version: 'v0.8.1', name: '0.8.1' },
      { version: 'v0.7.4', name: '0.7.4' },
      { version: 'v0.7.2', name: '0.7.2' },
    ]

    expect(getLatestReleasePerMinor(releases)).toEqual([
      { version: 'v0.9.0', name: '0.9.0' },
      { version: 'v0.8.2', name: '0.8.2' },
      { version: 'v0.7.4', name: '0.7.4' },
    ])
  })

  it('keeps major versions separate and leaves versions without semver intact', () => {
    const releases = [
      { version: 'v1.0.1', name: '1.0.1' },
      { version: 'v1.0.0', name: '1.0.0' },
      { version: 'v0.10.9', name: '0.10.9' },
      { version: 'unreleased', name: 'unreleased' },
    ]

    expect(getLatestReleasePerMinor(releases)).toEqual([
      { version: 'v1.0.1', name: '1.0.1' },
      { version: 'v0.10.9', name: '0.10.9' },
      { version: 'unreleased', name: 'unreleased' },
    ])
  })
})
