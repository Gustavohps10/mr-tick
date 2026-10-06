import { AppError, Either } from '@mr-tick/shared/helpers'
import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  IAddonReloader,
  IAddonsFacade,
  IFileManager,
  IFileStorage,
} from '@/contracts'
import type { AddonManifestDTO } from '@/dtos'

import { UpdateAddonService } from './UpdateAddonService'

describe('UpdateAddonService', () => {
  let sut: UpdateAddonService

  let fileStorageMock: Mocked<IFileStorage>
  let fileManagerMock: Mocked<IFileManager>
  let addonsFacadeMock: Mocked<IAddonsFacade>
  let addonReloaderMock: Mocked<IAddonReloader>

  const existingManifest: AddonManifestDTO = {
    id: 'mr-tick-datasource-redmine',
    name: 'Redmine Integration',
    version: '0.7.0',
    creator: 'Community',
    description: 'Plugin Redmine v0.7.0',
    path: './addons/mr-tick-datasource-redmine/0.7.0',
    logo: '',
    downloads: 10,
    stars: 5,
    installed: true,
  }

  const updatedManifest: AddonManifestDTO = {
    id: 'mr-tick-datasource-redmine',
    name: 'Redmine Integration',
    version: '0.8.0',
    creator: 'Community',
    description: 'Plugin Redmine v0.8.0',
    path: '',
    logo: '',
    downloads: 100,
    stars: 5,
    installed: false,
    requiredApiVersion: '>=0.8.0',
  }

  const fakeExtractedFiles = [
    {
      name: 'manifest.yaml',
      content: Buffer.from('id: mr-tick-datasource-redmine\nversion: 0.8.0'),
    },
    {
      name: 'index.js',
      content: Buffer.from('console.log("v0.8.0")'),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    fileStorageMock = {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(undefined),
      getPublicUrl: vi.fn(),
    }

    fileManagerMock = {
      zip: vi.fn(),
      unzipInMemory: vi.fn().mockResolvedValue(fakeExtractedFiles),
      getMimeType: vi.fn(),
    }

    addonsFacadeMock = {
      listAvailable: vi.fn(),
      listInstalled: vi.fn(),
      getInstalledById: vi.fn().mockImplementation(async (addonId, version) =>
        Either.success(
          version
            ? {
                ...updatedManifest,
                installed: true,
                path: 'C:/isolated-user-data/addons/mr-tick-datasource-redmine/0.8.0',
              }
            : existingManifest,
        ),
      ),
      getInstaller: vi.fn(),
      parseManifest: vi.fn().mockResolvedValue(Either.success(updatedManifest)),
      parseInstaller: vi.fn(),
      downloadFile: vi
        .fn()
        .mockResolvedValue(Either.success(new Uint8Array([1, 2, 3]))),
      uninstallAddon: vi.fn().mockResolvedValue(Either.success()),
      checkUpdates: vi.fn(),
      backupAddon: vi
        .fn()
        .mockResolvedValue(
          Either.success('./addons/mr-tick-datasource-redmine/0.7.0.backup'),
        ),
      restoreAddonBackup: vi.fn().mockResolvedValue(Either.success()),
      removeAddonBackup: vi.fn().mockResolvedValue(Either.success()),
    }

    addonReloaderMock = {
      getHostSdkVersion: vi.fn().mockReturnValue('0.8.4'),
      deactivateAddon: vi.fn().mockResolvedValue(undefined),
      loadAndActivateFromDisk: vi.fn().mockResolvedValue(true),
    }

    sut = new UpdateAddonService(
      fileStorageMock,
      fileManagerMock,
      addonsFacadeMock,
      addonReloaderMock,
    )
  })

  it('deve atualizar com sucesso, desativando versão antiga, gravando novos arquivos, ativando nova versão e limpando backup', async () => {
    const result = await sut.execute({
      addonId: 'mr-tick-datasource-redmine',
      downloadUrl: 'https://example.com/redmine-0.8.0.tladdon',
    })

    expect(result.isSuccess()).toBe(true)
    expect(addonsFacadeMock.getInstalledById).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
    )
    expect(addonsFacadeMock.downloadFile).toHaveBeenCalledWith(
      'https://example.com/redmine-0.8.0.tladdon',
      expect.any(Function),
    )
    expect(addonReloaderMock.deactivateAddon).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
    )
    expect(addonsFacadeMock.backupAddon).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
      '0.7.0',
    )
    expect(fileStorageMock.write).toHaveBeenCalledWith(
      './addons/mr-tick-datasource-redmine/0.8.0/manifest.yaml',
      fakeExtractedFiles[0].content,
    )
    expect(fileStorageMock.write).toHaveBeenCalledWith(
      './addons/mr-tick-datasource-redmine/0.8.0/index.js',
      fakeExtractedFiles[1].content,
    )
    expect(addonReloaderMock.loadAndActivateFromDisk).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
      'C:/isolated-user-data/addons/mr-tick-datasource-redmine/0.8.0',
    )
    expect(addonsFacadeMock.removeAddonBackup).toHaveBeenCalledWith(
      './addons/mr-tick-datasource-redmine/0.7.0.backup',
    )
    expect(addonsFacadeMock.uninstallAddon).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
      '0.7.0',
    )
  })

  it('deve realizar rollback atômico restaurando backup e reativando versão antiga se a ativação da nova versão falhar', async () => {
    addonReloaderMock.loadAndActivateFromDisk
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const result = await sut.execute({
      addonId: 'mr-tick-datasource-redmine',
      downloadUrl: 'https://example.com/redmine-0.8.0.tladdon',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('FALHA_AO_ATIVAR_NOVA_VERSAO')
    expect(addonsFacadeMock.restoreAddonBackup).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
      './addons/mr-tick-datasource-redmine/0.7.0.backup',
    )
    expect(addonReloaderMock.loadAndActivateFromDisk).toHaveBeenCalledWith(
      'mr-tick-datasource-redmine',
      './addons/mr-tick-datasource-redmine/0.7.0',
    )
    expect(addonsFacadeMock.removeAddonBackup).toHaveBeenCalledWith(
      './addons/mr-tick-datasource-redmine/0.7.0.backup',
    )
  })

  it('não deve desativar ou tocar no addon caso a versão seja incompatível com o host SDK', async () => {
    addonsFacadeMock.parseManifest.mockResolvedValue(
      Either.success({
        ...updatedManifest,
        requiredApiVersion: '>=2.0.0',
      }),
    )

    const result = await sut.execute({
      addonId: 'mr-tick-datasource-redmine',
      downloadUrl: 'https://example.com/redmine-0.8.0.tladdon',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('VERSAO_INCOMPATIVEL_COM_HOST')
    expect(addonReloaderMock.deactivateAddon).not.toHaveBeenCalled()
    expect(addonsFacadeMock.backupAddon).not.toHaveBeenCalled()
    expect(fileStorageMock.write).not.toHaveBeenCalled()
  })

  it('deve falhar se o addon não estiver instalado', async () => {
    addonsFacadeMock.getInstalledById.mockResolvedValue(
      Either.failure(AppError.NotFound('LOCAL_ADDON_NOT_FOUND')),
    )

    const result = await sut.execute({
      addonId: 'mr-tick-datasource-redmine',
      downloadUrl: 'https://example.com/redmine-0.8.0.tladdon',
    })

    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('ADDON_NAO_INSTALADO')
    expect(addonsFacadeMock.downloadFile).not.toHaveBeenCalled()
  })
  it('activates the absolute path discovered from the written addon manifest, not a cwd-relative path', async () => {
    addonsFacadeMock.getInstalledById
      .mockResolvedValueOnce(Either.success(existingManifest))
      .mockResolvedValueOnce(
        Either.success({
          ...updatedManifest,
          installed: true,
          path: 'C:/isolated-user-data/addons/mr-tick-datasource-redmine/0.8.0',
        }),
      )
    const result = await sut.execute({
      addonId: existingManifest.id,
      downloadUrl: 'https://example.com/update.tladdon',
    })
    expect(result.isSuccess()).toBe(true)
    expect(addonReloaderMock.loadAndActivateFromDisk).toHaveBeenCalledWith(
      existingManifest.id,
      'C:/isolated-user-data/addons/mr-tick-datasource-redmine/0.8.0',
    )
  })

  it('preserves the backup when restoring the previous version fails', async () => {
    addonReloaderMock.loadAndActivateFromDisk.mockResolvedValueOnce(false)
    addonsFacadeMock.restoreAddonBackup.mockResolvedValue(
      Either.failure(AppError.Internal('RESTORE_FAILED')),
    )
    const result = await sut.execute({
      addonId: existingManifest.id,
      downloadUrl: 'https://example.com/update.zip',
    })
    expect(result.isFailure()).toBe(true)
    expect(result.failure.messageKey).toBe('RESTORE_FAILED')
    expect(addonsFacadeMock.removeAddonBackup).not.toHaveBeenCalled()
  })

  it.each(['0.7.0', '0.6.0'])(
    'rejects equal or older version %s before deactivation',
    async (version) => {
      addonsFacadeMock.parseManifest.mockResolvedValue(
        Either.success({ ...updatedManifest, version }),
      )
      const result = await sut.execute({
        addonId: existingManifest.id,
        downloadUrl: 'https://example.com/update.zip',
      })
      expect(result.isFailure()).toBe(true)
      expect(addonReloaderMock.deactivateAddon).not.toHaveBeenCalled()
      expect(fileStorageMock.write).not.toHaveBeenCalled()
    },
  )

  it('rejects archive traversal before writing or deactivating', async () => {
    fileManagerMock.unzipInMemory.mockResolvedValue([
      ...fakeExtractedFiles,
      { name: '../outside.js', content: Buffer.from('bad') },
    ])
    const result = await sut.execute({
      addonId: existingManifest.id,
      downloadUrl: 'https://example.com/update.zip',
    })
    expect(result.isFailure()).toBe(true)
    expect(fileStorageMock.write).not.toHaveBeenCalled()
    expect(addonReloaderMock.deactivateAddon).not.toHaveBeenCalled()
  })
})
