import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function isLocalSdkDevelopmentAddon(
  addonFolderPath: string,
  isPackaged: boolean,
): boolean {
  if (isPackaged !== false) return false
  if (!lstatSync(addonFolderPath).isSymbolicLink()) return false

  const dependencyPath = join(
    addonFolderPath,
    'node_modules',
    '@mr-tick',
    'sdk',
  )

  if (!existsSync(dependencyPath)) return false
  if (!lstatSync(dependencyPath).isSymbolicLink()) return false

  const hostSdkEntry = fileURLToPath(import.meta.resolve('@mr-tick/sdk'))
  const hostSdkPath = join(dirname(hostSdkEntry), '..')

  return realpathSync(dependencyPath) === realpathSync(hostSdkPath)
}
