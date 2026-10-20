import {
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
  MarkWorkspaceAsConfiguredInput,
  UpdateWorkspaceIdentityInput,
} from '@mr-tick/application'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import type { IRequest, ISystemEventEmitter } from '@mr-tick/shared/transport'
import {
  ConnectionResultViewModel,
  PaginatedViewModel,
  ViewModel,
  WorkspaceViewModel,
} from '@mr-tick/shared/view-models'
import { IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'

export interface GetWorkspaceByIdRequest {
  workspaceId: string
}

export interface LinkDataSourceRequest {
  workspaceId: string
  addonId: string
  connectionInstanceId: string
  connectionProfileId: string
}

export interface UnlinkDataSourceRequest {
  workspaceId: string
  connectionInstanceId: string
}

export interface ConnectDataSourceRequest {
  workspaceId: string
  connectionInstanceId: string
  authenticationInput: {
    kind: 'credentials'
    authorizationRole?: string
    authProfileId: string
    credentials: Readonly<Record<string, string | number | boolean>>
    configuration: Readonly<Record<string, string | number | boolean>>
  }
}

export interface DisconnectDataSourceRequest {
  workspaceId: string
  connectionInstanceId: string
}

export class WorkspacesHandler implements HandlerBase<WorkspacesHandler> {
  constructor(
    private readonly createWorkspaceService: ICreateWorkspaceUseCase,
    private readonly listWorkspacesService: IListWorkspacesUseCase,
    private readonly getWorkspaceService: IGetWorkspaceUseCase,
    private readonly linkConnectionService: ILinkConnectionUseCase,
    private readonly unlinkConnectionService: IUnlinkConnectionUseCase,
    private readonly connectAddonConnectionService: IConnectAddonConnectionUseCase,
    private readonly disconnectAddonConnectionService: IDisconnectAddonConnectionUseCase,
    private readonly markWorkspaceAsConfiguredService: IMarkWorkspaceAsConfiguredUseCase,
    private readonly updateWorkspaceIdentityService: IUpdateWorkspaceIdentityUseCase,
    private readonly deleteWorkspaceService: IDeleteWorkspaceUseCase,
    private readonly systemEventEmitter: ISystemEventEmitter,
  ) {}

  public async markWorkspaceAsConfigured(
    event: IpcMainInvokeEvent,
    { body: { workspaceId } }: IRequest<MarkWorkspaceAsConfiguredInput>,
  ): Promise<ViewModel> {
    const result = await this.markWorkspaceAsConfiguredService.execute({
      workspaceId,
    })

    return createResponseViewModel(result)
  }

  public async create(
    event: IpcMainInvokeEvent,
    { body: { name, avatarFile, description } }: IRequest<CreateWorkspaceInput>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.createWorkspaceService.execute({
      name,
      avatarFile,
      description,
    })

    return createResponseViewModel(result, 201)
  }

  public async listAll(): Promise<PaginatedViewModel<WorkspaceViewModel[]>> {
    const result = await this.listWorkspacesService.execute()

    const mappedResult = result.map((paged) => ({
      data: paged.items.map((workspace) => ({
        ...workspace,
      })),
      totalItems: paged.total,
      totalPages: Math.ceil(paged.total / (paged.pageSize || 1)),
      currentPage: paged.page || 1,
    }))

    return createResponseViewModel(mappedResult)
  }

  public async getById(
    event: IpcMainInvokeEvent,
    { body }: IRequest<GetWorkspaceByIdRequest>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.getWorkspaceService.execute(body)

    return createResponseViewModel(result)
  }

  public async linkDataSource(
    event: IpcMainInvokeEvent,
    { body }: IRequest<LinkDataSourceRequest>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.linkConnectionService.execute(body)

    return createResponseViewModel(result)
  }

  public async unlinkDataSource(
    event: IpcMainInvokeEvent,
    { body }: IRequest<UnlinkDataSourceRequest>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.unlinkConnectionService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
    })
    if (result.isSuccess()) {
      this.systemEventEmitter.emit('connection:removed', {
        workspaceId: body.workspaceId,
        connectionInstanceId: body.connectionInstanceId,
      })
    }

    return createResponseViewModel(result)
  }

  public async submitCredentials(
    event: IpcMainInvokeEvent,
    { body }: IRequest<ConnectDataSourceRequest>,
  ): Promise<ViewModel<ConnectionResultViewModel>> {
    const authorizationRole = body.authenticationInput.authorizationRole
    if (authorizationRole === undefined) {
      return {
        isSuccess: false,
        statusCode: 400,
        error: 'AUTHORIZATION_ROLE_REQUIRED',
      }
    }

    const result = await this.connectAddonConnectionService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
      authenticationInput: {
        method: 'authorized',
        authorizationRole,
        authProfileId: body.authenticationInput.authProfileId,
        credentials: body.authenticationInput.credentials,
        configuration: body.authenticationInput.configuration,
      },
    })

    return createResponseViewModel(result)
  }

  public async disconnectDataSource(
    event: IpcMainInvokeEvent,
    { body }: IRequest<DisconnectDataSourceRequest>,
  ): Promise<ViewModel<void>> {
    const result = await this.disconnectAddonConnectionService.execute(body)
    if (result.isSuccess()) {
      this.systemEventEmitter.emit('connection:disconnected', {
        workspaceId: body.workspaceId,
        connectionInstanceId: body.connectionInstanceId,
      })
    }

    return createResponseViewModel(result)
  }

  public async updateIdentity(
    event: IpcMainInvokeEvent,
    { body }: IRequest<UpdateWorkspaceIdentityInput>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.updateWorkspaceIdentityService.execute(body)

    return createResponseViewModel(result)
  }

  public async delete(
    event: IpcMainInvokeEvent,
    { body }: IRequest<DeleteWorkspaceInput>,
  ): Promise<ViewModel<void>> {
    const result = await this.deleteWorkspaceService.execute(body)

    return createResponseViewModel(result)
  }
}
