import fs from 'fs'
import path from 'path'

import { AddonConfig } from '../AddonConfig'
import {
  AddonCategory,
  AddonPackage,
  AddonScreenshot,
  AddonTier,
} from '../contracts/manifest'
import { readPackageJson } from '../utils/packageJsonData'
import { readYaml, writeYaml } from '../utils/yaml'

export interface SyncManifestOptions {
  repo?: string
  branch?: string
}

function extractRepo(addonDir: string): string {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY.trim()
  }
  const pkg = readPackageJson(addonDir)
  if (pkg.repository?.url) {
    const match = pkg.repository.url.match(/github\.com[/:]([^/.]+\/[^/.]+)/)
    if (match && match[1]) return match[1].replace(/\.git$/, '')
  }
  return 'mr-tick-community/plugin'
}

function resolveRepo(optionRepo: string | undefined, rootDir: string): string {
  if (optionRepo) {
    const trimmed = optionRepo.trim()
    if (trimmed.length > 0) return trimmed
  }
  return extractRepo(rootDir)
}

function resolveBranch(optionBranch: string | undefined): string {
  if (optionBranch) {
    const trimmed = optionBranch.trim()
    if (trimmed.length > 0) return trimmed
  }
  return 'main'
}

function resolveStringField(
  primary: string | undefined,
  secondary: string | undefined,
  fallbackValue: string,
): string {
  if (primary) {
    const trimmed = primary.trim()
    if (trimmed.length > 0) return trimmed
  }
  if (secondary) {
    const trimmed = secondary.trim()
    if (trimmed.length > 0) return trimmed
  }
  return fallbackValue
}

function resolveCategories(manifest: AddonConfig): AddonCategory[] {
  if (manifest.categories && manifest.categories.length > 0)
    return manifest.categories
  if (manifest.Categories && manifest.Categories.length > 0)
    return manifest.Categories
  return ['dataSource']
}

function resolveTags(manifest: AddonConfig): string[] {
  if (manifest.tags && manifest.tags.length > 0) return manifest.tags
  if (manifest.Tags && manifest.Tags.length > 0) return manifest.Tags
  return ['mr-tick']
}

function resolveTier(manifest: AddonConfig): AddonTier | undefined {
  if (manifest.tier === 'plus' || manifest.tier === 'free') return manifest.tier
  if (manifest.Tier === 'plus' || manifest.Tier === 'free') return manifest.Tier
  return undefined
}

function cloneStringArray(items: string[] | undefined): string[] | undefined {
  if (!items) return undefined
  return [...items]
}

function clonePackages(
  packages: AddonPackage[] | undefined,
): AddonPackage[] | undefined {
  if (!packages) return undefined
  return packages.map((item) => {
    const cloned: AddonPackage = {
      version: item.version,
      downloadUrl: item.downloadUrl,
    }
    if (item.requiredApiVersion)
      cloned.requiredApiVersion = item.requiredApiVersion
    if (item.releaseDate) cloned.releaseDate = item.releaseDate
    if (item.sha256) cloned.sha256 = item.sha256
    if (item.size !== undefined && Number.isFinite(item.size)) {
      cloned.size = item.size
    }
    if (item.changelog) cloned.changelog = [...item.changelog]
    return cloned
  })
}

export function syncManifest(
  addonDir = '.',
  options?: SyncManifestOptions,
): boolean {
  const rootDir = path.resolve(addonDir)
  const manifestPath = path.join(rootDir, 'manifest.yaml')

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ manifest.yaml não encontrado em: ${rootDir}`)
    return false
  }

  const repo = resolveRepo(options?.repo, rootDir)
  const branch = resolveBranch(options?.branch)
  const existingManifest = readYaml<AddonConfig>(manifestPath)
  const pkg = readPackageJson(rootDir)

  const screenshotsDir = path.join(rootDir, 'screenshots')
  const screenshots: AddonScreenshot[] = []

  if (fs.existsSync(screenshotsDir)) {
    const files = fs.readdirSync(screenshotsDir)
    const imageFiles = files
      .filter((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f))
      .sort()

    for (const file of imageFiles) {
      const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/screenshots/${file}`
      const nameWithoutExt = file.replace(/\.[^/.]+$/, '')
      const cleanName = nameWithoutExt
        .replace(/^[0-9]+[-_.]*/, '')
        .replace(/[-_]/g, ' ')
      const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
      let caption = 'Screenshot'
      if (capitalized.trim().length > 0) {
        caption = capitalized
      }
      screenshots.push({ url: rawUrl, caption })
    }
  }

  let defaultIconUrl = `https://raw.githubusercontent.com/${repo}/${branch}/src/icon.png`
  if (fs.existsSync(path.join(rootDir, 'icon.png'))) {
    defaultIconUrl = `https://raw.githubusercontent.com/${repo}/${branch}/icon.png`
  }

  const changelog = cloneStringArray(existingManifest.changelog)
  const packages = clonePackages(existingManifest.packages)
  const version = resolveStringField(
    pkg.version,
    existingManifest.version,
    resolveStringField(existingManifest.Version, undefined, '0.1.0'),
  )
  const tier = resolveTier(existingManifest)

  const cleanManifest: AddonConfig = {
    id: resolveStringField(
      existingManifest.id,
      existingManifest.AddonId,
      'plugin',
    ),
    name: resolveStringField(
      existingManifest.name,
      existingManifest.Name,
      'Plugin',
    ),
    version,
    categories: resolveCategories(existingManifest),
    author: resolveStringField(
      existingManifest.author,
      existingManifest.Author,
      'Author',
    ),
    shortDescription: resolveStringField(
      existingManifest.shortDescription,
      existingManifest.ShortDescription,
      '',
    ),
    description: resolveStringField(
      existingManifest.description,
      existingManifest.Description,
      '',
    ),
    iconUrl: resolveStringField(
      existingManifest.iconUrl,
      existingManifest.IconUrl,
      defaultIconUrl,
    ),
    sourceUrl: resolveStringField(
      existingManifest.sourceUrl,
      existingManifest.SourceUrl,
      `https://github.com/${repo}`,
    ),
    homepage: resolveStringField(
      existingManifest.homepage,
      existingManifest.Homepage,
      `https://github.com/${repo}#readme`,
    ),
    tags: resolveTags(existingManifest),
  }

  if (tier) {
    cleanManifest.tier = tier
  }

  if (screenshots.length > 0) {
    cleanManifest.screenshots = screenshots
  }
  if (screenshots.length === 0 && existingManifest.screenshots) {
    cleanManifest.screenshots = existingManifest.screenshots
  }

  if (existingManifest.downloadUrl) {
    cleanManifest.downloadUrl = existingManifest.downloadUrl
  }
  if (existingManifest.sha256) {
    cleanManifest.sha256 = existingManifest.sha256
  }
  if (
    existingManifest.size !== undefined &&
    Number.isFinite(existingManifest.size)
  ) {
    cleanManifest.size = existingManifest.size
  }
  if (existingManifest.requiredApiVersion) {
    cleanManifest.requiredApiVersion = existingManifest.requiredApiVersion
  }
  if (existingManifest.releaseDate) {
    cleanManifest.releaseDate = existingManifest.releaseDate
  }
  if (changelog) {
    cleanManifest.changelog = changelog
  }
  if (packages) {
    cleanManifest.packages = packages
  }

  writeYaml(manifestPath, cleanManifest)
  console.log('✅ manifest.yaml sincronizado e formatado com sucesso!')
  return true
}
