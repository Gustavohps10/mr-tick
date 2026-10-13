export interface AddonInstallerViewModel {
  id: string
  packages: {
    version: string
    requiredApiVersion: string
    releaseDate: string
    downloadUrl: string
    sha256?: string
    size?: number
    changelog: string[]
  }[]
}
