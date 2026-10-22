import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { AddonConfig } from '../AddonConfig'
import { ADDON_CATALOG_RECEIPT_FILE } from '../contracts/manifest'
import { readYaml } from '../utils/yaml'
import { collectAddonPackageFiles } from '../utils/zip'
import { readCatalogSigningEnvironment } from './catalogSigning'
import { buildAddon } from './pkg'

const envelopeSchema = z.object({
  manifestBase64Url: z.string(),
  signatureBase64Url: z.string(),
  signedToken: z.string(),
})
const inventorySchema = z.strictObject({
  formatVersion: z.literal(2),
  keyId: z.string(),
  addonId: z.string(),
  version: z.string(),
  sdkVersionRange: z.string(),
  classification: z.enum(['free', 'plus']),
  publishedAt: z.number(),
  files: z.array(z.object({ path: z.string(), sha256: z.string() })),
})

function createAddon(tier: 'free' | 'plus' | undefined): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-tick-test-pkg-'))
  fs.mkdirSync(path.join(directory, 'dist', 'chunks'), { recursive: true })
  fs.mkdirSync(path.join(directory, 'dist', 'assets'), { recursive: true })
  fs.writeFileSync(
    path.join(directory, 'dist', 'index.js'),
    'export default {}',
  )
  fs.writeFileSync(
    path.join(directory, 'dist', 'chunks', 'worker.js'),
    'export const worker = true',
  )
  fs.writeFileSync(
    path.join(directory, 'dist', 'assets', 'theme.css'),
    'body { color: teal }',
  )
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: '@mr-tick/discord-addon',
      version: '0.1.0',
      main: 'dist/index.js',
    }),
  )
  const lines = [
    'id: mistertick-discord',
    'name: Discord Presence',
    'version: 0.1.0',
    'capabilities:',
    '  - watcher',
    'author: Mister Tick',
    'shortDescription: Discord IPC',
    'description: Discord IPC integration',
  ]
  if (tier !== undefined) lines.push(`tier: ${tier}`)
  fs.writeFileSync(path.join(directory, 'manifest.yaml'), lines.join('\n'))
  return directory
}
function cleanupAddon(directory: string): void {
  const absolute = path.resolve(directory)
  if (
    path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
    !path.basename(absolute).startsWith('mr-tick-test-pkg-')
  )
    throw new Error('SDK_TEST_CLEANUP_PATH_INVALID')
  fs.rmSync(absolute, { recursive: true, force: true })
}
function signingFixture() {
  const keys = crypto.generateKeyPairSync('ed25519')
  return {
    keys,
    signing: {
      privateKeyJwk: keys.privateKey.export({ format: 'jwk' }),
      keyId: 'catalog-test-key',
      publishedAt: 1_800_000_000_000,
    },
  }
}

describe('buildAddon (mr-tick pkg)', () => {
  it('calcula sha256/size reais e preserva layout dist e metadados Plus', () => {
    const directory = createAddon('plus')
    try {
      const result = buildAddon(directory, {
        apiVersion: '0.8.0',
        tier: 'plus',
      })
      expect(result.sha256).toBe(
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(result.outFile))
          .digest('hex'),
      )
      expect(result.size).toBe(fs.statSync(result.outFile).size)
      expect(result.downloadUrl).toBe(
        'https://mistertick-api.mistertick.workers.dev/catalog/plus-addons/mistertick-discord/versions/0.1.0/download',
      )
      const zip = new AdmZip(result.outFile)
      expect(zip.getEntry('dist/index.js')).not.toBeNull()
      expect(zip.getEntry('dist/chunks/worker.js')).not.toBeNull()
      expect(zip.getEntry('dist/assets/theme.css')).not.toBeNull()
      expect(zip.getEntry('index.js')).toBeNull()
      expect(zip.getEntry(ADDON_CATALOG_RECEIPT_FILE)).toBeNull()
      const updated = readYaml<AddonConfig>(
        path.join(directory, 'manifest.yaml'),
      )
      expect(updated.main).toBe('dist/index.js')
      expect(updated.tier).toBe('plus')
      expect(updated.sha256).toBe(result.sha256)
      expect(updated.size).toBe(result.size)
      expect(
        updated.packages?.find((item) => item.version === result.version)
          ?.sha256,
      ).toBe(result.sha256)
    } finally {
      cleanupAddon(directory)
    }
  })

  it.each(['free', 'plus'])(
    'assina inventário embedded e recibo detached para %s',
    (tier) => {
      if (tier !== 'free' && tier !== 'plus')
        throw new Error('SDK_FIXTURE_CLASSIFICATION_INVALID')
      const directory = createAddon(tier)
      try {
        const { keys, signing } = signingFixture()
        const result = buildAddon(directory, {
          apiVersion: '0.8.0',
          tier,
          signing,
        })
        const zip = new AdmZip(result.outFile)
        const receipt = zip.getEntry(ADDON_CATALOG_RECEIPT_FILE)
        if (!receipt) throw new Error('SDK_FIXTURE_RECEIPT_MISSING')
        const signed = envelopeSchema.parse(
          JSON.parse(receipt.getData().toString('utf8')),
        )
        expect(signed.signedToken).toBe(
          `${signed.manifestBase64Url}.${signed.signatureBase64Url}`,
        )
        expect(
          crypto.verify(
            null,
            Buffer.from(signed.manifestBase64Url, 'utf8'),
            keys.publicKey,
            Buffer.from(signed.signatureBase64Url, 'base64url'),
          ),
        ).toBe(true)
        const payload = inventorySchema.parse(
          JSON.parse(
            Buffer.from(signed.manifestBase64Url, 'base64url').toString('utf8'),
          ),
        )
        expect(payload).not.toHaveProperty('packageSha256')
        expect(payload).toMatchObject({
          formatVersion: 2,
          keyId: signing.keyId,
          addonId: result.addonId,
          version: result.version,
          sdkVersionRange: '>=0.8.0',
          classification: tier,
          publishedAt: signing.publishedAt,
        })
        const packagedFiles = zip
          .getEntries()
          .filter(
            (entry) =>
              !entry.isDirectory &&
              entry.entryName !== ADDON_CATALOG_RECEIPT_FILE,
          )
        expect(payload.files.map((file) => file.path).sort()).toEqual(
          packagedFiles.map((entry) => entry.entryName).sort(),
        )
        for (const file of payload.files) {
          const entry = zip.getEntry(file.path)
          if (!entry) throw new Error('SDK_FIXTURE_INVENTORY_ENTRY_MISSING')
          expect(file.sha256).toBe(
            crypto.createHash('sha256').update(entry.getData()).digest('hex'),
          )
        }
        expect(
          payload.files.some((file) => file.path === 'manifest.yaml'),
        ).toBe(true)
        expect(payload.files.some((file) => file.path === 'package.json')).toBe(
          true,
        )
        if (!result.catalogManifestFile)
          throw new Error('SDK_FIXTURE_DETACHED_RECEIPT_MISSING')
        const detached = envelopeSchema.parse(
          JSON.parse(fs.readFileSync(result.catalogManifestFile, 'utf8')),
        )
        expect(
          crypto.verify(
            null,
            Buffer.from(detached.manifestBase64Url, 'utf8'),
            keys.publicKey,
            Buffer.from(detached.signatureBase64Url, 'base64url'),
          ),
        ).toBe(true)
        expect(
          JSON.parse(
            Buffer.from(detached.manifestBase64Url, 'base64url').toString(
              'utf8',
            ),
          ),
        ).toMatchObject({
          formatVersion: 1,
          packageSha256: result.sha256,
          files: payload.files,
          classification: tier,
        })
      } finally {
        cleanupAddon(directory)
      }
    },
  )

  it('rejeita assinatura sem classificação explícita e chave inválida', () => {
    const directory = createAddon(undefined)
    try {
      const { signing } = signingFixture()
      expect(() =>
        buildAddon(directory, { apiVersion: '0.8.0', signing }),
      ).toThrow('SIGNED_ADDON_CLASSIFICATION_REQUIRED')
      expect(() =>
        buildAddon(directory, {
          apiVersion: '0.8.0',
          tier: 'free',
          signing: { privateKeyJwk: {}, keyId: 'invalid-key' },
        }),
      ).toThrow('CATALOG_SIGNING_KEY_INVALID')
    } finally {
      cleanupAddon(directory)
    }
  })

  it('rejeita containers de segredos e JWK privada disfarçada em JSON', () => {
    const directory = createAddon('free')
    try {
      const { signing } = signingFixture()
      const secret = path.join(directory, 'dist', '.env')
      fs.writeFileSync(secret, 'PRIVATE_TOKEN=do-not-package')
      expect(() =>
        buildAddon(directory, { apiVersion: '0.8.0', signing }),
      ).toThrow('ADDON_PACKAGE_SECRET_FILE_FORBIDDEN')
      fs.unlinkSync(secret)
      fs.writeFileSync(
        path.join(directory, 'dist', 'configuration.json'),
        JSON.stringify(signing.privateKeyJwk),
      )
      expect(() =>
        buildAddon(directory, { apiVersion: '0.8.0', signing }),
      ).toThrow('ADDON_PACKAGE_SECRET_FILE_FORBIDDEN')
    } finally {
      cleanupAddon(directory)
    }
  })

  it('rejeita junctions/symlinks em dist e caminhos fora da raiz', () => {
    const directory = createAddon('free')
    const target = createAddon('free')
    const link = path.join(directory, 'dist', 'external')
    try {
      fs.symlinkSync(target, link, 'junction')
      expect(() => buildAddon(directory, { apiVersion: '0.8.0' })).toThrow(
        'ADDON_PACKAGE_SYMLINK_FORBIDDEN',
      )
      expect(() =>
        collectAddonPackageFiles(
          [path.join(target, 'manifest.yaml')],
          directory,
        ),
      ).toThrow('ADDON_PACKAGE_PATH_OUTSIDE_ROOT')
    } finally {
      if (fs.existsSync(link)) fs.unlinkSync(link)
      cleanupAddon(directory)
      cleanupAddon(target)
    }
  })

  it('lê configuração de signing somente quando par de env é completo e válido', () => {
    const { signing } = signingFixture()
    expect(readCatalogSigningEnvironment({})).toBeUndefined()
    expect(() =>
      readCatalogSigningEnvironment({ MR_TICK_CATALOG_KEY_ID: signing.keyId }),
    ).toThrow('CATALOG_SIGNING_CONFIGURATION_INCOMPLETE')
    expect(() =>
      readCatalogSigningEnvironment({
        MR_TICK_CATALOG_SIGNING_KEY: 'not-json',
        MR_TICK_CATALOG_KEY_ID: signing.keyId,
      }),
    ).toThrow('CATALOG_SIGNING_KEY_INVALID')
    expect(
      readCatalogSigningEnvironment({
        MR_TICK_CATALOG_SIGNING_KEY: JSON.stringify(signing.privateKeyJwk),
        MR_TICK_CATALOG_KEY_ID: signing.keyId,
      }),
    ).toEqual({ privateKeyJwk: signing.privateKeyJwk, keyId: signing.keyId })
  })
})
