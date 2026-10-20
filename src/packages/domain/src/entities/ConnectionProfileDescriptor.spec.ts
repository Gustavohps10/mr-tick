import { describe, expect, it } from 'vitest'

import {
  ConnectionProfileDescriptor,
  isValidConnectionProfileDescriptors,
} from './ConnectionProfileDescriptor'

describe('ConnectionProfileDescriptor validation', () => {
  const profile = (
    connectionProfileId: string,
    cardinality: 'single' | 'multi',
    defaultProfile: boolean,
  ): ConnectionProfileDescriptor => ({
    connectionProfileId,
    cardinality,
    default: defaultProfile,
  })

  it('accepts unique IDs, supported cardinalities, and at most one default', () => {
    expect(
      isValidConnectionProfileDescriptors([
        profile('primary', 'single', true),
        profile('secondary', 'multi', false),
      ]),
    ).toBe(true)
  })

  it('accepts profiles without an explicit default', () => {
    expect(
      isValidConnectionProfileDescriptors([
        profile('primary', 'single', false),
        profile('secondary', 'multi', false),
      ]),
    ).toBe(true)
  })

  it('rejects missing or duplicated defaults, duplicate IDs, and blank IDs', () => {
    expect(isValidConnectionProfileDescriptors([])).toBe(false)
    expect(
      isValidConnectionProfileDescriptors([
        profile('primary', 'single', true),
        profile('secondary', 'multi', true),
      ]),
    ).toBe(false)
    expect(
      isValidConnectionProfileDescriptors([
        profile('primary', 'single', true),
        profile('primary', 'multi', false),
      ]),
    ).toBe(false)
    expect(
      isValidConnectionProfileDescriptors([profile('  ', 'single', true)]),
    ).toBe(false)
  })
})
