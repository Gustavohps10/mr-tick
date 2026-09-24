import type {
  DirectLogTimeDTO,
  StartTimerDTO,
  TimerResumeDTO,
  TimerStateDTO,
} from '@mr-tick/application'
import type { AppError, Either } from '@mr-tick/shared/helpers'

export type { DirectLogTimeDTO, StartTimerDTO, TimerResumeDTO, TimerStateDTO }
export type ActiveTimeEntryDTO = TimerStateDTO
export type StartTimerPayload = StartTimerDTO
export type DirectLogPayload = DirectLogTimeDTO

export interface ITimerAPI {
  getActiveEntry(): Promise<Either<AppError, TimerStateDTO | null>>
  requestControlLock(): Promise<Either<AppError, boolean>>
  releaseControlLock(): Promise<Either<AppError, void>>
  isControlLockHeld(): Promise<Either<AppError, boolean>>
  start(payload?: StartTimerDTO): Promise<Either<AppError, void>>
  pause(): Promise<Either<AppError, void>>
  resume(payload?: TimerResumeDTO): Promise<Either<AppError, void>>
  stop(): Promise<Either<AppError, void>>
  logTime(payload: DirectLogTimeDTO): Promise<Either<AppError, void>>
}
