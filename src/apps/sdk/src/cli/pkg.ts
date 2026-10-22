import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { AddonConfig } from '../AddonConfig'
import {
  ADDON_CATALOG_RECEIPT_FILE,
  type AddonCatalogManifestV1,
  type AddonCatalogManifestV2,
  type AddonPackage,
  type AddonTier,
  type SignedAddonCatalogManifestV1,
} from '../contracts/manifest'
import { readPackageJson } from '../utils/packageJsonData'
import { readYaml, writeYaml } from '../utils/yaml'
import { collectAddonPackageFiles, packageAddon } from '../utils/zip'
import {
  type AddonCatalogSigningOptions,
  prepareCatalogSigning,
  signCatalogManifest,
} from './catalogSigning'
import { validateAddon } from './validate'

export interface BuildAddonOptions {
  signing?: AddonCatalogSigningOptions
  apiVersion: string
  downloadUrl?: string
  tier?: AddonTier
  changelog?: string[]
}

export interface BuildAddonResult {
  catalogManifestFile?: string
  outFile: string
  addonId: string
  version: string
  sha256: string
  size: number
  downloadUrl: string
  tier?: AddonTier
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_.]/g, '')
}

function resolveAddonId(manifest: AddonConfig): string {
  if (manifest.id) {
    const trimmed = manifest.id.trim()
    if (trimmed.length > 0) return trimmed
  }
  return 'plugin'
}

function resolveAddonVersion(
  pkgVersion: string | undefined,
  manifest: AddonConfig,
): string {
  if (pkgVersion) {
    const trimmed = pkgVersion.trim()
    if (trimmed.length > 0) return trimmed
  }
  if (manifest.version) {
    const trimmed = manifest.version.trim()
    if (trimmed.length > 0) return trimmed
  }
  return '0.1.0'
}

function resolveAddonTier(
  optionTier: AddonTier | undefined,
  manifest: AddonConfig,
): AddonTier | undefined {
  if (optionTier === 'plus' || optionTier === 'free') return optionTier
  if (manifest.tier === 'plus' || manifest.tier === 'free') return manifest.tier
  return undefined
}

function resolveDownloadUrl(
  optionDownloadUrl: string | undefined,
  manifest: AddonConfig,
  tier: AddonTier | undefined,
  addonId: string,
  version: string,
): string {
  if (optionDownloadUrl) {
    const trimmed = optionDownloadUrl.trim()
    if (trimmed.length > 0) return trimmed
  }
  if (tier === 'plus') {
    return `https://mistertick-api.mistertick.workers.dev/catalog/plus-addons/${addonId}/versions/${version}/download`
  }
  if (manifest.downloadUrl) {
    const trimmed = manifest.downloadUrl.trim()
    if (trimmed.length > 0) return trimmed
  }
  return ''
}

function resolveRequiredApiVersion(apiVersion: string): string {
  if (apiVersion.startsWith('>=')) return apiVersion
  return `>=${apiVersion}`
}

function resolveChangelog(
  optionChangelog: string[] | undefined,
  manifest: AddonConfig,
  version: string,
): string[] {
  if (optionChangelog && optionChangelog.length > 0) return optionChangelog
  if (manifest.changelog && manifest.changelog.length > 0)
    return manifest.changelog
  return [`Release ${version}`]
}

function filterExistingPackages(
  packages: AddonPackage[] | undefined,
  version: string,
): AddonPackage[] {
  if (!packages) return []
  return packages.filter((pkgItem) => pkgItem.version !== version)
}

export function buildAddon(
  addonDir: string,
  options: BuildAddonOptions,
): BuildAddonResult {
  const rootDir = path.resolve(addonDir)
  const manifestPath = path.join(rootDir, 'manifest.yaml')
  const packageJsonPath = path.join(rootDir, 'package.json')
  const distDir = path.join(rootDir, 'dist')

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Arquivo manifest.yaml não encontrado em: ${rootDir}`)
  }

  const validation = validateAddon(rootDir)
  if (!validation.valid) {
    console.error('❌ Erros de validação no manifesto:')
    validation.errors.forEach((e) => console.error(`   - ${e}`))
    throw new Error('Corrija os erros de validação antes de empacotar.')
  }

  if (!fs.existsSync(distDir)) {
    throw new Error(
      `Diretório dist/ não encontrado em: ${rootDir}. Execute o build do plugin primeiro.`,
    )
  }

  const manifest = readYaml<AddonConfig>(manifestPath)
  const pkg = readPackageJson(rootDir)

  const addonId = resolveAddonId(manifest)
  const version = resolveAddonVersion(pkg.version, manifest)
  const tier = resolveAddonTier(options.tier, manifest)
  if (options.signing && tier === undefined)
    throw new Error('SIGNED_ADDON_CLASSIFICATION_REQUIRED')
  let signing = undefined
  if (options.signing) {
    signing = prepareCatalogSigning(options.signing)
  }
  const knownEntryPaths = ['dist/index.js', 'dist/index.mjs', 'index.js']
  const main = knownEntryPaths.find((entry) => {
    const entryPath = path.join(rootDir, entry)
    if (!fs.existsSync(entryPath)) return false
    const stats = fs.lstatSync(entryPath)
    if (stats.isSymbolicLink())
      throw new Error('ADDON_PACKAGE_SYMLINK_FORBIDDEN')
    return stats.isFile()
  })
  if (!main) throw new Error('ADDON_PACKAGE_ENTRY_NOT_FOUND')

  const releaseDate = new Date().toISOString().slice(0, 10)
  const downloadUrl = resolveDownloadUrl(
    options.downloadUrl,
    manifest,
    tier,
    addonId,
    version,
  )
  const requiredApiVersion = resolveRequiredApiVersion(options.apiVersion)
  const changelog = resolveChangelog(options.changelog, manifest, version)
  const existingPackages = filterExistingPackages(manifest.packages, version)

  const prePackageEntry: AddonPackage = {
    version,
    requiredApiVersion,
    releaseDate,
    downloadUrl,
    changelog,
  }

  const preUpdatedManifest: AddonConfig = {
    ...manifest,
    id: addonId,
    main,
    version,
    downloadUrl,
    requiredApiVersion,
    releaseDate,
    changelog,
    packages: [prePackageEntry, ...existingPackages],
  }
  if (tier) {
    preUpdatedManifest.tier = tier
  }
  delete preUpdatedManifest.sha256
  delete preUpdatedManifest.size

  writeYaml(manifestPath, preUpdatedManifest)

  const outFile = path.join(
    rootDir,
    sanitizeFileName(`${addonId}-${version}.tladdon`),
  )

  const filesToInclude: string[] = [distDir]
  const optionalRootFiles = [
    manifestPath,
    packageJsonPath,
    path.join(rootDir, 'README.md'),
    path.join(rootDir, 'LICENSE'),
    path.join(rootDir, 'icon.png'),
    path.join(rootDir, 'icon.jpg'),
    path.join(rootDir, 'icon.svg'),
    path.join(rootDir, 'index.js'),
  ]

  for (const filePath of optionalRootFiles) {
    if (fs.existsSync(filePath)) {
      filesToInclude.push(filePath)
    }
  }

  const files = collectAddonPackageFiles(filesToInclude, rootDir)
  const inventory = files.map((file) => ({
    path: file.path,
    sha256: crypto.createHash('sha256').update(file.contents).digest('hex'),
  }))
  if (signing) {
    if (tier === undefined)
      throw new Error('SIGNED_ADDON_CLASSIFICATION_REQUIRED')
    const catalogManifest: AddonCatalogManifestV2 = {
      formatVersion: 2,
      keyId: signing.keyId,
      addonId,
      version,
      sdkVersionRange: requiredApiVersion,
      classification: tier,
      files: inventory,
      publishedAt: signing.publishedAt,
    }
    const signed = signCatalogManifest(catalogManifest, signing.privateKey)
    files.push({
      path: ADDON_CATALOG_RECEIPT_FILE,
      contents: Buffer.from(JSON.stringify(signed), 'utf8'),
    })
  }
  packageAddon(files, outFile)

  const archiveBuffer = fs.readFileSync(outFile)
  const sha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex')
  const size = archiveBuffer.byteLength
  let catalogManifestFile: string | undefined
  if (signing) {
    if (tier === undefined)
      throw new Error('SIGNED_ADDON_CLASSIFICATION_REQUIRED')
    const detachedManifest: AddonCatalogManifestV1 = {
      formatVersion: 1,
      keyId: signing.keyId,
      addonId,
      version,
      sdkVersionRange: requiredApiVersion,
      classification: tier,
      packageSha256: sha256,
      files: inventory,
      publishedAt: signing.publishedAt,
    }
    const detached: SignedAddonCatalogManifestV1 = {
      manifest: detachedManifest,
      ...signCatalogManifest(detachedManifest, signing.privateKey),
    }
    catalogManifestFile = `${outFile}.manifest.json`
    fs.writeFileSync(catalogManifestFile, JSON.stringify(detached), 'utf8')
  }

  const finalPackageEntry: AddonPackage = {
    version,
    requiredApiVersion,
    releaseDate,
    downloadUrl,
    sha256,
    size,
    changelog,
  }

  const finalManifest: AddonConfig = {
    ...preUpdatedManifest,
    sha256,
    size,
    packages: [finalPackageEntry, ...existingPackages],
  }

  writeYaml(manifestPath, finalManifest)

  console.log(`\n📦 Pacote gerado com sucesso: ${outFile}`)
  console.log(`🔒 SHA-256: ${sha256} (${size} bytes)`)
  console.log(`✅ Manifesto atualizado em: ${manifestPath}\n`)

  return {
    catalogManifestFile,
    outFile,
    addonId,
    version,
    sha256,
    size,
    downloadUrl,
    tier,
  }
}
