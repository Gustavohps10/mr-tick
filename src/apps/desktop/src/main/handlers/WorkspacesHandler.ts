import {
  CreateWorkspaceInput,
  DeleteWorkspaceInput,
  IConnectDataSourceUseCase,
  ICreateWorkspaceUseCase,
  IDeleteWorkspaceUseCase,
  IDisconnectDataSourceUseCase,
  IGetCurrentUserUseCase,
  IGetWorkspaceUseCase,
  ILinkDataSourceUseCase,
  IListWorkspacesUseCase,
  IMarkWorkspaceAsConfiguredUseCase,
  IUnlinkDataSourceUseCase,
  IUpdateWorkspaceIdentityUseCase,
  MarkWorkspaceAsConfiguredInput,
  UpdateWorkspaceIdentityInput,
} from '@mr-tick/application'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import {
  ConnectionResultViewModel,
  MemberViewModel,
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
  dataSourceId: string
  connectionInstanceId: string
}

export interface UnlinkDataSourceRequest {
  workspaceId: string
  connectionInstanceId: string
}

export interface ConnectDataSourceRequest {
  workspaceId: string
  pluginId: string
  connectionInstanceId: string
  credentials: Record<string, string | number | boolean>
  configuration: Record<string, string | number | boolean>
}

export interface DisconnectDataSourceRequest {
  workspaceId: string
  connectionInstanceId: string
}

export interface GetConnectionMemberRequest {
  workspaceId: string
  connectionInstanceId: string
}

export class WorkspacesHandler implements HandlerBase<WorkspacesHandler> {
  constructor(
    private readonly createWorkspaceService: ICreateWorkspaceUseCase,
    private readonly listWorkspacesService: IListWorkspacesUseCase,
    private readonly getWorkspaceService: IGetWorkspaceUseCase,
    private readonly linkDataSourceService: ILinkDataSourceUseCase,
    private readonly unlinkDataSourceService: IUnlinkDataSourceUseCase,
    private readonly connectDataSourceService: IConnectDataSourceUseCase,
    private readonly disconnectDataSourceService: IDisconnectDataSourceUseCase,
    private readonly getCurrentUserService: IGetCurrentUserUseCase,
    private readonly markWorkspaceAsConfiguredService: IMarkWorkspaceAsConfiguredUseCase,
    private readonly updateWorkspaceIdentityService: IUpdateWorkspaceIdentityUseCase,
    private readonly deleteWorkspaceService: IDeleteWorkspaceUseCase,
  ) {}

  public async markWorkspaceAsConfigured(
    _event: IpcMainInvokeEvent,
    { body: { workspaceId } }: IRequest<MarkWorkspaceAsConfiguredInput>,
  ): Promise<ViewModel> {
    const result = await this.markWorkspaceAsConfiguredService.execute({
      workspaceId,
    })

    return createResponseViewModel(result)
  }

  public async create(
    _event: IpcMainInvokeEvent,
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
    _event: IpcMainInvokeEvent,
    { body }: IRequest<GetWorkspaceByIdRequest>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.getWorkspaceService.execute(body)

    return createResponseViewModel(result)
  }

  public async linkDataSource(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<LinkDataSourceRequest>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.linkDataSourceService.execute(body)

    return createResponseViewModel(result)
  }

  public async unlinkDataSource(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<UnlinkDataSourceRequest>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.unlinkDataSourceService.execute(body)

    return createResponseViewModel(result)
  }

  public async connectDataSource(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<ConnectDataSourceRequest>,
  ): Promise<ViewModel<ConnectionResultViewModel>> {
    const result = await this.connectDataSourceService.execute(body)

    return createResponseViewModel(result)
  }

  public async disconnectDataSource(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<DisconnectDataSourceRequest>,
  ): Promise<ViewModel<void>> {
    const result = await this.disconnectDataSourceService.execute(body)

    return createResponseViewModel(result)
  }

  public async getConnectionMember(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<GetConnectionMemberRequest>,
  ): Promise<ViewModel<MemberViewModel | null>> {
    const result = await this.getCurrentUserService.execute(body)

    return createResponseViewModel(result)
  }

  public async updateIdentity(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<UpdateWorkspaceIdentityInput>,
  ): Promise<ViewModel<WorkspaceViewModel>> {
    const result = await this.updateWorkspaceIdentityService.execute(body)

    return createResponseViewModel(result)
  }

  public async delete(
    _event: IpcMainInvokeEvent,
    { body }: IRequest<DeleteWorkspaceInput>,
  ): Promise<ViewModel<void>> {
    const result = await this.deleteWorkspaceService.execute(body)

    return createResponseViewModel(result)
  }
}
