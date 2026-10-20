import type {
  ConnectAddonConnectionResult,
  CreateWorkspaceInput,
  DeleteWorkspaceInput,
  IConnectAddonConnectionUseCase,
  ICreateWorkspaceUseCase,
  IDeleteWorkspaceUseCase,
  IDisconnectAddonConnectionUseCase,
  IGetWorkspaceUseCase,
  ILinkConnectionUseCase,
  IListWorkspacesUseCase,
  IMarkWorkspaceAsConfiguredUseCase,
  IUnlinkConnectionUseCase,
  IUpdateWorkspaceIdentityUseCase,
  ListWorkspacesOptions,
  MarkWorkspaceAsConfiguredInput,
  PagedResultDTO,
  UpdateWorkspaceIdentityInput,
  WorkspaceDTO,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { NoOpSystemEventEmitter } from '@mr-tick/shared/transport'
import { describe, expect, it } from 'vitest'

import { WorkspacesHandler } from './WorkspacesHandler'

class MockListWorkspacesUseCase implements IListWorkspacesUseCase {
  constructor(public readonly result: PagedResultDTO<WorkspaceDTO>) {}

  public async execute(
    _options?: ListWorkspacesOptions,
  ): Promise<Either<AppError, PagedResultDTO<WorkspaceDTO>>> {
    return Either.success(this.result)
  }
}

class NoopGetWorkspaceUseCase implements IGetWorkspaceUseCase {
  public async execute(): Promise<Either<AppError, WorkspaceDTO>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopCreateWorkspaceUseCase implements ICreateWorkspaceUseCase {
  public async execute(
    _input: CreateWorkspaceInput,
  ): Promise<Either<AppError, WorkspaceDTO>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopDeleteWorkspaceUseCase implements IDeleteWorkspaceUseCase {
  public async execute(
    _input: DeleteWorkspaceInput,
  ): Promise<Either<AppError, void>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopLinkConnectionUseCase implements ILinkConnectionUseCase {
  public async execute(): Promise<Either<AppError, WorkspaceDTO>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopUnlinkConnectionUseCase implements IUnlinkConnectionUseCase {
  public async execute(): Promise<Either<AppError, WorkspaceDTO>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopConnectAddonConnectionUseCase implements IConnectAddonConnectionUseCase {
  public async execute(): Promise<
    Either<AppError, ConnectAddonConnectionResult>
  > {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopDisconnectAddonConnectionUseCase implements IDisconnectAddonConnectionUseCase {
  public async execute(): Promise<Either<AppError, void>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopUpdateWorkspaceIdentityUseCase implements IUpdateWorkspaceIdentityUseCase {
  public async execute(
    _input: UpdateWorkspaceIdentityInput,
  ): Promise<Either<AppError, WorkspaceDTO>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

class NoopMarkWorkspaceAsConfiguredUseCase implements IMarkWorkspaceAsConfiguredUseCase {
  public async execute(
    _input: MarkWorkspaceAsConfiguredInput,
  ): Promise<Either<AppError, void>> {
    return Either.failure(AppError.NotFound('NOT_FOUND'))
  }
}

describe('WorkspacesHandler', () => {
  it('delivers all workspaces from paged result without truncation', async () => {
    const items: WorkspaceDTO[] = []
    for (let i = 1; i <= 60; i += 1) {
      items.push({
        id: `ws-${i}`,
        name: `Workspace ${i}`,
        status: 'configured',
        description: `Desc ${i}`,
        connections: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    const pagedResult: PagedResultDTO<WorkspaceDTO> = {
      items,
      total: 60,
      page: 1,
      pageSize: 60,
    }

    const listUseCase = new MockListWorkspacesUseCase(pagedResult)

    const handler = new WorkspacesHandler(
      new NoopCreateWorkspaceUseCase(),
      listUseCase,
      new NoopGetWorkspaceUseCase(),
      new NoopLinkConnectionUseCase(),
      new NoopUnlinkConnectionUseCase(),
      new NoopConnectAddonConnectionUseCase(),
      new NoopDisconnectAddonConnectionUseCase(),
      new NoopMarkWorkspaceAsConfiguredUseCase(),
      new NoopUpdateWorkspaceIdentityUseCase(),
      new NoopDeleteWorkspaceUseCase(),
      new NoOpSystemEventEmitter(),
    )

    const response = await handler.listAll()

    expect(response.isSuccess).toBe(true)
    expect(response.totalItems).toBe(60)
    expect(response.data).toHaveLength(60)
    expect(response.data?.[59]?.id).toBe('ws-60')
  })
})
