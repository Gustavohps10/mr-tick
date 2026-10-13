import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  AddonPackageFile,
  IAddonPackageVerifier,
  IAddonsFacade,
  VerifiedAddonPackage,
} from '@mr-tick/application'
import {
  ADDON_CATALOG_RECEIPT_FILE,
  AddonCatalogManifestV2,
  SignedAddonCatalogManifestV2,
} from '@mr-tick/sdk'
import { AppError, Either } from '@mr-tick/shared/helpers'
import Ajv from 'ajv'

export interface IAddonPackageVerificationConfiguration {
  readonly publicKeys: readonly {
    readonly keyId: string
    readonly publicKeyJwk: {
      readonly kty: 'OKP'
      readonly crv: 'Ed25519'
      readonly x: string
    }
  }[]
}

const ajv = new Ajv({ allErrors: true })
const validateEnvelope = ajv.compile<SignedAddonCatalogManifestV2>({
  type: 'object',
  additionalProperties: false,
  required: ['manifestBase64Url', 'signatureBase64Url', 'signedToken'],
  properties: {
    manifestBase64Url: { type: 'string', pattern: '^[A-Za-z0-9_-]+$' },
    signatureBase64Url: { type: 'string', pattern: '^[A-Za-z0-9_-]+$' },
    signedToken: { type: 'string' },
  },
})
const validateManifest = ajv.compile<AddonCatalogManifestV2>({
  type: 'object',
  additionalProperties: false,
  required: [
    'formatVersion',
    'keyId',
    'addonId',
    'version',
    'sdkVersionRange',
    'classification',
    'files',
    'publishedAt',
  ],
  properties: {
    formatVersion: { const: 2 },
    keyId: { type: 'string', minLength: 1 },
    addonId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' },
    version: { type: 'string', minLength: 1 },
    sdkVersionRange: { type: 'string', minLength: 1 },
    classification: { enum: ['free', 'plus'] },
    publishedAt: { type: 'integer', minimum: 1 },
    files: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'sha256'],
        properties: {
          path: { type: 'string', minLength: 1 },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        },
      },
    },
  },
})

function safePath(name: string): boolean {
  if (
    !name ||
    name !== name.trim() ||
    name.includes('\\') ||
    name.includes(':') ||
    name.startsWith('/')
  )
    return false
  return name
    .split('/')
    .every(
      (segment) =>
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !/[. ]$/.test(segment),
    )
}
function digest(content: Uint8Array): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export class SignedAddonPackageVerifier implements IAddonPackageVerifier {
  constructor(
    private readonly addonPackageVerificationConfiguration: IAddonPackageVerificationConfiguration,
    private readonly addonsFacade: IAddonsFacade,
  ) {}

  async verify(
    files: readonly AddonPackageFile[],
    addonId: string,
    version: string,
  ): Promise<Either<AppError, VerifiedAddonPackage>> {
    try {
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(addonId) ||
        !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.+-]+)?$/.test(version)
      )
        return Either.failure(
          AppError.ValidationError('IDENTIDADE_ADDON_INVALIDA'),
        )
      const entries = new Map<string, AddonPackageFile>()
      const normalized = new Set<string>()
      for (const file of files) {
        const name = file.name
        if (!safePath(name) || normalized.has(name.toLowerCase()))
          return Either.failure(
            AppError.ValidationError('CAMINHO_ARQUIVO_ADDON_INVALIDO'),
          )
        normalized.add(name.toLowerCase())
        entries.set(name, file)
      }
      const manifestFiles = files.filter(
        (file) => file.name === 'manifest.yaml' || file.name === 'manifest.yml',
      )
      if (manifestFiles.length !== 1)
        return Either.failure(
          AppError.ValidationError('MANIFEST_ADDON_AMBIGUO_OU_AUSENTE'),
        )
      const manifestFile = manifestFiles.at(0)
      if (!manifestFile)
        return Either.failure(AppError.NotFound('MANIFEST_NAO_ENCONTRADO'))
      const metadata = await this.addonsFacade.parseManifest(
        Buffer.from(manifestFile.content),
      )
      if (metadata.isFailure()) return metadata.forwardFailure()
      if (
        metadata.success.id !== addonId ||
        metadata.success.version !== version
      )
        return Either.failure(
          AppError.ValidationError('IDENTIDADE_PACOTE_ADDON_DIVERGENTE'),
        )
      const inventory = [...files]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((file) => ({ path: file.name, sha256: digest(file.content) }))
      const fingerprint = digest(
        Buffer.from(JSON.stringify({ addonId, version, inventory })),
      )
      const receipt = entries.get(ADDON_CATALOG_RECEIPT_FILE)
      if (!receipt)
        return Either.success({
          classification: 'unknown',
          fingerprint,
          addonId,
          version,
          requiredApiVersion: metadata.success.requiredApiVersion,
        })
      const envelope: object = JSON.parse(
        Buffer.from(receipt.content).toString('utf8'),
      )
      if (
        !validateEnvelope(envelope) ||
        envelope.signedToken !==
          envelope.manifestBase64Url + '.' + envelope.signatureBase64Url
      )
        return Either.failure(
          AppError.Unauthorized('ASSINATURA_CATALOGO_INVALIDA'),
        )
      const publication: object = JSON.parse(
        Buffer.from(envelope.manifestBase64Url, 'base64url').toString('utf8'),
      )
      if (!validateManifest(publication))
        return Either.failure(
          AppError.Unauthorized('MANIFESTO_ASSINADO_INVALIDO'),
        )
      const key = this.addonPackageVerificationConfiguration.publicKeys.find(
        (item) => item.keyId === publication.keyId,
      )
      if (!key)
        return Either.failure(
          AppError.Unauthorized('CHAVE_CATALOGO_DESCONHECIDA'),
        )
      const publicKey = crypto.createPublicKey({
        key: key.publicKeyJwk,
        format: 'jwk',
      })
      if (
        !crypto.verify(
          null,
          Buffer.from(envelope.manifestBase64Url),
          publicKey,
          Buffer.from(envelope.signatureBase64Url, 'base64url'),
        )
      )
        return Either.failure(
          AppError.Unauthorized('ASSINATURA_CATALOGO_INVALIDA'),
        )
      if (
        publication.addonId !== addonId ||
        publication.version !== version ||
        publication.sdkVersionRange !== metadata.success.requiredApiVersion ||
        publication.publishedAt > Date.now() + 300_000
      )
        return Either.failure(
          AppError.Unauthorized('IDENTIDADE_MANIFESTO_ASSINADO_DIVERGENTE'),
        )
      if (publication.files.length !== entries.size - 1)
        return Either.failure(
          AppError.Unauthorized('INTEGRIDADE_ADDON_INVALIDA'),
        )
      const signedPaths = new Set<string>()
      for (const item of publication.files) {
        if (
          !safePath(item.path) ||
          item.path === ADDON_CATALOG_RECEIPT_FILE ||
          signedPaths.has(item.path.toLowerCase())
        )
          return Either.failure(
            AppError.Unauthorized('INVENTARIO_ADDON_INVALIDO'),
          )
        signedPaths.add(item.path.toLowerCase())
        const file = entries.get(item.path)
        if (!file || digest(file.content) !== item.sha256)
          return Either.failure(
            AppError.Unauthorized('INTEGRIDADE_ADDON_INVALIDA'),
          )
      }
      return Either.success({
        classification: publication.classification,
        fingerprint,
        addonId,
        version,
        requiredApiVersion: publication.sdkVersionRange,
      })
    } catch {
      return Either.failure(
        AppError.Unauthorized('FALHA_VERIFICACAO_PACOTE_ADDON'),
      )
    }
  }

  async verifyDirectory(
    addonId: string,
    directory: string,
  ): Promise<Either<AppError, VerifiedAddonPackage>> {
    try {
      const root = await fs.lstat(directory)
      if (!root.isDirectory() || root.isSymbolicLink())
        return Either.failure(AppError.Unauthorized('CAMINHO_ADDON_INSEGURO'))
      const files: AddonPackageFile[] = []
      async function collect(
        current: string,
        relative: string,
      ): Promise<boolean> {
        for (const item of await fs.readdir(current, { withFileTypes: true })) {
          const fullPath = path.join(current, item.name)
          const entryPath = relative + item.name
          const stat = await fs.lstat(fullPath)
          if (stat.isSymbolicLink()) return false
          if (stat.isDirectory()) {
            if (!(await collect(fullPath, entryPath + '/'))) return false
            continue
          }
          if (!stat.isFile()) return false
          files.push({ name: entryPath, content: await fs.readFile(fullPath) })
        }
        return true
      }
      if (!(await collect(directory, '')))
        return Either.failure(AppError.Unauthorized('CAMINHO_ADDON_INSEGURO'))
      const manifests = files.filter(
        (file) => file.name === 'manifest.yaml' || file.name === 'manifest.yml',
      )
      const manifest = manifests.at(0)
      if (manifests.length !== 1 || !manifest)
        return Either.failure(
          AppError.ValidationError('MANIFEST_ADDON_AMBIGUO_OU_AUSENTE'),
        )
      const metadata = await this.addonsFacade.parseManifest(
        Buffer.from(manifest.content),
      )
      if (metadata.isFailure()) return metadata.forwardFailure()
      return this.verify(files, addonId, metadata.success.version)
    } catch {
      return Either.failure(AppError.Unauthorized('FALHA_LEITURA_PACOTE_ADDON'))
    }
  }
}
