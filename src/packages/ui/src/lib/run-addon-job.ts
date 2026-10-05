import type { IHostBridge } from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import type { IJobEvent } from '@mr-tick/shared/transport'

// Subscribe before invoking IPC: a fast job can finish before acceptance returns.
export function runAddonJob(
  bridge: Pick<IHostBridge, 'addons' | 'events'>,
  addonId: string,
  downloadUrl: string,
  onProgress: (event: IJobEvent<string>) => void,
  operation: 'install' | 'update' = 'update',
): Promise<Either<AppError, void>> {
  const jobId = crypto.randomUUID()
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: Either<AppError, void>) => {
      if (settled) return
      settled = true
      unsubscribe()
      resolve(result)
    }
    const unsubscribe = bridge.events.on<IJobEvent<string>>(jobId, (event) => {
      if (settled) return
      onProgress(event)
      if (event.status === 'done') finish(Either.success())
      if (event.status === 'error')
        finish(Either.failure(AppError.Internal(event.error)))
    })
    const request =
      operation === 'update'
        ? bridge.addons.update({ body: { addonId, downloadUrl, jobId } })
        : bridge.addons.install({ body: { downloadUrl, jobId } })
    request.then(
      (response) => {
        if (!response.isSuccess) {
          finish(
            Either.failure(
              AppError.Http(
                response.statusCode,
                response.error ?? 'Falha ao processar addon.',
              ),
            ),
          )
          return
        }
        if (response.data?.jobId !== jobId) {
          finish(
            Either.failure(
              AppError.Internal(
                'Resposta inválida ao iniciar operação do addon.',
              ),
            ),
          )
        }
      },
      () =>
        finish(
          Either.failure(
            AppError.Internal('Falha de comunicação ao processar addon.'),
          ),
        ),
    )
  })
}
