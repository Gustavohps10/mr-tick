import { ILicensingFacade } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import axios from 'axios'
import crypto from 'crypto'
import { describe, expect, it, vi } from 'vitest'

import { HardDiskStorage } from '../tools/HardDiskStorage'
import { AddonsFacade } from './AddonsFacade'

vi.mock('axios')

function createMockLicensingFacade(): ILicensingFacade {
  return {
    getStatus: vi.fn().mockResolvedValue(
      Either.success({
        state: 'active',
        tier: 'plus',
        isPlusActive: true,
        entitlements: ['plus_addons', 'plus_updates'],
      }),
    ),
    activateLicense: vi.fn(),
    refreshLicense: vi.fn(),
    deactivateLicense: vi.fn(),
    downloadPlusPackage: vi.fn().mockImplementation(async () => {
      const bytes = new Uint8Array([80, 75, 3, 4])
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      return Either.success({ bytes, sha256 })
    }),
  }
}

describe('AddonsFacade', () => {
  it('should parse unified manifest YAML correctly including tier, sha256 and size', async () => {
    const facade = new AddonsFacade(
      new HardDiskStorage('./storage'),
      createMockLicensingFacade(),
    )
    const yamlContent = `
id: mistertick-discord
name: Discord Integration
version: 0.1.0
tier: plus
sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
size: 4096
categories:
  - watcher
author: Mr. Tick Official
shortDescription: Integração com Discord
description: Plugin oficial Plus do Discord
iconUrl: https://example.com/icon.png
sourceUrl: https://github.com/mistertick/discord-addon
screenshots:
  - url: https://example.com/screen1.png
    caption: Tela 1
downloadUrl: https://mistertick-api.mistertick.workers.dev/catalog/plus-addons/mistertick-discord/versions/0.1.0/download
requiredApiVersion: '>=0.8.0'
releaseDate: '2026-10-12'
changelog:
  - Suporte ao Discord
`
    const result = await facade.parseManifest(yamlContent)

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.id).toBe('mistertick-discord')
      expect(result.success.tier).toBe('plus')
      expect(result.success.sha256).toBe(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      )
      expect(result.success.size).toBe(4096)
      expect(result.success.categories).toEqual(['watcher'])
      expect(result.success.screenshots).toHaveLength(1)
      expect(result.success.screenshots?.[0].caption).toBe('Tela 1')
    }
  })

  it('should route Plus catalog download URLs through licensingFacade and verify SHA-256', async () => {
    const licensingFacade = createMockLicensingFacade()
    const facade = new AddonsFacade(
      new HardDiskStorage('./storage'),
      licensingFacade,
    )

    const result = await facade.downloadFile(
      'https://mistertick-api.mistertick.workers.dev/catalog/plus-addons/mistertick-discord/versions/0.1.0/download',
    )

    expect(result.isSuccess()).toBe(true)
    expect(licensingFacade.downloadPlusPackage).toHaveBeenCalledWith(
      'mistertick-discord',
      '0.1.0',
    )

    const badShaResult = await facade.downloadFile(
      'https://mistertick-api.mistertick.workers.dev/catalog/plus-addons/mistertick-discord/versions/0.1.0/download',
      undefined,
      'f'.repeat(64),
    )
    expect(badShaResult.isFailure()).toBe(true)
    expect(badShaResult.failure).toBeInstanceOf(AppError)
    expect(badShaResult.failure.messageKey).toBe(
      'INTEGRIDADE_SHA256_ADDON_INVALIDA',
    )
  })

  it('should maintain backward compatibility with legacy PascalCase manifests', async () => {
    const facade = new AddonsFacade(
      new HardDiskStorage('./storage'),
      createMockLicensingFacade(),
    )
    const legacyYaml = `
AddonId: mr-tick-legacy
Name: Legacy Addon
Version: 0.9.0
Author: Legacy Dev
Description: Legacy description
Category: DataSources
IconUrl: https://example.com/legacy.png
`
    const result = await facade.parseManifest(legacyYaml)

    expect(result.isSuccess()).toBe(true)
    if (result.isSuccess()) {
      expect(result.success.id).toBe('mr-tick-legacy')
      expect(result.success.name).toBe('Legacy Addon')
      expect(result.success.version).toBe('0.9.0')
      expect(result.success.creator).toBe('Legacy Dev')
      expect(result.success.category).toBe('DataSources')
      expect(result.success.logo).toBe('https://example.com/legacy.png')
    }
  })

  it('should fetch available addons in a single HTTP request without N+1', async () => {
    const facade = new AddonsFacade(
      new HardDiskStorage('./storage'),
      createMockLicensingFacade(),
    )
    const mockConsolidatedCatalog = [
      {
        id: 'mr-tick-datasource-redmine',
        name: 'Redmine',
        version: '1.0.0',
        categories: ['dataSource'],
        author: 'Community',
        description: 'Redmine plugin',
        downloadUrl: 'https://example.com/redmine.tladdon',
      },
      {
        id: 'mr-tick-watcher-discord',
        name: 'Discord Presence',
        version: '1.0.0',
        categories: ['watcher'],
        author: 'Mr-tick',
        description: 'Discord watcher',
        downloadUrl: 'https://example.com/discord.tladdon',
      },
    ]

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: mockConsolidatedCatalog,
    })

    const result = await facade.listAvailable()

    expect(result.isSuccess()).toBe(true)
    expect(axios.get).toHaveBeenCalledTimes(1)
    if (result.isSuccess()) {
      expect(result.success).toHaveLength(2)
      expect(result.success[0].id).toBe('mr-tick-datasource-redmine')
      expect(result.success[0].downloadUrl).toBe(
        'https://example.com/redmine.tladdon',
      )
      expect(result.success[1].id).toBe('mr-tick-watcher-discord')
    }
  })

  describe('checkUpdates', () => {
    it('should mark updateAvailable: true when remote version is higher and compatible with host', () => {
      const facade = new AddonsFacade(
        new HardDiskStorage('./storage'),
        createMockLicensingFacade(),
      )
      const installed = [
        {
          id: 'mr-tick-datasource-redmine',
          name: 'Redmine',
          version: '0.7.0',
          categories: ['dataSource'],
          creator: 'Community',
          description: 'Plugin Redmine',
          downloadUrl: 'https://example.com/redmine-0.7.0.tladdon',
          installed: true,
          path: '/addons/mr-tick-datasource-redmine/0.7.0',
          logo: '',
          downloads: 10,
          stars: 5,
        },
      ]

      const available = [
        {
          id: 'mr-tick-datasource-redmine',
          name: 'Redmine',
          version: '0.8.0',
          requiredApiVersion: '>=0.8.0',
          categories: ['dataSource'],
          creator: 'Community',
          description: 'Plugin Redmine v0.8.0',
          downloadUrl: 'https://example.com/redmine-0.8.0.tladdon',
          installed: false,
          path: '',
          logo: '',
          downloads: 100,
          stars: 5,
          changelog: ['Suporte a novo motor de sync'],
        },
      ]

      const result = facade.checkUpdates(installed, available, '0.8.4')

      expect(result).toHaveLength(1)
      expect(result[0].updateAvailable).toBe(true)
      expect(result[0].latestVersion).toBe('0.8.0')
      expect(result[0].downloadUrl).toBe(
        'https://example.com/redmine-0.8.0.tladdon',
      )
      expect(result[0].changelog).toEqual(['Suporte a novo motor de sync'])
    })

    it('should mark incompatibleUpdate: true when remote version requires newer host SDK', () => {
      const facade = new AddonsFacade(
        new HardDiskStorage('./storage'),
        createMockLicensingFacade(),
      )
      const installed = [
        {
          id: 'mr-tick-datasource-redmine',
          name: 'Redmine',
          version: '0.7.0',
          categories: ['dataSource'],
          creator: 'Community',
          description: 'Plugin Redmine',
          downloadUrl: 'https://example.com/redmine-0.7.0.tladdon',
          installed: true,
          path: '/addons/mr-tick-datasource-redmine/0.7.0',
          logo: '',
          downloads: 10,
          stars: 5,
        },
      ]

      const available = [
        {
          id: 'mr-tick-datasource-redmine',
          name: 'Redmine',
          version: '1.0.0',
          requiredApiVersion: '>=2.0.0',
          categories: ['dataSource'],
          creator: 'Community',
          description: 'Plugin Redmine 2.0',
          downloadUrl: 'https://example.com/redmine-1.0.0.tladdon',
          installed: false,
          path: '',
          logo: '',
          downloads: 100,
          stars: 5,
        },
      ]

      const result = facade.checkUpdates(installed, available, '1.0.0')

      expect(result).toHaveLength(1)
      expect(result[0].updateAvailable).toBe(false)
      expect(result[0].incompatibleUpdate).toBe(true)
      expect(result[0].incompatibleReason).toContain('>=2.0.0')
    })
  })

  describe('backupAddon, restoreAddonBackup and removeAddonBackup', () => {
    it('deve ter os métodos backupAddon, restoreAddonBackup e removeAddonBackup definidos na facade', () => {
      const facade = new AddonsFacade(
        new HardDiskStorage('./storage'),
        createMockLicensingFacade(),
      )
      expect(typeof facade.backupAddon).toBe('function')
      expect(typeof facade.restoreAddonBackup).toBe('function')
      expect(typeof facade.removeAddonBackup).toBe('function')
    })
  })
})
