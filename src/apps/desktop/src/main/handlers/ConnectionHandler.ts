import {
  getMemberStorageKey,
  IConnectDataSourceUseCase,
  ICredentialsStorage,
  IDisconnectDataSourceUseCase,
} from '@mr-tick/application'
import { createResponseViewModel } from '@mr-tick/shared/helpers'
import { IRequest } from '@mr-tick/shared/transport'
import {
  ConnectionResultViewModel,
  MemberViewModel,
  ViewModel,
} from '@mr-tick/shared/view-models'
import { IpcMainInvokeEvent } from 'electron'

import { HandlerBase } from '@/main/handlers/HandlerBase'

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

export class ConnectionHandler implements HandlerBase<ConnectionHandler> {
  constructor(
    private readonly connectDataSourceService: IConnectDataSourceUseCase,
    private readonly disconnectDataSourceService: IDisconnectDataSourceUseCase,
    private readonly credentialsStorage: ICredentialsStorage,
  ) {}

  public async connectDataSource(
    event: IpcMainInvokeEvent,
    { body }: IRequest<ConnectDataSourceRequest>,
  ): Promise<ViewModel<ConnectionResultViewModel>> {
    const result = await this.connectDataSourceService.execute({
      workspaceId: body.workspaceId,
      pluginId: body.pluginId,
      connectionInstanceId: body.connectionInstanceId,
      credentials: body.credentials,
      configuration: body.configuration,
    })

    return createResponseViewModel(result)
  }

  public async disconnectDataSource(
    event: IpcMainInvokeEvent,
    { body }: IRequest<DisconnectDataSourceRequest>,
  ): Promise<ViewModel<void>> {
    const result = await this.disconnectDataSourceService.execute({
      workspaceId: body.workspaceId,
      connectionInstanceId: body.connectionInstanceId,
    })

    return createResponseViewModel(result)
  }

  // DELETAR DEPOIS
  public async getConnectionMember(
    event: IpcMainInvokeEvent,
    { body }: IRequest<GetConnectionMemberRequest>,
  ): Promise<ViewModel<MemberViewModel | null>> {
    // Usamos o connectionInstanceId para garantir a chave única por conta
    const key = getMemberStorageKey(body.workspaceId, body.connectionInstanceId)

    let raw = await this.credentialsStorage.getToken('mr-tick', key)

    if (!raw) {
      // Fallback para chaves antigas se necessário, mas mantendo o foco na instância
      const legacyKey = `workspace-session-${body.workspaceId}-${body.connectionInstanceId}-member`
      raw = await this.credentialsStorage.getToken('mr-tick', legacyKey)
    }

    if (!raw) {
      return { isSuccess: true, statusCode: 200, data: null }
    }

    try {
      const member = JSON.parse(raw) as MemberViewModel
      return { isSuccess: true, statusCode: 200, data: member }
    } catch (e) {
      return { isSuccess: true, statusCode: 200, data: null }
    }
  }
}
