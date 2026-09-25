import fs from 'fs'
import path from 'path'

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
    if (match) return match[1].replace(/\.git$/, '')
  }
  return 'mr-tick-community/plugin'
}

export function syncManifest(addonDir = '.', options?: SyncManifestOptions) {
  const rootDir = path.resolve(addonDir)
  const manifestPath = path.join(rootDir, 'manifest.yaml')

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ manifest.yaml não encontrado em: ${rootDir}`)
    return false
  }

  const repo = options?.repo || extractRepo(rootDir)
  const branch = options?.branch || 'main'
  const existingManifest = readYaml<Record<string, any>>(manifestPath) || {}
  const pkg = readPackageJson(rootDir)

  // 1. Scan /screenshots directory
  const screenshotsDir = path.join(rootDir, 'screenshots')
  const screenshots: Array<{ url: string; caption: string }> = []

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
      const caption = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)

      screenshots.push({ url: rawUrl, caption: caption || 'Screenshot' })
    }
  }

  // 2. Icon URL
  let iconUrl = `https://raw.githubusercontent.com/${repo}/${branch}/src/icon.png`
  if (fs.existsSync(path.join(rootDir, 'icon.png'))) {
    iconUrl = `https://raw.githubusercontent.com/${repo}/${branch}/icon.png`
  }

  // Clone packages & changelog deeply to break any object reference sharing (&ref_0)
  const changelog = existingManifest.changelog
    ? JSON.parse(JSON.stringify(existingManifest.changelog))
    : undefined
  const packages = existingManifest.packages
    ? JSON.parse(JSON.stringify(existingManifest.packages))
    : undefined

  const version = (
    pkg.version ||
    existingManifest.version ||
    existingManifest.Version ||
    '0.1.0'
  ).trim()

  // 3. Mount Clean Manifest in standard order
  const cleanManifest: Record<string, any> = {
    id: existingManifest.id || existingManifest.AddonId || 'plugin',
    name: existingManifest.name || existingManifest.Name || 'Plugin',
    version,
    categories: existingManifest.categories ||
      existingManifest.Categories || ['dataSource'],
    author: existingManifest.author || existingManifest.Author || 'Author',
    shortDescription:
      existingManifest.shortDescription ||
      existingManifest.ShortDescription ||
      '',
    description:
      existingManifest.description || existingManifest.Description || '',
    iconUrl: existingManifest.iconUrl || iconUrl,
    sourceUrl: existingManifest.sourceUrl || `https://github.com/${repo}`,
    homepage: existingManifest.homepage || `https://github.com/${repo}#readme`,
    tags: existingManifest.tags || existingManifest.Tags || ['mr-tick'],
  }

  if (screenshots.length > 0) {
    cleanManifest.screenshots = screenshots
  } else if (existingManifest.screenshots) {
    cleanManifest.screenshots = existingManifest.screenshots
  }

  if (existingManifest.downloadUrl) {
    cleanManifest.downloadUrl = existingManifest.downloadUrl
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
