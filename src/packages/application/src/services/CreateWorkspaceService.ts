import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  CreateWorkspaceInput,
  ICreateWorkspaceUseCase,
  IFileManager,
  IFileStorage,
  IWorkspacesRepository,
} from '@/contracts'
import { toWorkspaceConnectionDTO, WorkspaceDTO } from '@/dtos'

export class CreateWorkspaceService implements ICreateWorkspaceUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly fileStorage: IFileStorage,
    private readonly fileManager: IFileManager,
  ) {}

  public async execute({
    name,
    description,
    avatarFile,
  }: CreateWorkspaceInput): Promise<Either<AppError, WorkspaceDTO>> {
    let avatarPath: string | undefined

    try {
      const result = Workspace.create({ name, description })
      if (result.isFailure()) return result.forwardFailure()

      const workspace = result.success

      if (avatarFile) {
        const mimeResult = await this.fileManager.getMimeType(avatarFile)
        if (mimeResult.isFailure()) return mimeResult.forwardFailure()

        const { ext } = mimeResult.success
        avatarPath = `workspaces/avatars/${workspace.id}.${ext}`
        await this.fileStorage.write(avatarPath, avatarFile)

        const publicUrl = this.fileStorage.getPublicUrl(avatarPath)

        const avatarResult = workspace.updateAvatarUrl(publicUrl)
        if (avatarResult.isFailure()) {
          await this.fileStorage.delete(avatarPath, true)
          return avatarResult.forwardFailure()
        }
      }

      let createResult: Either<AppError, void>
      try {
        createResult = await this.workspacesRepository.create(workspace)
      } catch (repoError) {
        if (avatarPath) await this.fileStorage.delete(avatarPath, true)
        return Either.failure(
          AppError.Internal('ALGO DEU ERRADO AO CRIAR WORKSPACE'),
        )
      }

      if (createResult.isFailure()) {
        if (avatarPath) await this.fileStorage.delete(avatarPath, true)
        return createResult.forwardFailure()
      }

      return Either.success({
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        avatarUrl: workspace.avatarUrl,
        description: workspace.description,
        connections: workspace.connections.map(toWorkspaceConnectionDTO),
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })
    } catch (err) {
      return Either.failure(
        AppError.Internal('ALGO DEU ERRADO AO CRIAR WORKSPACE'),
      )
    }
  }
}
