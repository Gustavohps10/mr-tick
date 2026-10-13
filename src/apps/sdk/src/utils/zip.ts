import fs from 'node:fs'
import path from 'node:path'

import AdmZip from 'adm-zip'
import { z } from 'zod'

export interface AddonPackageFile {
  readonly path: string
  readonly contents: Buffer
}

const privateJwkDocumentSchema = z.object({
  kty: z.string().min(1),
  d: z.string().min(1),
})

function rejectSecretFile(file: string, contents: Buffer): void {
  const filename = path.basename(file)
  if (
    /^\.env(?:\..+)?$/i.test(filename) ||
    /\.(?:pem|key|p12|pfx|jwk)$/i.test(filename)
  )
    throw new Error('ADDON_PACKAGE_SECRET_FILE_FORBIDDEN')
  const text = contents.toString('utf8')
  if (/-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----/.test(text))
    throw new Error('ADDON_PACKAGE_SECRET_FILE_FORBIDDEN')
  if (path.extname(file).toLowerCase() !== '.json') return
  let containsPrivateKey = false
  try {
    containsPrivateKey = privateJwkDocumentSchema.safeParse(
      JSON.parse(text),
    ).success
  } catch {
    return
  }
  if (containsPrivateKey) throw new Error('ADDON_PACKAGE_SECRET_FILE_FORBIDDEN')
}

/** The same collected bytes are hashed and archived; paths stay relative to the addon root. */
export function collectAddonPackageFiles(
  pathsToInclude: readonly string[],
  rootDir: string,
): AddonPackageFile[] {
  const root = path.resolve(rootDir)
  const files: AddonPackageFile[] = []
  const seen = new Set<string>()
  function collect(item: string): void {
    const absolute = path.resolve(item)
    const relative = path.relative(root, absolute)
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error('ADDON_PACKAGE_PATH_OUTSIDE_ROOT')
    const stats = fs.lstatSync(absolute)
    if (stats.isSymbolicLink())
      throw new Error('ADDON_PACKAGE_SYMLINK_FORBIDDEN')
    if (stats.isDirectory()) {
      for (const filename of fs.readdirSync(absolute).sort())
        collect(path.join(absolute, filename))
      return
    }
    if (!stats.isFile()) throw new Error('ADDON_PACKAGE_FILE_TYPE_INVALID')
    const archivePath = relative.split(path.sep).join('/')
    const collisionKey = archivePath.toLowerCase()
    if (seen.has(collisionKey)) throw new Error('ADDON_PACKAGE_PATH_DUPLICATE')
    seen.add(collisionKey)
    const contents = fs.readFileSync(absolute)
    rejectSecretFile(absolute, contents)
    files.push({ path: archivePath, contents })
  }
  for (const item of pathsToInclude) collect(item)
  return files.sort((first, second) => first.path.localeCompare(second.path))
}

export function packageAddon(
  files: readonly AddonPackageFile[],
  outFile: string,
): void {
  const zip = new AdmZip()
  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file.path.toLowerCase()))
      throw new Error('ADDON_PACKAGE_PATH_DUPLICATE')
    seen.add(file.path.toLowerCase())
    zip.addFile(file.path, file.contents)
  }
  zip.writeZip(outFile)
}
