import { AppError, Either } from '@mr-tick/shared/helpers'

import { IWorkspacesRepository } from '@/contracts'
import {
  IMarkWorkspaceAsConfiguredUseCase,
  MarkWorkspaceAsConfiguredInput,
} from '@/contracts/use-cases/IMarkWorkspaceAsConfiguredUseCase'

export class MarkWorkspaceAsConfiguredService implements IMarkWorkspaceAsConfiguredUseCase {
  constructor(private readonly workspacesRepository: IWorkspacesRepository) {}

  public async execute(
    input: MarkWorkspaceAsConfiguredInput,
  ): Promise<Either<AppError, void>> {
    const workspaceResult = await this.workspacesRepository.getById(
      input.workspaceId,
    )
    if (workspaceResult.isFailure()) return workspaceResult.forwardFailure()
    const workspace = workspaceResult.success

    if (!workspace)
      return Either.failure(
        AppError.ValidationError('Workspace nao encontrado'),
      )

    workspace.markAsConfigured()

    const updateResult = await this.workspacesRepository.update(workspace)
    if (updateResult.isFailure()) return updateResult.forwardFailure()

    return Either.success()
  }
}
