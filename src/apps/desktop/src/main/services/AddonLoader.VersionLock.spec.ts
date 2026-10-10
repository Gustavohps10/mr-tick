import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ICredentialsVault, ILocalRuntimeAPI } from '@mr-tick/application'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { unavailableCore } from './addon-core-test-fixture'
import { AddonLoader } from './AddonLoader'

const unavailableRuntime: ILocalRuntimeAPI = {
  request: async () => ({
    ok: false,
    error: { messageKey: 'RUNTIME_UNAVAILABLE', statusCode: 503 },
  }),
}

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getVersion: vi.fn(() => '0.4.0'),
  },
}))

describe('AddonLoader - Version Locking & Compatibility at Runtime', () => {
  let addonLoader: AddonLoader
  let fakeCredentialsVault: ICredentialsVault
  let testAddonDir: string

  beforeEach(() => {
    vi.clearAllMocks()

    fakeCredentialsVault = {
      getToken: vi.fn().mockResolvedValue(null),
      saveToken: vi.fn().mockResolvedValue(undefined),
      deleteToken: vi.fn().mockResolvedValue(undefined),
      hasToken: vi.fn().mockResolvedValue(false),
      replaceToken: vi.fn().mockResolvedValue(undefined),
    }

    // Cria AddonLoader configurado com hostAppVersion '0.4.0'
    addonLoader = new AddonLoader(
      fakeCredentialsVault,
      unavailableRuntime,
      '0.4.0',
      unavailableCore,
    )

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
    // Escreve manifesto com requiredApiVersion incompatível (>=0.5.0, app é 0.4.0)
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

  it('deve rejeitar e não ativar addon legado da era 0.1.x (ex: Redmine antigo >=0.1.1) no app 0.4.0', async () => {
    const manifestContent = `
id: gustavohps10-redmine
name: Redmine Legacy
version: 0.1.1
requiredApiVersion: '>=0.1.1'
`
    writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

    const loaded = await addonLoader.loadAndActivateFromDisk(
      'gustavohps10-redmine',
      testAddonDir,
    )

    expect(loaded).toBe(false)
    expect(addonLoader.hasActiveAddon('gustavohps10-redmine')).toBe(false)
  })

  it('deve rejeitar addon legado que não especifica requiredApiVersion no app 0.4.0 (fallback 0.1.0 pertence a 0.1.x)', async () => {
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

    expect(loaded).toBe(false)
    expect(addonLoader.hasActiveAddon('test-legacy-addon')).toBe(false)
  })

  it('deve carregar com sucesso addon com requiredApiVersion compatível com o app atual (>=0.4.0)', async () => {
    const manifestContent = `
id: test-compatible-addon
name: Compatible Addon
version: 0.4.0
requiredApiVersion: '>=0.4.0'
`
    writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

    const loaded = await addonLoader.loadAndActivateFromDisk(
      'test-compatible-addon',
      testAddonDir,
    )

    expect(loaded).toBe(true)
    expect(addonLoader.hasActiveAddon('test-compatible-addon')).toBe(true)
  })

  it('deve carregar com sucesso addon com requiredApiVersion "-1" mesmo no app 0.4.0', async () => {
    const manifestContent = `
id: test-universal-addon
name: Universal Addon
version: 1.0.0
requiredApiVersion: '-1'
`
    writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

    const loaded = await addonLoader.loadAndActivateFromDisk(
      'test-universal-addon',
      testAddonDir,
    )

    expect(loaded).toBe(true)
    expect(addonLoader.hasActiveAddon('test-universal-addon')).toBe(true)
  })

  it('deve carregar com sucesso qualquer addon quando executando em ambiente E2E (PLAYWRIGHT_TEST=1)', async () => {
    const originalEnv = process.env.PLAYWRIGHT_TEST
    process.env.PLAYWRIGHT_TEST = '1'

    try {
      const manifestContent = `
id: test-future-addon-in-e2e
name: Future Addon In E2E
version: 1.0.0
requiredApiVersion: '>=0.9.0'
`
      writeFileSync(join(testAddonDir, 'manifest.yaml'), manifestContent)

      const loaded = await addonLoader.loadAndActivateFromDisk(
        'test-future-addon-in-e2e',
        testAddonDir,
      )

      expect(loaded).toBe(true)
      expect(addonLoader.hasActiveAddon('test-future-addon-in-e2e')).toBe(true)
    } finally {
      if (originalEnv === undefined) {
        delete process.env.PLAYWRIGHT_TEST
      } else {
        process.env.PLAYWRIGHT_TEST = originalEnv
      }
    }
  })
})
