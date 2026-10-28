export interface AddonInstallerDTO {
  id: string
  packages: {
    version: string
    requiredApiVersion: string
    releaseDate: string
    downloadUrl: string
    changelog: string[]
  }[]
}
