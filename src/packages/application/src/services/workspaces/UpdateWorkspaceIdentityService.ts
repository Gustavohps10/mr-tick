import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IFileManager,
  IFileStorage,
  IUpdateWorkspaceIdentityUseCase,
  IWorkspacesRepository,
  UpdateWorkspaceIdentityInput,
} from '@/contracts'
import { toWorkspaceConnectionDTO, WorkspaceDTO } from '@/dtos'

export class UpdateWorkspaceIdentityService implements IUpdateWorkspaceIdentityUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly fileStorage: IFileStorage,
    private readonly fileManager: IFileManager,
  ) {}

  public async execute({
    workspaceId,
    name,
    description,
    avatarFile,
    removeAvatar,
  }: UpdateWorkspaceIdentityInput): Promise<Either<AppError, WorkspaceDTO>> {
    let newAvatarPath: string | undefined

    try {
      const workspaceResult =
        await this.workspacesRepository.getById(workspaceId)
      if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
      const workspace = workspaceResult.success

      if (!workspace) {
        return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))
      }

      let newAvatarUrl = workspace.avatarUrl

      if (removeAvatar) {
        if (workspace.avatarUrl) {
          const oldPath = `workspaces/avatars/${workspace.id}.any`
          await this.fileStorage.delete(oldPath, true)
        }
        newAvatarUrl = undefined
      }
      if (avatarFile && !removeAvatar) {
        const mimeResult = await this.fileManager.getMimeType(avatarFile)
        if (mimeResult.isFailure()) return mimeResult.forwardFailure()

        const { ext } = mimeResult.success
        newAvatarPath = `workspaces/avatars/${workspace.id}.${ext}`
        await this.fileStorage.write(newAvatarPath, avatarFile)
        newAvatarUrl = this.fileStorage.getPublicUrl(newAvatarPath)
      }

      const result = workspace.updateIdentity({
        name,
        description,
        avatarUrl: newAvatarUrl,
      })

      if (result.isFailure()) {
        if (newAvatarPath) await this.fileStorage.delete(newAvatarPath, true)
        return result.forwardFailure()
      }

      let updateResult: Either<AppError, void>
      try {
        updateResult = await this.workspacesRepository.update(workspace)
      } catch (repoError) {
        if (newAvatarPath) await this.fileStorage.delete(newAvatarPath, true)
        return Either.failure(
          AppError.Internal('ERRO_AO_ATUALIZAR_IDENTIDADE_DO_WORKSPACE'),
        )
      }

      if (updateResult.isFailure()) {
        if (newAvatarPath) await this.fileStorage.delete(newAvatarPath, true)
        return updateResult.forwardFailure()
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
        AppError.Internal('ERRO_AO_ATUALIZAR_IDENTIDADE_DO_WORKSPACE'),
      )
    }
  }
}
