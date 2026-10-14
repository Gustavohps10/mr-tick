import type { IHostBridge, WorkspaceViewModel } from '@mr-tick/application'

export function createDemoWorkspace(
  template: WorkspaceViewModel,
): WorkspaceViewModel {
  return { ...template, id: crypto.randomUUID() }
}

export function createDemoSession(
  template: WorkspaceViewModel,
  bridge: IHostBridge,
) {
  const workspace = createDemoWorkspace(template)
  const workspaceResult = () => ({
    isSuccess: true,
    statusCode: 200,
    data: workspace,
  })
  const sessionBridge: IHostBridge = {
    ...bridge,
    workspaces: {
      ...bridge.workspaces,
      getById: async () => workspaceResult(),
      listAll: async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [workspace],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      }),
      create: async () => workspaceResult(),
      updateIdentity: async () => workspaceResult(),
      linkDataSource: async () => workspaceResult(),
      unlinkDataSource: async () => workspaceResult(),
    },
  }
  return { workspace, bridge: sessionBridge }
}
