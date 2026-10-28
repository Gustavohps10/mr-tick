import { ipcMain } from 'electron'

import { IpcChannels } from '@/main/IpcChannels'

export class IpcHandler {
  static handle<T>(
    channel: keyof typeof IpcChannels,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<T>,
  ): void {
    ipcMain.handle(channel, handler)
  }

  static register<TRequest = any, TResponse = any>(
    channel: keyof typeof IpcChannels,
    middlewaresOrHandler:
      | Array<Middleware<TRequest, TResponse>>
      | ((
          event: Electron.IpcMainInvokeEvent,
          request: TRequest,
        ) => Promise<TResponse>),
    maybeHandler?: (
      event: Electron.IpcMainInvokeEvent,
      request: TRequest,
    ) => Promise<TResponse>,
  ): void {
    if (Array.isArray(middlewaresOrHandler) && maybeHandler) {
      const handlerWithMiddleware = withMiddleware(
        maybeHandler,
        middlewaresOrHandler,
      )
      this.handle(channel, handlerWithMiddleware)
      return
    }

    if (typeof middlewaresOrHandler === 'function') {
      this.handle(channel, middlewaresOrHandler)
      return
    }

    throw new Error('Invalid arguments for IpcHandler.register')
  }
}

function withMiddleware<TRequest, TResponse>(
  handler: (
    event: Electron.IpcMainInvokeEvent,
    request: TRequest,
  ) => Promise<TResponse>,
  middlewares: Array<Middleware<TRequest, TResponse>>,
): (
  event: Electron.IpcMainInvokeEvent,
  request: TRequest,
) => Promise<TResponse> {
  return (event, request) => {
    let index = -1

    const dispatch = (i: number): Promise<TResponse> => {
      if (i <= index) throw new Error('next() called multiple times')
      index = i

      const middleware = middlewares[i]
      if (!middleware) return handler(event, request)

      return middleware(event, request, () => dispatch(i + 1))
    }

    return dispatch(0)
  }
}

type Middleware<TRequest, TResponse> = (
  event: Electron.IpcMainInvokeEvent,
  request: TRequest,
  next: () => Promise<TResponse>,
) => Promise<TResponse>
