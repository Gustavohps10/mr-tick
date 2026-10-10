import type { CoreRuntimeState } from './CoreContext'

export interface ICoreRuntimeAPI {
  getState(): CoreRuntimeState
  /** Receives the current state immediately, then subsequent changes. */
  onStateChanged(listener: (state: CoreRuntimeState) => void): () => void
}
