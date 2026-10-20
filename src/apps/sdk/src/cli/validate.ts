import fs from 'fs'
import path from 'path'

import { AddonConfig } from '../AddonConfig'
import {
  VALID_ADDON_CATEGORIES,
  VALID_ADDON_TIERS,
} from '../contracts/manifest'
import { readYaml } from '../utils/yaml'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function resolveOptionalString(
  primary: string | undefined,
  secondary: string | undefined,
): string | undefined {
  if (primary && primary.trim().length > 0) {
    return primary.trim()
  }
  if (secondary && secondary.trim().length > 0) {
    return secondary.trim()
  }
  return undefined
}

function extractCategories(manifest: AddonConfig): string[] {
  if (Array.isArray(manifest.categories)) {
    return manifest.categories.map((item) => String(item))
  }
  if (Array.isArray(manifest.Categories)) {
    return manifest.Categories.map((item) => String(item))
  }
  const single = resolveOptionalString(manifest.category, manifest.Category)
  if (single) return [single]
  return []
}

function validateSha256Field(
  sha256: string | undefined,
  label: string,
  errors: string[],
): void {
  if (sha256 === undefined) return
  if (!/^[a-f0-9]{64}$/i.test(String(sha256))) {
    errors.push(
      `Campo "${label}" inválido. Deve ser um hash SHA-256 hexadecimal de 64 caracteres.`,
    )
  }
}

function validateSizeField(
  size: number | undefined,
  label: string,
  errors: string[],
): void {
  if (size === undefined) return
  if (!Number.isInteger(size) || size <= 0) {
    errors.push(`Campo "${label}" inválido. Deve ser um inteiro positivo.`)
  }
}

function validateCapabilities(
  rawCapabilities: unknown,
  errors: string[],
): void {
  if (rawCapabilities === undefined || rawCapabilities === null) return
  if (!Array.isArray(rawCapabilities)) {
    errors.push('Campo "capabilities" deve ser um array.')
    return
  }
  const seenCapabilityIds = new Set<string>()
  let dataSourceCount = 0

  for (let i = 0; i < rawCapabilities.length; i++) {
    const cap = rawCapabilities[i]
    if (!cap || typeof cap !== 'object') {
      errors.push(`capabilities[${i}] deve ser um objeto válido.`)
      continue
    }
    const capId =
      'capabilityId' in cap && typeof cap.capabilityId === 'string'
        ? cap.capabilityId.trim()
        : ''
    if (!capId) {
      errors.push(`capabilities[${i}].capabilityId é obrigatório.`)
      continue
    }
    if (seenCapabilityIds.has(capId)) {
      errors.push(`ID de capacidade duplicado: "${capId}".`)
    }
    seenCapabilityIds.add(capId)

    const kind = 'kind' in cap && typeof cap.kind === 'string' ? cap.kind : ''
    if (!kind) {
      errors.push(`capabilities[${i}].kind é obrigatório.`)
    }
    if (kind === 'dataSource') {
      dataSourceCount += 1
    }

    const contractVersion =
      'contractVersion' in cap && typeof cap.contractVersion === 'string'
        ? cap.contractVersion
        : ''
    if (!contractVersion || !/^\d+\.\d+\.\d+/.test(contractVersion)) {
      errors.push(
        `capabilities[${i}].contractVersion deve seguir o padrão SemVer (ex: 1.0.0).`,
      )
    }

    if (!('required' in cap) || typeof cap.required !== 'boolean') {
      errors.push(`capabilities[${i}].required deve ser um boolean.`)
    }

    if (
      !('executionPolicy' in cap) ||
      !cap.executionPolicy ||
      typeof cap.executionPolicy !== 'object'
    ) {
      errors.push(
        `capabilities[${i}].executionPolicy é obrigatório e deve ser discriminado.`,
      )
    }
    if (
      'executionPolicy' in cap &&
      cap.executionPolicy &&
      typeof cap.executionPolicy === 'object'
    ) {
      const ep = cap.executionPolicy as {
        kind?: string
        exclusivity?: string
      }
      if (ep.kind !== 'activeWorkspace' && ep.kind !== 'independent') {
        errors.push(
          `capabilities[${i}].executionPolicy.kind deve ser 'activeWorkspace' ou 'independent'.`,
        )
      }
      if (
        ep.exclusivity !== undefined &&
        ep.exclusivity !== 'exclusiveSocket' &&
        ep.exclusivity !== 'none'
      ) {
        errors.push(
          `capabilities[${i}].executionPolicy.exclusivity deve ser 'exclusiveSocket' ou 'none'.`,
        )
      }
    }

    if (
      !('authRequirement' in cap) ||
      !cap.authRequirement ||
      typeof cap.authRequirement !== 'object'
    ) {
      errors.push(
        `capabilities[${i}].authRequirement é obrigatório e deve ser discriminado ({ kind: 'none' } | { kind: 'required' }).`,
      )
    }
    if (
      'authRequirement' in cap &&
      cap.authRequirement &&
      typeof cap.authRequirement === 'object'
    ) {
      const auth = cap.authRequirement as {
        kind?: string
        connectionProfileId?: string
        authorizationRole?: string
      }
      if (auth.kind !== 'none' && auth.kind !== 'required') {
        errors.push(
          `capabilities[${i}].authRequirement.kind deve ser 'none' ou 'required'.`,
        )
      }
      if (auth.kind === 'required') {
        if (
          !auth.connectionProfileId ||
          typeof auth.connectionProfileId !== 'string' ||
          auth.connectionProfileId.trim().length === 0
        ) {
          errors.push(
            `capabilities[${i}].authRequirement.connectionProfileId é obrigatório quando kind é 'required'.`,
          )
        }
        if (
          !auth.authorizationRole ||
          typeof auth.authorizationRole !== 'string' ||
          auth.authorizationRole.trim().length === 0
        ) {
          errors.push(
            `capabilities[${i}].authRequirement.authorizationRole é obrigatório quando kind é 'required'.`,
          )
        }
      }
    }

    if (
      !('supportedOperations' in cap) ||
      !Array.isArray(cap.supportedOperations)
    ) {
      errors.push(
        `capabilities[${i}].supportedOperations deve ser um array de operações suportadas.`,
      )
    }
  }

  if (dataSourceCount > 1) {
    errors.push('Um addon pode oferecer no máximo um dataSource.')
  }
}

export function validateAddon(addonDir: string): ValidationResult {
  const rootDir = path.resolve(addonDir)
  const manifestPath = path.join(rootDir, 'manifest.yaml')
  const errors: string[] = []
  const warnings: string[] = []

  if (!fs.existsSync(manifestPath)) {
    return {
      valid: false,
      errors: [`Arquivo manifest.yaml não encontrado em: ${rootDir}`],
      warnings: [],
    }
  }

  const manifest: AddonConfig = readYaml<AddonConfig>(manifestPath)

  const id = resolveOptionalString(manifest.id, manifest.AddonId)
  if (!id) {
    errors.push('Campo "id" é obrigatório no manifest.yaml.')
  }
  if (id && !/^[a-z0-9-_@/]+$/i.test(id)) {
    errors.push(
      `ID "${id}" inválido. Use apenas letras, números, traços e underlines.`,
    )
  }

  const name = resolveOptionalString(manifest.name, manifest.Name)
  if (!name) {
    errors.push('Campo "name" é obrigatório.')
  }

  const version = resolveOptionalString(manifest.version, manifest.Version)
  if (!version) {
    errors.push('Campo "version" é obrigatório.')
  }
  if (version && !/^\d+\.\d+\.\d+/.test(version)) {
    errors.push(`Versão "${version}" não segue o padrão SemVer (ex: 1.0.0).`)
  }

  const rawTier = resolveOptionalString(manifest.tier, manifest.Tier)
  if (
    rawTier !== undefined &&
    !VALID_ADDON_TIERS.some((validTier) => validTier === rawTier)
  ) {
    errors.push(
      `Tier inválido "${rawTier}". Valores permitidos: ${VALID_ADDON_TIERS.join(', ')}`,
    )
  }

  const rawCategories = extractCategories(manifest)
  if (rawCategories.length === 0) {
    errors.push(
      `Campo "categories" é obrigatório. Deve conter ao menos uma categoria: ${VALID_ADDON_CATEGORIES.join(', ')}`,
    )
  }
  for (const rawCat of rawCategories) {
    if (!VALID_ADDON_CATEGORIES.some((validCat) => validCat === rawCat)) {
      errors.push(
        `Categoria inválida "${rawCat}". Categorias válidas são: ${VALID_ADDON_CATEGORIES.join(', ')}`,
      )
    }
  }

  const author = resolveOptionalString(manifest.author, manifest.Author)
  if (!author) {
    errors.push('Campo "author" é obrigatório.')
  }

  const shortDescription = resolveOptionalString(
    manifest.shortDescription,
    manifest.ShortDescription,
  )
  if (!shortDescription) {
    warnings.push('Recomendado preencher "shortDescription" para a listagem.')
  }

  const description = resolveOptionalString(
    manifest.description,
    manifest.Description,
  )
  if (!description) {
    warnings.push('Recomendado preencher "description" com detalhes do plugin.')
  }

  if (manifest.screenshots && Array.isArray(manifest.screenshots)) {
    manifest.screenshots.forEach((screenshot, idx) => {
      if (!screenshot.url || !/^https?:\/\//i.test(screenshot.url)) {
        errors.push(
          `Screenshot #${idx + 1} deve conter uma URL válida começando com http:// ou https://`,
        )
      }
    })
  }

  if (manifest.downloadUrl && !/^https?:\/\//i.test(manifest.downloadUrl)) {
    errors.push(
      'Campo "downloadUrl" deve ser uma URL pública válida (http:// ou https://).',
    )
  }

  validateSha256Field(manifest.sha256, 'sha256', errors)
  validateSizeField(manifest.size, 'size', errors)

  if (manifest.packages && Array.isArray(manifest.packages)) {
    manifest.packages.forEach((pkgItem, idx) => {
      validateSha256Field(pkgItem.sha256, `packages[${idx}].sha256`, errors)
      validateSizeField(pkgItem.size, `packages[${idx}].size`, errors)
    })
  }

  const capabilities = manifest.capabilities || manifest.Capabilities
  validateCapabilities(capabilities, errors)

  const distDir = path.join(rootDir, 'dist')
  if (!fs.existsSync(distDir)) {
    warnings.push(
      'Diretório dist/ não encontrado. Execute o build antes de empacotar o plugin.',
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export function runValidationCommand(addonDir: string): void {
  console.log(`\n🔍 Validando manifesto do plugin em: ${addonDir}\n`)
  const result = validateAddon(addonDir)

  if (result.warnings.length > 0) {
    console.log('⚠️ Avisos:')
    result.warnings.forEach((w) => console.log(`   - ${w}`))
    console.log('')
  }

  if (!result.valid) {
    console.log('❌ Erros de validação encontrados:')
    result.errors.forEach((e) => console.log(`   - ${e}`))
    console.log('\nCorrija os erros acima antes de empacotar o plugin.\n')
    process.exit(1)
  }

  console.log(
    '✅ Manifesto validado com sucesso! Nenhuma pendência encontrada.\n',
  )
}
