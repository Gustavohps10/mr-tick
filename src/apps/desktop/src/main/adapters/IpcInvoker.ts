import { IHeaders, IRequest } from '@mr-tick/shared/transport'
import { ipcRenderer } from 'electron'

import { IpcChannels } from '@/main/IpcChannels'

export class IpcInvoker {
  private static defaultHeaders: IHeaders = {}

  static async invoke<Req extends IRequest<any>, Res>(
    channel: keyof typeof IpcChannels,
    payload?: Req,
  ): Promise<Res> {
    const request = payload ?? ({ body: {} } as IRequest<any>)
    const updatedRequest = await this.requestInterceptor(request)

    return ipcRenderer.invoke(channel, updatedRequest)
  }

  private static async requestInterceptor(requestOptions: any) {
    requestOptions.headers = {
      ...this.defaultHeaders,
      ...(requestOptions.headers ?? {}),
    }
    return requestOptions
  }

  static setDefaultHeaders(headers: IHeaders) {
    Object.assign(this.defaultHeaders, headers)
  }

  static getDefaultHeaders() {
    return { ...this.defaultHeaders }
  }
}
