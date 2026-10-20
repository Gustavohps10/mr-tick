import keytar from 'keytar'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KeytarCredentialsVault } from './KeytarCredentialsVault'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

describe('KeytarCredentialsVault', () => {
  beforeEach(() => vi.clearAllMocks())

  it('distinguishes an absent credential from an unavailable vault', async () => {
    const vault = new KeytarCredentialsVault()
    vi.mocked(keytar.getPassword).mockResolvedValueOnce(null)
    vi.mocked(keytar.getPassword).mockRejectedValueOnce(new Error('locked'))

    await expect(vault.getToken('service', 'absent')).resolves.toEqual({
      kind: 'absent',
    })
    await expect(vault.getToken('service', 'locked')).resolves.toEqual({
      kind: 'unavailable',
    })
  })

  it('reports hasToken using the same absent and unavailable states', async () => {
    const vault = new KeytarCredentialsVault()
    vi.mocked(keytar.getPassword).mockResolvedValueOnce(null)
    vi.mocked(keytar.getPassword).mockRejectedValueOnce(new Error('locked'))

    await expect(vault.hasToken('service', 'absent')).resolves.toEqual({
      kind: 'absent',
    })
    await expect(vault.hasToken('service', 'locked')).resolves.toEqual({
      kind: 'unavailable',
    })
  })
})
