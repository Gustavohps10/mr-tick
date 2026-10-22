import fs from 'fs'
import inquirer from 'inquirer'
import path from 'path'

import { AddonConfig } from '../AddonConfig'
import {
  AddonCapability,
  AddonScreenshot,
  VALID_ADDON_CAPABILITIES,
} from '../contracts/manifest'
import { readPackageJson } from '../utils/packageJsonData'
import { readYaml, writeYaml } from '../utils/yaml'

function sanitizeAddonId(addonId: string) {
  return addonId.replace(/[^a-zA-Z0-9-_@/]/g, '')
}

export async function runManifestWizard(addonDir: string) {
  const rootDir = path.resolve(addonDir)
  const manifestPath = path.join(rootDir, 'manifest.yaml')
  const existingManifest: AddonConfig = fs.existsSync(manifestPath)
    ? readYaml(manifestPath)
    : {}

  const pkg = readPackageJson(rootDir)

  let defaultId = path.basename(rootDir)
  if (pkg.sanitizedName) defaultId = pkg.sanitizedName
  if (existingManifest.id) defaultId = existingManifest.id
  let defaultName = path.basename(rootDir)
  if (pkg.name) defaultName = pkg.name
  if (existingManifest.name) defaultName = existingManifest.name
  let defaultVersion = '0.1.0'
  if (pkg.version) defaultVersion = pkg.version
  if (existingManifest.version) defaultVersion = existingManifest.version
  let defaultAuthor = 'Mr-tick Community'
  if (pkg.author) defaultAuthor = pkg.author
  if (existingManifest.author) defaultAuthor = existingManifest.author
  let defaultShortDesc = pkg.description
  if (existingManifest.shortDescription)
    defaultShortDesc = existingManifest.shortDescription
  let defaultDesc = pkg.description
  if (existingManifest.description) defaultDesc = existingManifest.description
  let defaultTags = ['mr-tick']
  if (existingManifest.tags) defaultTags = existingManifest.tags
  let defaultSourceUrl = pkg.defaultSourceUrl
  if (existingManifest.sourceUrl) defaultSourceUrl = existingManifest.sourceUrl

  let existingCapabilities: AddonCapability[] = []
  if (existingManifest.capabilities)
    existingCapabilities = existingManifest.capabilities

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'id',
      message: 'ID do plugin:',
      default: defaultId,
      filter: sanitizeAddonId,
      validate: (input: string) =>
        input.trim().length > 0 ? true : 'ID não pode ser vazio.',
    },
    {
      type: 'input',
      name: 'name',
      message: 'Nome legível do plugin:',
      default: defaultName,
    },
    {
      type: 'input',
      name: 'version',
      message: 'Versão (SemVer):',
      default: defaultVersion,
    },
    {
      type: 'checkbox',
      name: 'capabilities',
      message: 'Capacidades do plugin:',
      choices: VALID_ADDON_CAPABILITIES.map((cat) => ({
        name: cat,
        value: cat,
        checked: existingCapabilities.includes(cat),
      })),
      validate: (choices: string[]) =>
        choices.length > 0
          ? true
          : 'Selecione pelo menos uma capacidade oficial.',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Autor:',
      default: defaultAuthor,
    },
    {
      type: 'input',
      name: 'shortDescription',
      message: 'Descrição curta (1 linha):',
      default: defaultShortDesc,
    },
    {
      type: 'input',
      name: 'description',
      message: 'Descrição completa:',
      default: defaultDesc,
    },
    {
      type: 'input',
      name: 'tags',
      message: 'Tags (separadas por vírgula):',
      default: defaultTags.join(', '),
      filter: (input: string) =>
        input
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
    },
    {
      type: 'input',
      name: 'iconUrl',
      message: 'URL do ícone/logo (opcional):',
      default: existingManifest.iconUrl,
    },
    {
      type: 'input',
      name: 'sourceUrl',
      message: 'URL do repositório/código fonte (opcional):',
      default: defaultSourceUrl,
    },
    {
      type: 'input',
      name: 'homepage',
      message: 'URL da documentação/homepage (opcional):',
      default: existingManifest.homepage,
    },
    {
      type: 'confirm',
      name: 'configureScreenshots',
      message: 'Deseja adicionar ou editar screenshots/prints para a loja?',
      default: false,
    },
  ])

  let screenshots: AddonScreenshot[] = existingManifest.screenshots || []

  if (answers.configureScreenshots) {
    let adding = true
    while (adding) {
      const screenPrompt = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'URL pública da imagem/screenshot:',
          validate: (input: string) =>
            input.trim().length > 0 ? true : 'URL não pode ser vazia.',
        },
        {
          type: 'input',
          name: 'caption',
          message: 'Legenda explicativa do print:',
          default: '',
        },
        {
          type: 'confirm',
          name: 'addMore',
          message: 'Deseja adicionar mais uma screenshot?',
          default: false,
        },
      ])

      screenshots.push({
        url: screenPrompt.url.trim(),
        ...(screenPrompt.caption.trim()
          ? { caption: screenPrompt.caption.trim() }
          : {}),
      })
      adding = screenPrompt.addMore
    }
  }

  const cleanManifest: Record<string, unknown> = {
    id: answers.id,
    name: answers.name,
    version: answers.version,
    capabilities: answers.capabilities,
    author: answers.author,
    shortDescription: answers.shortDescription,
    description: answers.description,
  }

  if (answers.tags && answers.tags.length > 0) {
    cleanManifest.tags = answers.tags
  }
  if (answers.iconUrl && answers.iconUrl.trim()) {
    cleanManifest.iconUrl = answers.iconUrl.trim()
  }
  if (answers.sourceUrl && answers.sourceUrl.trim()) {
    cleanManifest.sourceUrl = answers.sourceUrl.trim()
  }
  if (answers.homepage && answers.homepage.trim()) {
    cleanManifest.homepage = answers.homepage.trim()
  }
  if (screenshots.length > 0) {
    cleanManifest.screenshots = screenshots
  }

  // Preserve existing distribution/package fields if present
  if (existingManifest.downloadUrl) {
    cleanManifest.downloadUrl = existingManifest.downloadUrl
  }
  if (existingManifest.requiredApiVersion) {
    cleanManifest.requiredApiVersion = existingManifest.requiredApiVersion
  }
  if (existingManifest.releaseDate) {
    cleanManifest.releaseDate = existingManifest.releaseDate
  }
  if (existingManifest.changelog) {
    cleanManifest.changelog = existingManifest.changelog
  }
  if (existingManifest.packages) {
    cleanManifest.packages = existingManifest.packages
  }

  writeYaml(manifestPath, cleanManifest)
  console.log(`\n✅ Manifesto atualizado com sucesso em: ${manifestPath}\n`)
}
