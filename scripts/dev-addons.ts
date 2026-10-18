import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import yaml from 'js-yaml'
import { build as buildWithTsup } from 'tsup'

interface ManifestData {
  id?: string
  AddonId?: string
  name?: string
  Name?: string
  version?: string
  Version?: string
  categories?: string[]
  Categories?: string[]
  category?: string
  Category?: string
  description?: string
  Description?: string
}

interface DevAddonInfo {
  folderName: string
  sourcePath: string
  id: string
  name: string
  version: string
  category: string
  isLinked: boolean
  targetPath: string
}

const currentFilePath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(currentFilePath), '..')
const devAddonsDir = join(repoRoot, 'src', 'dev-addons')
const localSdkPath = join(repoRoot, 'src', 'apps', 'sdk')
const parentContextDir = resolve(repoRoot, '..')

interface ExtendedDevAddonInfo extends DevAddonInfo {
  isExternalRepo: boolean
  isSdkLinked: boolean
}

export function resolveMrTickAddonsDir(): string {
  const customPath = process.env.MR_TICK_ADDONS_PATH
  if (customPath) {
    return resolve(customPath)
  }

  const platform = process.platform
  if (platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      return join(appData, 'mr-tick', 'addons')
    }
    return join(homedir(), 'AppData', 'Roaming', 'mr-tick', 'addons')
  }

  if (platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'mr-tick',
      'addons',
    )
  }

  return join(homedir(), '.config', 'mr-tick', 'addons')
}

function parseManifest(filePath: string): ManifestData {
  if (!existsSync(filePath)) {
    return {}
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = yaml.load(content)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed
    }
    return {}
  } catch {
    return {}
  }
}

function checkIsLinked(
  targetPath: string,
  expectedSource: string,
  version?: string,
): boolean {
  if (!existsSync(targetPath)) {
    return false
  }
  try {
    const stat = lstatSync(targetPath)
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(targetPath)
      return (
        resolve(target).toLowerCase() === resolve(expectedSource).toLowerCase()
      )
    }
    if (stat.isDirectory() && version) {
      const versionPath = join(targetPath, version)
      if (existsSync(versionPath)) {
        const vStat = lstatSync(versionPath)
        if (vStat.isSymbolicLink()) {
          const vTarget = readlinkSync(versionPath)
          return (
            resolve(vTarget).toLowerCase() ===
            resolve(expectedSource).toLowerCase()
          )
        }
      }
    }
    return false
  } catch {
    return false
  }
}

function checkIsSdkLinked(addonSourcePath: string): boolean {
  const addonSdkNodeModules = join(
    addonSourcePath,
    'node_modules',
    '@mr-tick',
    'sdk',
  )
  if (!existsSync(addonSdkNodeModules)) return false
  try {
    const stat = lstatSync(addonSdkNodeModules)
    if (!stat.isSymbolicLink()) return false
    const target = readlinkSync(addonSdkNodeModules)
    return resolve(target).toLowerCase() === resolve(localSdkPath).toLowerCase()
  } catch {
    return false
  }
}

function linkLocalSdkToAddon(addonSourcePath: string): void {
  const mrTickScopeDir = join(addonSourcePath, 'node_modules', '@mr-tick')
  if (!existsSync(mrTickScopeDir)) return

  const sdkTarget = join(mrTickScopeDir, 'sdk')
  const sdkBackup = join(mrTickScopeDir, '.sdk-npm-backup')

  try {
    if (existsSync(sdkTarget)) {
      const stat = lstatSync(sdkTarget)
      if (stat.isSymbolicLink()) {
        removeSymbolicLink(sdkTarget)
      } else {
        if (!existsSync(sdkBackup)) {
          renameSync(sdkTarget, sdkBackup)
        } else {
          rmSync(sdkTarget, { recursive: true, force: true })
        }
      }
    }

    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    symlinkSync(localSdkPath, sdkTarget, linkType)
    console.log(`   🔗 SDK Local vinculado em: ${sdkTarget}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`   ⚠️ Não foi possível vincular SDK local: ${message}`)
  }
}

function unlinkLocalSdkFromAddon(addonSourcePath: string): void {
  const mrTickScopeDir = join(addonSourcePath, 'node_modules', '@mr-tick')
  if (!existsSync(mrTickScopeDir)) return

  const sdkTarget = join(mrTickScopeDir, 'sdk')
  const sdkBackup = join(mrTickScopeDir, '.sdk-npm-backup')

  try {
    if (existsSync(sdkTarget)) {
      const stat = lstatSync(sdkTarget)
      if (stat.isSymbolicLink()) {
        removeSymbolicLink(sdkTarget)
        console.log(`   🧹 Link do SDK local removido de: ${sdkTarget}`)
      }
    }

    if (!existsSync(sdkTarget) && existsSync(sdkBackup)) {
      renameSync(sdkBackup, sdkTarget)
      console.log(`   📦 SDK do NPM restaurado em: ${sdkTarget}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`   ⚠️ Erro ao restaurar SDK em ${sdkTarget}: ${message}`)
  }
}

function removeSymbolicLink(targetPath: string): void {
  if (process.platform === 'win32') {
    try {
      rmdirSync(targetPath)
      return
    } catch {
      unlinkSync(targetPath)
      return
    }
  }
  unlinkSync(targetPath)
}

function getPackageVersion(packageJsonPath: string): string | null {
  if (!existsSync(packageJsonPath)) return null
  try {
    const raw = readFileSync(packageJsonPath, 'utf-8')
    const match = raw.match(/"version"\s*:\s*"([^"]+)"/)
    if (match && match[1]) return match[1].trim()
    return null
  } catch {
    return null
  }
}

function getMonorepoSdkVersion(): string | null {
  const sdkPkgPath = join(repoRoot, 'src', 'apps', 'sdk', 'package.json')
  return getPackageVersion(sdkPkgPath)
}

export function syncDevAddonManifest(sourcePath: string): void {
  const manifestPath = join(sourcePath, 'manifest.yaml')
  if (!existsSync(manifestPath)) return

  const pkgJsonPath = join(sourcePath, 'package.json')
  const addonVersion = getPackageVersion(pkgJsonPath)
  const sdkVersion = getMonorepoSdkVersion()

  if (!sdkVersion && !addonVersion) return

  try {
    const content = readFileSync(manifestPath, 'utf-8')
    let updatedContent = content

    if (addonVersion) {
      updatedContent = updatedContent.replace(
        /(version:\s*)['"]?[^'"\r\n]+['"]?/,
        `$1${addonVersion}`,
      )
    }

    const hasUniversalApiVersion =
      /(?:requiredApiVersion|RequiredApiVersion)\s*:\s*['"]?(-1|\*)['"]?/.test(
        content,
      )

    if (sdkVersion && !hasUniversalApiVersion) {
      updatedContent = updatedContent.replace(
        /(requiredApiVersion:\s*)['"]?[^'"\r\n]+['"]?/,
        `$1'>=${sdkVersion}'`,
      )
    }

    if (updatedContent === content) return

    writeFileSync(manifestPath, updatedContent, 'utf-8')
    console.log(
      `🔄 Manifesto sincronizado automaticamente em ${manifestPath} (version: ${addonVersion}, requiredApiVersion: >=${sdkVersion})`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `⚠️ Não foi possível sincronizar o manifesto de ${sourcePath}:`,
      message,
    )
  }
}

function buildAddonInfoFromPath(
  folderName: string,
  sourcePath: string,
  addonsDir: string,
  isExternalRepo: boolean,
): ExtendedDevAddonInfo | null {
  const manifestPath = join(sourcePath, 'manifest.yaml')
  if (!existsSync(manifestPath)) return null

  if (!isExternalRepo) {
    syncDevAddonManifest(sourcePath)
  }

  const manifest = parseManifest(manifestPath)
  const id = manifest.id || manifest.AddonId || folderName
  const name = manifest.name || manifest.Name || folderName
  const version = manifest.version || manifest.Version || '1.0.0'
  const rawCategories =
    manifest.categories ||
    manifest.Categories ||
    (manifest.category || manifest.Category
      ? [manifest.category || manifest.Category]
      : [])
  const category =
    Array.isArray(rawCategories) && rawCategories.length > 0
      ? rawCategories.join(', ')
      : 'General'

  const sanitizedFolderName = id.replace(/[/\\?%*:|"<>]/g, '_')
  const targetPath = join(addonsDir, sanitizedFolderName)
  const isLinked = checkIsLinked(targetPath, sourcePath, version)
  const isSdkLinked = isExternalRepo ? checkIsSdkLinked(sourcePath) : true

  return {
    folderName,
    sourcePath,
    id,
    name,
    version,
    category,
    isLinked,
    targetPath,
    isExternalRepo,
    isSdkLinked,
  }
}

export function scanDevAddons(): ExtendedDevAddonInfo[] {
  const addonsDir = resolveMrTickAddonsDir()
  const result: ExtendedDevAddonInfo[] = []

  if (existsSync(devAddonsDir)) {
    const entries = readdirSync(devAddonsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourcePath = join(devAddonsDir, entry.name)
      const info = buildAddonInfoFromPath(
        entry.name,
        sourcePath,
        addonsDir,
        false,
      )
      if (info) result.push(info)
    }
  }

  if (existsSync(parentContextDir)) {
    const siblingEntries = readdirSync(parentContextDir, {
      withFileTypes: true,
    })
    for (const entry of siblingEntries) {
      if (!entry.isDirectory()) continue
      const candidatePath = resolve(parentContextDir, entry.name)
      if (candidatePath.toLowerCase() === repoRoot.toLowerCase()) continue

      const pkgPath = join(candidatePath, 'package.json')
      const manifestPath = join(candidatePath, 'manifest.yaml')
      if (!existsSync(pkgPath) || !existsSync(manifestPath)) continue

      const info = buildAddonInfoFromPath(
        entry.name,
        candidatePath,
        addonsDir,
        true,
      )
      if (info) result.push(info)
    }
  }

  return result
}

export function linkAddon(addon: ExtendedDevAddonInfo): boolean {
  const addonsDir = resolveMrTickAddonsDir()
  if (!existsSync(addonsDir)) {
    mkdirSync(addonsDir, { recursive: true })
  }

  if (addon.isExternalRepo) {
    linkLocalSdkToAddon(addon.sourcePath)
  }

  const sanitizedFolderName = addon.id.replace(/[/\\?%*:|"<>]/g, '_')
  const catalogBackupDir = join(
    dirname(addonsDir),
    'addons-catalog-backup',
    sanitizedFolderName,
  )

  if (existsSync(addon.targetPath)) {
    const stat = lstatSync(addon.targetPath)
    if (stat.isSymbolicLink()) {
      removeSymbolicLink(addon.targetPath)
    } else if (stat.isDirectory()) {
      const subEntries = readdirSync(addon.targetPath)
      for (const sub of subEntries) {
        const subFull = join(addon.targetPath, sub)
        const subStat = lstatSync(subFull)
        if (subStat.isSymbolicLink()) {
          removeSymbolicLink(subFull)
        }
      }
      const remaining = readdirSync(addon.targetPath)
      if (remaining.length === 0) {
        rmdirSync(addon.targetPath)
      } else {
        mkdirSync(dirname(catalogBackupDir), { recursive: true })
        if (existsSync(catalogBackupDir)) {
          rmSync(catalogBackupDir, { recursive: true, force: true })
        }
        renameSync(addon.targetPath, catalogBackupDir)
        console.log(
          `   📦 Instalação do catálogo movida temporariamente para backup: ${catalogBackupDir}`,
        )
      }
    }
  }

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(addon.sourcePath, addon.targetPath, linkType)
  console.log(`🔗 Addon vinculado com sucesso:`)
  console.log(`   De:   ${addon.sourcePath}`)
  console.log(`   Para: ${addon.targetPath}`)
  return true
}

export function unlinkAddon(addon: ExtendedDevAddonInfo): boolean {
  if (addon.isExternalRepo) {
    unlinkLocalSdkFromAddon(addon.sourcePath)
  }

  const addonsDir = resolveMrTickAddonsDir()
  const sanitizedFolderName = addon.id.replace(/[/\\?%*:|"<>]/g, '_')
  const catalogBackupDir = join(
    dirname(addonsDir),
    'addons-catalog-backup',
    sanitizedFolderName,
  )

  if (!existsSync(addon.targetPath)) {
    if (existsSync(catalogBackupDir)) {
      renameSync(catalogBackupDir, addon.targetPath)
      console.log(
        `   📦 Instalação do catálogo restaurada em: ${addon.targetPath}`,
      )
      return true
    }
    console.log(
      `ℹ️  Addon ${addon.name} (${addon.id}) não está linkado em ${addon.targetPath}.`,
    )
    return false
  }

  const stat = lstatSync(addon.targetPath)
  if (stat.isSymbolicLink()) {
    removeSymbolicLink(addon.targetPath)
    console.log(`🧹 Link removido: ${addon.targetPath}`)
    if (existsSync(catalogBackupDir)) {
      renameSync(catalogBackupDir, addon.targetPath)
      console.log(
        `   📦 Instalação do catálogo restaurada em: ${addon.targetPath}`,
      )
    }
    return true
  }

  if (stat.isDirectory()) {
    let removedSubLink = false
    const subEntries = readdirSync(addon.targetPath)
    for (const sub of subEntries) {
      const subFull = join(addon.targetPath, sub)
      const subStat = lstatSync(subFull)
      if (subStat.isSymbolicLink()) {
        removeSymbolicLink(subFull)
        console.log(`🧹 Link de versão removido: ${subFull}`)
        removedSubLink = true
      }
    }
    if (removedSubLink && readdirSync(addon.targetPath).length === 0) {
      rmdirSync(addon.targetPath)
    }
    if (removedSubLink) return true
  }

  console.warn(
    `⚠️  O caminho destino ${addon.targetPath} não é um link simbólico. Remoção ignorada por segurança.`,
  )
  return false
}

export function listAddons(): void {
  const addons = scanDevAddons()
  const targetDir = resolveMrTickAddonsDir()

  console.log('\n========================================================')
  console.log('📦 Mr-tick Dev Addons Manager')
  console.log('========================================================')
  console.log(`📍 Diretório Dev:    ${devAddonsDir}`)
  console.log(`🎯 Destino Mr-tick:  ${targetDir}\n`)

  if (addons.length === 0) {
    console.log('Nenhum addon de desenvolvimento encontrado em src/dev-addons.')
    return
  }

  console.log(
    `${'STATUS'.padEnd(11)} | ${'SDK'.padEnd(11)} | ${'NOME'.padEnd(25)} | ${'ID'.padEnd(28)} | ${'PASTA'.padEnd(22)}`,
  )
  console.log('-'.repeat(108))

  for (const addon of addons) {
    const statusText = addon.isLinked ? '✅ LINKED' : '❌ UNLINKED'
    const sdkText = addon.isExternalRepo
      ? addon.isSdkLinked
        ? '🔗 LOCAL'
        : '📦 NPM'
      : '🏠 MONOREPO'
    const folderLabel = addon.isExternalRepo
      ? `../${addon.folderName}`
      : addon.folderName
    console.log(
      `${statusText.padEnd(11)} | ${sdkText.padEnd(11)} | ${addon.name.padEnd(25)} | ${addon.id.padEnd(28)} | ${folderLabel.padEnd(22)}`,
    )
  }

  console.log('\n💡 Comandos disponíveis:')
  console.log(
    '   yarn addon:link [nome]    - Cria link simbólico para um addon ou todos (all)',
  )
  console.log('   yarn addon:unlink [nome]  - Remove link simbólico')
  console.log('   yarn addon:build [nome]   - Compila com sourcemaps')
  console.log(
    '   yarn addon:watch [nome]   - Monitora alterações em tempo real\n',
  )
}

export async function runBuild(
  addonFolderName?: string,
  watch = false,
): Promise<void> {
  const addons = scanDevAddons()
  const selectedAddons =
    !addonFolderName || addonFolderName === 'all'
      ? addons.filter((a) => !a.isExternalRepo || a.isLinked)
      : addons.filter(
          (a) =>
            a.folderName === addonFolderName ||
            a.id === addonFolderName ||
            a.name.toLowerCase() === addonFolderName.toLowerCase(),
        )

  if (selectedAddons.length === 0) {
    console.error(`❌ Addon "${addonFolderName}" não encontrado.`)
    return
  }

  for (const addon of selectedAddons) {
    const entryFile = join(addon.sourcePath, 'src', 'index.ts').replace(
      /\\/g,
      '/',
    )
    const outDir = join(addon.sourcePath, 'dist').replace(/\\/g, '/')

    if (!existsSync(entryFile)) {
      console.warn(
        `⚠️  Entrada src/index.ts não encontrada em: ${addon.sourcePath}`,
      )
      continue
    }

    console.log(`🔨 Compilando [${addon.name}] programaticamente...`)

    const addonTsConfig = join(addon.sourcePath, 'tsconfig.json')
    const hasAddonTsConfig = existsSync(addonTsConfig)

    try {
      await buildWithTsup({
        entry: [entryFile],
        outDir,
        format: ['esm', 'cjs'],
        sourcemap: true,
        watch,
        clean: false,
        platform: 'node',
        shims: true,
        external: ['@mr-tick/sdk', 'electron', 'axios'],
        ...(hasAddonTsConfig ? { tsconfig: addonTsConfig } : {}),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`❌ Erro ao compilar ${addon.name}:`, message)
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const action = args[0] || 'list'
  const targetName = args[1]

  if (action === 'list') {
    listAddons()
    return
  }

  if (action === 'link') {
    const addons = scanDevAddons()
    const targetAddons =
      !targetName || targetName === 'all'
        ? addons.filter((a) => !a.isExternalRepo)
        : addons.filter(
            (a) =>
              a.folderName === targetName ||
              a.id === targetName ||
              a.name.toLowerCase() === targetName.toLowerCase(),
          )

    if (targetAddons.length === 0) {
      console.error(
        `❌ Nenhum addon correspondente a "${targetName}" encontrado.`,
      )
      return
    }

    for (const addon of targetAddons) {
      linkAddon(addon)
    }
    return
  }

  if (action === 'unlink') {
    const addons = scanDevAddons()
    const targetAddons =
      !targetName || targetName === 'all'
        ? addons
        : addons.filter(
            (a) =>
              a.folderName === targetName ||
              a.id === targetName ||
              a.name.toLowerCase() === targetName.toLowerCase(),
          )

    if (targetAddons.length === 0) {
      console.error(
        `❌ Nenhum addon correspondente a "${targetName}" encontrado.`,
      )
      return
    }

    for (const addon of targetAddons) {
      unlinkAddon(addon)
    }
    return
  }

  if (action === 'build') {
    await runBuild(targetName, false)
    return
  }

  if (action === 'watch') {
    await runBuild(targetName, true)
    return
  }

  console.log(`Comando desconhecido: ${action}`)
  listAddons()
}

void main()
