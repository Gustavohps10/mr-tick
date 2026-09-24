import fs from 'fs'
import path from 'path'

import { AddonPackage, IAddonManifest } from '../contracts/manifest'
import { readYaml, writeYaml } from '../utils/yaml'
import { packageAddon } from '../utils/zip'
import { validateAddon } from './validate'

export interface BuildAddonOptions {
  apiVersion: string
  downloadUrl?: string
  changelog?: string[]
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9-_.]/g, '')
}

export function buildAddon(addonDir: string, options: BuildAddonOptions) {
  const rootDir = path.resolve(addonDir)
  const manifestPath = path.join(rootDir, 'manifest.yaml')
  const packageJsonPath = path.join(rootDir, 'package.json')
  const distDir = path.join(rootDir, 'dist')

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Arquivo manifest.yaml não encontrado em: ${rootDir}`)
  }

  // Validação prévia
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

  const manifest = readYaml(manifestPath) as Partial<IAddonManifest> & {
    AddonId?: string
    Name?: string
    Version?: string
  }

  const addonId = (manifest.id || manifest.AddonId || 'plugin').trim()
  const version = (manifest.version || manifest.Version || '0.1.0').trim()
  const releaseDate = new Date().toISOString().split('T')[0]
  const downloadUrl = (options.downloadUrl || manifest.downloadUrl || '').trim()
  const changelog =
    options.changelog && options.changelog.length > 0
      ? options.changelog
      : manifest.changelog || [`Release ${version}`]

  const newPackage: AddonPackage = {
    version,
    requiredApiVersion: options.apiVersion.startsWith('>=')
      ? options.apiVersion
      : `>=${options.apiVersion}`,
    releaseDate,
    downloadUrl,
    changelog,
  }

  const existingPackages: AddonPackage[] = (manifest.packages || []).filter(
    (p) => p.version !== version,
  )
  const updatedPackages = [newPackage, ...existingPackages]

  // Atualiza o manifesto unificado
  const updatedManifest: Record<string, unknown> = {
    ...manifest,
    id: addonId,
    version,
    downloadUrl,
    requiredApiVersion: newPackage.requiredApiVersion,
    releaseDate,
    changelog,
    packages: updatedPackages,
  }

  // Remove campos legados se existirem
  delete updatedManifest.AddonId
  delete updatedManifest.Version
  delete updatedManifest.Name

  writeYaml(manifestPath, updatedManifest)

  const outFile = path.join(
    rootDir,
    sanitizeFileName(`${addonId}-${version}.tladdon`),
  )

  const filesToInclude: string[] = []

  // Inclui todos os arquivos da pasta dist
  const distFiles = fs.readdirSync(distDir)
  for (const file of distFiles) {
    filesToInclude.push(path.join(distDir, file))
  }

  // Inclui arquivos principais da raiz
  const optionalRootFiles = [
    manifestPath,
    packageJsonPath,
    path.join(rootDir, 'README.md'),
    path.join(rootDir, 'LICENSE'),
    path.join(rootDir, 'icon.png'),
    path.join(rootDir, 'icon.jpg'),
    path.join(rootDir, 'icon.svg'),
  ]

  for (const filePath of optionalRootFiles) {
    if (fs.existsSync(filePath)) {
      filesToInclude.push(filePath)
    }
  }

  packageAddon(filesToInclude, outFile)

  console.log(`\n📦 Pacote gerado com sucesso: ${outFile}`)
  console.log(`✅ Manifesto atualizado em: ${manifestPath}`)
  console.log('\nPróximos passos para publicação:')
  console.log(
    `  1. Crie uma Release no seu repositório GitHub (tag: v${version}).`,
  )
  console.log(`  2. Anexe o arquivo "${path.basename(outFile)}" na Release.`)
  console.log(
    `  3. Abra um Pull Request no repositório "addons-manifest" adicionando o arquivo "addons/${addonId}.yaml".\n`,
  )
}
