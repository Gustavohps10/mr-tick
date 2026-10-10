import { ICredentialsVault } from '@mr-tick/application'
import { IRequest } from '@mr-tick/shared/transport'
import { ViewModel } from '@mr-tick/shared/view-models'

import { HandlerBase } from '@/main/handlers/HandlerBase'

export interface TokenRequest {
  service: string
  account: string
  token?: string
}

export class TokenHandler implements HandlerBase<TokenHandler> {
  constructor(private readonly credentialsVault: ICredentialsVault) {}

  public async saveToken(
    _event: Electron.IpcMainInvokeEvent,
    { body: { service, account, token } }: IRequest<TokenRequest>,
  ): Promise<ViewModel> {
    try {
      if (!token) {
        return {
          statusCode: 500,
          isSuccess: false,
          error: 'Token is required',
          data: undefined,
        }
      }

      await this.credentialsVault.saveToken(service, account, token)

      return {
        statusCode: 200,
        isSuccess: true,
        data: undefined,
      }
    } catch {
      return {
        statusCode: 500,
        isSuccess: false,
        error: 'Failed to save the token',
        data: undefined,
      }
    }
  }

  public async getToken(
    _event: Electron.IpcMainInvokeEvent,
    { body: { service, account } }: IRequest<TokenRequest>,
  ): Promise<ViewModel<string | null>> {
    try {
      const token = await this.credentialsVault.getToken(service, account)
      return {
        statusCode: 200,
        isSuccess: true,
        data: token,
      }
    } catch {
      return {
        statusCode: 500,
        isSuccess: false,
        error: 'Failed to get the token',
        data: null,
      }
    }
  }

  public async deleteToken(
    _event: Electron.IpcMainInvokeEvent,
    { body: { service, account } }: IRequest<TokenRequest>,
  ): Promise<ViewModel<void>> {
    try {
      await this.credentialsVault.deleteToken(service, account)

      return {
        statusCode: 200,
        isSuccess: true,
        data: undefined,
      }
    } catch {
      return {
        statusCode: 500,
        isSuccess: false,
        error: 'Failed to delete the token',
        data: undefined,
      }
    }
  }
}
