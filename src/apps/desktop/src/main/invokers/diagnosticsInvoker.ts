import type { IDiagnosticsAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const diagnosticsInvoker: IDiagnosticsAPI = {
  getSnapshot: () => IpcInvoker.invoke('DIAGNOSTICS_GET_SNAPSHOT'),
  runChecks: () => IpcInvoker.invoke('DIAGNOSTICS_RUN_CHECKS'),
  generateReport: () => IpcInvoker.invoke('DIAGNOSTICS_GENERATE_REPORT'),
  openDataDirectory: () => IpcInvoker.invoke('DIAGNOSTICS_OPEN_DATA_DIRECTORY'),
}
