import fs from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

import * as yamlUtils from '../utils/yaml'
import { validateAddon } from './validate'

describe('validateAddon', () => {
  it('should validate valid manifest without errors', () => {
    const fakeDir = path.resolve(process.cwd(), 'src/tests/datasource-fake')
    if (fs.existsSync(fakeDir)) {
      const result = validateAddon(fakeDir)
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    }
  })

  it('recusa manifesto com mais de um dataSource (regra M16)', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'my-addon',
      name: 'My Addon',
      version: '1.0.0',
      author: 'Author',
      categories: ['dataSource'],
      capabilities: [
        {
          capabilityId: 'ds-primary',
          kind: 'dataSource',
          contractVersion: '1.0.0',
          required: true,
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['read'],
        },
        {
          capabilityId: 'ds-secondary',
          kind: 'dataSource',
          contractVersion: '1.0.0',
          required: false,
          executionPolicy: { kind: 'activeWorkspace' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['write'],
        },
      ],
    })

    const result = validateAddon('mock-dir')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'Um addon pode oferecer no máximo um dataSource.',
    )
  })

  it('permite manifesto sem dataSource e com descritores de watcher/calendar válidos', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'presence-addon',
      name: 'Presence Addon',
      version: '1.0.0',
      author: 'Author',
      categories: ['watcher'],
      capabilities: [
        {
          capabilityId: 'voice-watcher',
          kind: 'watcher',
          contractVersion: '1.0.0',
          required: true,
          executionPolicy: {
            kind: 'activeWorkspace',
            exclusivity: 'exclusiveSocket',
          },
          authRequirement: {
            kind: 'required',
            connectionProfileId: 'discord-presence',
            authorizationRole: 'primary',
          },
          supportedOperations: ['watchVoice'],
        },
      ],
    })

    const result = validateAddon('mock-dir')
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('recusa descritores com capabilityId duplicado ou authRequirement genérico', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(yamlUtils, 'readYaml').mockReturnValue({
      id: 'duplicate-addon',
      name: 'Duplicate Addon',
      version: '1.0.0',
      author: 'Author',
      categories: ['calendar'],
      capabilities: [
        {
          capabilityId: 'cap-1',
          kind: 'calendar',
          contractVersion: '1.0.0',
          required: true,
          executionPolicy: { kind: 'independent' },
          authRequirement: { kind: 'invalid-auth' },
          supportedOperations: ['read'],
        },
        {
          capabilityId: 'cap-1',
          kind: 'calendar',
          contractVersion: 'invalid-semver',
          required: false,
          executionPolicy: { kind: 'independent' },
          authRequirement: { kind: 'none' },
          supportedOperations: ['read'],
        },
      ],
    })

    const result = validateAddon('mock-dir')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('ID de capacidade duplicado: "cap-1".')
    expect(
      result.errors.some((e) =>
        e.includes(
          "capabilities[0].authRequirement.kind deve ser 'none' ou 'required'",
        ),
      ),
    ).toBe(true)
    expect(
      result.errors.some((e) =>
        e.includes(
          'capabilities[1].contractVersion deve seguir o padrão SemVer',
        ),
      ),
    ).toBe(true)
  })
})
