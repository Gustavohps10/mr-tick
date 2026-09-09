import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
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

function checkIsLinked(targetPath: string, expectedSource: string): boolean {
  if (!existsSync(targetPath)) {
    return false
  }
  try {
    const stat = lstatSync(targetPath)
    if (!stat.isSymbolicLink()) {
      return false
    }
    const target = readlinkSync(targetPath)
    return resolve(target) === resolve(expectedSource)
  } catch {
    return false
  }
}

export function scanDevAddons(): DevAddonInfo[] {
  if (!existsSync(devAddonsDir)) {
    return []
  }

  const addonsDir = resolveMrTickAddonsDir()
  const entries = readdirSync(devAddonsDir, { withFileTypes: true })
  const result: DevAddonInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const sourcePath = join(devAddonsDir, entry.name)
    const manifestPath = join(sourcePath, 'manifest.yaml')
    const manifest = parseManifest(manifestPath)

    const id = manifest.id || manifest.AddonId || entry.name
    const name = manifest.name || manifest.Name || entry.name
    const version = manifest.version || manifest.Version || '1.0.0'
    const category = manifest.category || manifest.Category || 'General'

    // O Mr-tick usa o id sanitizado ou nome da pasta como diretório destino
    const sanitizedFolderName = id.replace(/[/\\?%*:|"<>]/g, '_')
    const targetPath = join(addonsDir, sanitizedFolderName)
    const isLinked = checkIsLinked(targetPath, sourcePath)

    result.push({
      folderName: entry.name,
      sourcePath,
      id,
      name,
      version,
      category,
      isLinked,
      targetPath,
    })
  }

  return result
}

export function linkAddon(addon: DevAddonInfo): boolean {
  const addonsDir = resolveMrTickAddonsDir()
  if (!existsSync(addonsDir)) {
    mkdirSync(addonsDir, { recursive: true })
  }

  if (existsSync(addon.targetPath)) {
    const stat = lstatSync(addon.targetPath)
    if (stat.isSymbolicLink()) {
      unlinkSync(addon.targetPath)
    }
    if (!stat.isSymbolicLink()) {
      console.warn(
        `⚠️  O caminho destino ${addon.targetPath} já existe e não é um link simbólico. Pulando.`,
      )
      return false
    }
  }

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(addon.sourcePath, addon.targetPath, linkType)
  console.log(`🔗 Link criado com sucesso:`)
  console.log(`   De:   ${addon.sourcePath}`)
  console.log(`   Para: ${addon.targetPath}`)
  return true
}

export function unlinkAddon(addon: DevAddonInfo): boolean {
  if (!existsSync(addon.targetPath)) {
    console.log(`ℹ️  Addon ${addon.name} (${addon.id}) não está linkado.`)
    return false
  }

  const stat = lstatSync(addon.targetPath)
  if (stat.isSymbolicLink()) {
    if (process.platform === 'win32') {
      try {
        rmdirSync(addon.targetPath)
      } catch {
        unlinkSync(addon.targetPath)
      }
    }
    if (process.platform !== 'win32') {
      unlinkSync(addon.targetPath)
    }
    console.log(`🧹 Link removido: ${addon.targetPath}`)
    return true
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
    `${'STATUS'.padEnd(10)} | ${'NOME'.padEnd(25)} | ${'ID'.padEnd(30)} | ${'PASTA'.padEnd(22)}`,
  )
  console.log('-'.repeat(95))

  for (const addon of addons) {
    const statusText = addon.isLinked ? '✅ LINKED' : '❌ UNLINKED'
    console.log(
      `${statusText.padEnd(10)} | ${addon.name.padEnd(25)} | ${addon.id.padEnd(30)} | ${addon.folderName.padEnd(22)}`,
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
      ? addons
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

    try {
      await buildWithTsup({
        entry: [entryFile],
        outDir,
        format: ['esm', 'cjs'],
        sourcemap: true,
        watch,
        clean: false,
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
