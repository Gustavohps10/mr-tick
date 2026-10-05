import { SyncFailureViewModel } from '@mr-tick/shared/view-models'
import { RxError } from 'rxdb'
import { z } from 'zod'

const failureSchema = z.object({
  messageKey: z.string(),
  details: z.record(z.array(z.string())).optional(),
  statusCode: z.number(),
})
const causeSchema = z.object({
  message: z.string().optional(),
  messageKey: z.string().optional(),
  statusCode: z.number().optional(),
  status: z.number().optional(),
  extensions: z.object({ failures: z.array(failureSchema) }).optional(),
})
const wrapperSchema = z.object({
  parameters: z.object({
    errors: z.union([causeSchema, z.array(causeSchema)]),
  }),
})

function failuresFromCause(
  cause: z.infer<typeof causeSchema>,
): SyncFailureViewModel[] {
  if (cause.extensions) return cause.extensions.failures
  const status =
    cause.statusCode !== undefined ? cause.statusCode : cause.status
  const message =
    cause.messageKey !== undefined ? cause.messageKey : cause.message
  if (status === undefined || message === undefined) return []
  return [{ statusCode: status, messageKey: message }]
}

/** RxDB keeps extensions when it serializes an Error into RC_PUSH/RC_PULL. */
export class ReplicationError extends Error {
  public readonly extensions: { failures: SyncFailureViewModel[] }

  constructor(
    message: string,
    public readonly failures: SyncFailureViewModel[] = [],
  ) {
    super(message)
    this.name = 'ReplicationError'
    this.extensions = { failures }
  }

  get requiresAuthentication(): boolean {
    return this.failures.some(
      (failure) => failure.statusCode === 401 || failure.statusCode === 403,
    )
  }
}

export function getReplicationFailures(
  error: Error | RxError | null,
): SyncFailureViewModel[] {
  if (!error) return []
  const direct = causeSchema.safeParse(error)
  if (direct.success) {
    const failures = failuresFromCause(direct.data)
    if (failures.length > 0) return failures
  }
  const wrapped = wrapperSchema.safeParse(error)
  if (!wrapped.success) return []
  const causes = wrapped.data.parameters.errors
  if (!Array.isArray(causes)) return failuresFromCause(causes)
  return causes.flatMap(failuresFromCause)
}

export function isReplicationAuthError(error: Error | RxError | null): boolean {
  return getReplicationFailures(error).some(
    (failure) => failure.statusCode === 401 || failure.statusCode === 403,
  )
}

export function getReplicationErrorMessage(
  error: Error | RxError | null,
): string {
  if (!error) return ''
  const failures = getReplicationFailures(error)
  if (failures.length === 0) return error.message
  return failures
    .map((failure) => {
      const details = failure.details
        ? Object.entries(failure.details).map(
            ([field, messages]) => field + ': ' + messages.join(', '),
          )
        : []
      if (details.length === 0) return failure.messageKey
      return failure.messageKey + ' (' + details.join('; ') + ')'
    })
    .join('; ')
}
