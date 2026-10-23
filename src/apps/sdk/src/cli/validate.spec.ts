import fs from 'fs'
import { describe, expect, it, vi } from 'vitest'

import { AddonCapability } from '../contracts/manifest'
import * as yamlUtils from '../utils/yaml'
import { validateAddon } from './validate'

describe('validateAddon', () => {
  it('should validate valid manifest without errors', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'my-addon',
      name: 'My Addon',
      version: '1.0.0',
      author: 'Author',
      capabilities: ['dataSource'],
    })

    const result = validateAddon('mock-dir')
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('permite manifesto sem dataSource e com watcher válido', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'presence-addon',
      name: 'Presence Addon',
      version: '1.0.0',
      author: 'Author',
      capabilities: ['auth', 'watcher'],
    })

    const result = validateAddon('mock-dir')
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('recusa capacidades duplicadas', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'duplicate',
      name: 'Duplicate',
      version: '1.0.0',
      author: 'Author',
      capabilities: ['dataSource', 'dataSource'],
    })
    const result = validateAddon('mock-dir')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Capacidade duplicada "dataSource".')
  })

  it('recusa manifesto com capacidade inválida', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const invalidCap = 'invalidCapability' as unknown as AddonCapability
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'invalid-addon',
      name: 'Invalid Addon',
      version: '1.0.0',
      author: 'Author',
      capabilities: [invalidCap],
    })

    const result = validateAddon('mock-dir')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'Capacidade inválida "invalidCapability". Capacidades válidas são: auth, dataSource, watcher, calendar, punch, theme',
    )
  })
})
