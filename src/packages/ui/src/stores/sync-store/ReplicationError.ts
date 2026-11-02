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

export function isReplicationUnauthorized(
  error: Error | RxError | null,
): boolean {
  return getReplicationFailures(error).some(
    (failure) => failure.statusCode === 401,
  )
}

export function isReplicationForbidden(error: Error | RxError | null): boolean {
  return getReplicationFailures(error).some(
    (failure) => failure.statusCode === 403,
  )
}

export interface ReplicationErrorExplanation {
  statusCode: number | null
  kind:
    | 'unauthorized'
    | 'forbidden'
    | 'not-found'
    | 'rate-limit'
    | 'server-error'
    | 'generic'
  shortLabel: string
  title: string
  description: string
  technicalDetails: string
}

export function explainReplicationError(
  error: Error | RxError | null,
  context?: 'pull' | 'push',
): ReplicationErrorExplanation {
  const failures = getReplicationFailures(error)
  const technicalDetails = getReplicationErrorMessage(error)

  for (const failure of failures) {
    if (failure.statusCode === 401) {
      return {
        statusCode: 401,
        kind: 'unauthorized',
        shortLabel: 'Login expirado (401)',
        title: 'Não autenticado (HTTP 401)',
        description:
          'O token ou credenciais de acesso expiraram ou são inválidos. Por favor, reconecte sua conta em Configurações > Conexões.',
        technicalDetails,
      }
    }

    if (failure.statusCode === 403) {
      return {
        statusCode: 403,
        kind: 'forbidden',
        shortLabel: 'Sem permissão (403)',
        title: 'Acesso negado (HTTP 403)',
        description:
          'Sua conta está conectada e válida, mas o servidor remoto negou acesso a este recurso (permissão insuficiente no provedor para visualizar ou gerenciar apontamentos/tarefas).',
        technicalDetails,
      }
    }

    if (failure.statusCode === 404) {
      return {
        statusCode: 404,
        kind: 'not-found',
        shortLabel: 'Não encontrado (404)',
        title: 'Recurso não encontrado (HTTP 404)',
        description:
          'O projeto, tarefa ou recurso configurado não foi encontrado no servidor remoto.',
        technicalDetails,
      }
    }

    if (failure.statusCode === 429) {
      return {
        statusCode: 429,
        kind: 'rate-limit',
        shortLabel: 'Limite de requisições (429)',
        title: 'Muitas requisições (HTTP 429)',
        description:
          'O servidor remoto limitou temporariamente as requisições (rate limit). A sincronização aguardará antes de tentar novamente.',
        technicalDetails,
      }
    }

    if (failure.statusCode >= 500) {
      return {
        statusCode: failure.statusCode,
        kind: 'server-error',
        shortLabel: `Servidor indisponível (${failure.statusCode})`,
        title: `Erro no servidor remoto (HTTP ${failure.statusCode})`,
        description:
          'O servidor remoto retornou erro interno ou instabilidade temporária.',
        technicalDetails,
      }
    }
  }

  const defaultAction =
    context === 'push' ? 'Erro no envio (push)' : 'Erro no recebimento (pull)'

  return {
    statusCode: null,
    kind: 'generic',
    shortLabel: defaultAction,
    title: defaultAction,
    description:
      'Ocorreu uma falha de comunicação ou processamento durante a sincronização.',
    technicalDetails,
  }
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
