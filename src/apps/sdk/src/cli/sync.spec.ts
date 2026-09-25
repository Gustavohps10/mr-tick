import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { readYaml } from '../utils/yaml'
import { syncManifest } from './sync'

describe('syncManifest', () => {
  it('should synchronize version from package.json into manifest.yaml', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-tick-test-sync-'))
    const manifestPath = path.join(tempDir, 'manifest.yaml')
    const packageJsonPath = path.join(tempDir, 'package.json')

    fs.writeFileSync(
      manifestPath,
      [
        'id: test-addon',
        'name: Test Addon',
        'version: 0.1.0',
        'author: Test Author',
        'shortDescription: Test Short',
        'description: Test Description',
      ].join('\n'),
    )

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        name: '@mr-tick/test-addon',
        version: '0.2.0',
      }),
    )

    const success = syncManifest(tempDir)
    expect(success).toBe(true)

    const updated = readYaml<{ version: string }>(manifestPath)
    expect(updated.version).toBe('0.2.0')

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
