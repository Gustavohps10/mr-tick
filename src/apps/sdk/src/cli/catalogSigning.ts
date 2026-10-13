import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
} from 'node:crypto'

import { z } from 'zod'

import type {
  AddonCatalogManifestV1,
  AddonCatalogManifestV2,
  SignedAddonCatalogManifestV2,
} from '../contracts/manifest'

export interface CatalogSigningPrivateKeyJwk {
  readonly kty?: string
  readonly crv?: string
  readonly x?: string
  readonly d?: string
}

export interface AddonCatalogSigningOptions {
  readonly privateKeyJwk: CatalogSigningPrivateKeyJwk
  readonly keyId: string
  readonly publishedAt?: number
}

interface CatalogSigningEnvironment {
  readonly MR_TICK_CATALOG_SIGNING_KEY?: string
  readonly MR_TICK_CATALOG_KEY_ID?: string
}

const privateKeySchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  d: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
})

export function readCatalogSigningEnvironment(
  environment: CatalogSigningEnvironment,
): AddonCatalogSigningOptions | undefined {
  const serializedKey = environment.MR_TICK_CATALOG_SIGNING_KEY
  const keyId = environment.MR_TICK_CATALOG_KEY_ID
  if (serializedKey === undefined && keyId === undefined) return undefined
  if (!serializedKey || !keyId || !keyId.trim())
    throw new Error('CATALOG_SIGNING_CONFIGURATION_INCOMPLETE')
  try {
    const parsed = privateKeySchema.safeParse(JSON.parse(serializedKey))
    if (!parsed.success) throw new Error('CATALOG_SIGNING_KEY_INVALID')
    return { privateKeyJwk: parsed.data, keyId: keyId.trim() }
  } catch {
    throw new Error('CATALOG_SIGNING_KEY_INVALID')
  }
}

export function prepareCatalogSigning(options: AddonCatalogSigningOptions): {
  privateKey: KeyObject
  keyId: string
  publishedAt: number
} {
  const keyId = options.keyId.trim()
  if (!keyId) throw new Error('CATALOG_SIGNING_KEY_ID_INVALID')
  const parsed = privateKeySchema.safeParse(options.privateKeyJwk)
  if (!parsed.success) throw new Error('CATALOG_SIGNING_KEY_INVALID')
  let publishedAt = Date.now()
  if (options.publishedAt !== undefined) publishedAt = options.publishedAt
  if (!Number.isSafeInteger(publishedAt) || publishedAt <= 0)
    throw new Error('CATALOG_PUBLICATION_TIME_INVALID')
  try {
    const privateKey = createPrivateKey({ key: parsed.data, format: 'jwk' })
    if (privateKey.asymmetricKeyType !== 'ed25519')
      throw new Error('CATALOG_SIGNING_KEY_INVALID')
    const publicKey = createPublicKey(privateKey).export({ format: 'jwk' })
    if (publicKey.x !== parsed.data.x)
      throw new Error('CATALOG_SIGNING_KEY_INVALID')
    return { privateKey, keyId, publishedAt }
  } catch {
    throw new Error('CATALOG_SIGNING_KEY_INVALID')
  }
}

/** Matches the API protocol: sign UTF-8 of the encoded payload, not decoded JSON. */
export function signCatalogManifest(
  manifest: AddonCatalogManifestV1 | AddonCatalogManifestV2,
  privateKey: KeyObject,
): SignedAddonCatalogManifestV2 {
  const manifestBase64Url = Buffer.from(
    JSON.stringify(manifest),
    'utf8',
  ).toString('base64url')
  const signatureBase64Url = sign(
    null,
    Buffer.from(manifestBase64Url, 'utf8'),
    privateKey,
  ).toString('base64url')
  return {
    manifestBase64Url,
    signatureBase64Url,
    signedToken: `${manifestBase64Url}.${signatureBase64Url}`,
  }
}
