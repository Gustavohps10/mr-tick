import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ICredentialsStorage } from '@mr-tick/application'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AddonLoader } from './AddonLoader'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getVersion: vi.fn(() => '0.3.0'),
  },
}))

describe('AddonLoader - Version Locking & Compatibility at Runtime', () => {
  let addonLoader: AddonLoader
  let fakeCredentialsStorage: ICredentialsStorage
  let testAddonDir: string

  beforeEach(() => {
    vi.clearAllMocks()

    fakeCredentialsStorage = {
      getToken: vi.fn().mockResolvedValue(null),
      saveToken: vi.fn().mockResolvedValue(undefined),
      deleteToken: vi.fn().mockResolvedValue(undefined),
      hasToken: vi.fn().mockResolvedValue(false),
      replaceToken: vi.fn().mockResolvedValue(undefined),
    }

    // Cria AddonLoader configurado com hostAppVersion '0.3.0'
    addonLoader = new AddonLoader(fakeCredentialsStorage, '0.3.0')

    // Cria diretório temporário para simular addon no disco
    testAddonDir = join(
      tmpdir(),
      `mr-tick-test-addon-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    )
    mkdirSync(testAddonDir, { recursive: true })
    mkdirSync(join(testAddonDir, 'dist'), { recursive: true })

    // Cria entry file mínimo
    writeFileSync(
      join(testAddonDir, 'dist', 'index.js'),
      'export default class TestAddon { async activate() {} async deactivate() {} }',
    )
  })

  afterEach(() => {
    if (existsSync(testAddonDir)) {
      try {
        rmSync(testAddonDir, { recursive: true, force: true })
      } catch {
        // Silencia erro de limpeza em teste
      }
    }
  })

  it('deve rejeitar e não ativar addon cuja requiredApiVersion no manifesto seja superior à versão do app', async () => {
    // Escreve manifesto com requiredApiVersion incompatível (>=0.5.0, app é 0.3.0)
    const manifestContent = `
id: test-future-addon
name: Future Addon
version: 1.0.0
requiredApiVersion: '>=0.5.0'
`
    writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

    const loaded = await addonLoader.loadAndActivateFromDisk(
      'test-future-addon',
      testAddonDir,
    )

    expect(loaded).toBe(false)
    expect(addonLoader.hasActiveAddon('test-future-addon')).toBe(false)
  })

  it('deve carregar com sucesso addon com requiredApiVersion compatível (>=0.1.0)', async () => {
    const manifestContent = `
id: test-compatible-addon
name: Compatible Addon
version: 0.1.0
requiredApiVersion: '>=0.1.0'
`
    writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

    const loaded = await addonLoader.loadAndActivateFromDisk(
      'test-compatible-addon',
      testAddonDir,
    )

    expect(loaded).toBe(true)
    expect(addonLoader.hasActiveAddon('test-compatible-addon')).toBe(true)
  })

  it('deve carregar com sucesso addon legado que não especifica requiredApiVersion (fallback para 0.1.0)', async () => {
    const manifestContent = `
id: test-legacy-addon
name: Legacy Addon
version: 0.1.0
`
    writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

    const loaded = await addonLoader.loadAndActivateFromDisk(
      'test-legacy-addon',
      testAddonDir,
    )

    expect(loaded).toBe(true)
    expect(addonLoader.hasActiveAddon('test-legacy-addon')).toBe(true)
  })
})
