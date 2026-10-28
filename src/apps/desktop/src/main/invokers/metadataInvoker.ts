import { IMetadataAPI } from '@mr-tick/application'

import { IpcInvoker } from '@/main/adapters/IpcInvoker'

export const metadataInvoker: IMetadataAPI = {
  pull: (payload) => IpcInvoker.invoke('METADATA_PULL', payload),
}
