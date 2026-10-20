import { IWorkspacesAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const workspacesInvoker: IWorkspacesAPI = {
  create: (request) => IpcInvoker.invoke('WORKSPACES_CREATE', request),
  getById: (request) => IpcInvoker.invoke('WORKSPACES_GET_BY_ID', request),
  listAll: () => IpcInvoker.invoke('WORKSPACES_GET_ALL'),

  linkDataSource: (request) =>
    IpcInvoker.invoke('WORKSPACES_LINK_DATASOURCE', request),
  unlinkDataSource: (request) =>
    IpcInvoker.invoke('WORKSPACES_UNLINK_DATASOURCE', request),
  submitCredentials: (request) =>
    IpcInvoker.invoke('WORKSPACES_SUBMIT_CONNECTION_CREDENTIALS', request),
  disconnectDataSource: (request) =>
    IpcInvoker.invoke('WORKSPACES_DISCONNECT_DATASOURCE', request),
  markWorkspaceAsConfigured: (request) =>
    IpcInvoker.invoke('WORKSPACES_MARK_AS_CONFIGURED', request),
  updateIdentity: (request) =>
    IpcInvoker.invoke('WORKSPACES_UPDATE_IDENTITY', request),
  delete: (request) => IpcInvoker.invoke('WORKSPACES_DELETE', request),
}
