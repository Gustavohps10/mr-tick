import { Workspace } from '@mr-tick/domain'
import { AppError, Either } from '@mr-tick/shared/helpers'

import {
  IConnectionLifecycleCoordinator,
  IWorkspacesRepository,
} from '@/contracts'
import { IAddonConnectionProfilesResolver } from '@/contracts/core/IAddonConnectionProfilesResolver'
import {
  ILinkConnectionUseCase,
  LinkConnectionInput,
} from '@/contracts/use-cases/ILinkConnectionUseCase'
import { toWorkspaceConnectionDTO, WorkspaceDTO } from '@/dtos'

export class LinkConnectionService implements ILinkConnectionUseCase {
  constructor(
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly profilesResolver: IAddonConnectionProfilesResolver,
    private readonly connectionLifecycleCoordinator: IConnectionLifecycleCoordinator,
  ) {}

  public async execute(
    input: LinkConnectionInput,
  ): Promise<Either<AppError, WorkspaceDTO>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success
    if (!workspace)
      return Either.failure(AppError.NotFound('WORKSPACE_NAO_ENCONTRADO'))

    const profilesResult = await this.profilesResolver.getConnectionProfiles(
      input.addonId,
    )
    if (profilesResult.isFailure()) return profilesResult.forwardFailure()
    const profile = profilesResult.success.find(
      (candidate) =>
        candidate.connectionProfileId === input.connectionProfileId,
    )
    if (!profile)
      return Either.failure(
        AppError.ValidationError('CONNECTION_PROFILE_NOT_DECLARED'),
      )

    const existingConnection = workspace.connections.find(
      (connection) => connection.id === input.connectionInstanceId,
    )
    if (existingConnection) {
      if (
        existingConnection.addonId !== input.addonId ||
        existingConnection.connectionProfileId !==
          profile.connectionProfileId ||
        existingConnection.cardinality !== profile.cardinality
      )
        return Either.failure(
          AppError.Http(409, 'CONNECTION_PROFILE_OWNERSHIP_CONFLICT'),
        )
      return Either.success(toWorkspaceDTO(workspace))
    }

    const created = await this.connectionLifecycleCoordinator.create({
      workspaceId: input.workspaceId,
      connectionInstanceId: input.connectionInstanceId,
      addonId: input.addonId,
      profile,
    })
    if (created.isFailure()) return created.forwardFailure()
    return Either.success(toWorkspaceDTO(created.success))
  }
}

function toWorkspaceDTO(workspace: Workspace): WorkspaceDTO {
  return {
    id: workspace.id,
    name: workspace.name,
    avatarUrl: workspace.avatarUrl,
    status: workspace.status,
    description: workspace.description,
    connections: workspace.connections.map(toWorkspaceConnectionDTO),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}
