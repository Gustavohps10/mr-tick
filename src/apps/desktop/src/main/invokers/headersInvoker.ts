import { IHeadersAPI } from '@mr-tick/application'
import { IHeaders } from '@mr-tick/shared/transport'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const headersInvoker: IHeadersAPI = {
  setDefaultHeaders: (headers: IHeaders): void =>
    IpcInvoker.setDefaultHeaders(headers),
  getDefaultHeaders: (): IHeaders => IpcInvoker.getDefaultHeaders(),
}
