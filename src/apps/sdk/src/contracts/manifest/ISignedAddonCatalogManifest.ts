export interface AddonCatalogFileEntry {
  readonly path: string
  readonly sha256: string
}

interface AddonCatalogManifestContent {
  readonly keyId: string
  readonly addonId: string
  readonly version: string
  readonly sdkVersionRange: string
  readonly classification: 'free' | 'plus'
  readonly files: readonly AddonCatalogFileEntry[]
  readonly publishedAt: number
}

/** Embedded inventory excludes its own envelope and the circular ZIP hash. */
export interface AddonCatalogManifestV2 extends AddonCatalogManifestContent {
  readonly formatVersion: 2
}

/** Detached catalog receipt binds the completed archive to its inventory. */
export interface AddonCatalogManifestV1 extends AddonCatalogManifestContent {
  readonly formatVersion: 1
  readonly packageSha256: string
}

export interface SignedAddonCatalogManifestV2 {
  readonly manifestBase64Url: string
  readonly signatureBase64Url: string
  readonly signedToken: string
}

export interface SignedAddonCatalogManifestV1 extends SignedAddonCatalogManifestV2 {
  readonly manifest: AddonCatalogManifestV1
}

export const ADDON_CATALOG_RECEIPT_FILE = 'catalog-version.json'
