import { EMPTY_HTTP_CONFIG, type JsonValue } from '@mr-tick/adapters/contracts'
import type { AppError, Either } from '@mr-tick/shared/helpers'
import { app, ipcMain, session, type WebContents } from 'electron'

import {
  DefaultElectronFetchTransport,
  ElectronHttpClientFactory,
} from '@/main/adapters/ElectronHttpClient'

interface ProbeRequest {
  originA: string
  originB: string
}

interface ProbeOutcome {
  name: string
  isSuccess: boolean
  statusCode: number | null
  message: string
  diagnosticCode: string
  bodyMatches: boolean
}

type BodyMatcher = (value: JsonValue) => boolean

interface ProbeResponse {
  outcomes: ProbeOutcome[]
  logsContainSecret: boolean
}

type ConsoleArgument =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Error
  | object

export function registerElectronHttpTransportTestProbe(
  getMainWindowContents: () => WebContents | null,
): void {
  if (app.isPackaged) return
  if (process.env.PLAYWRIGHT_TEST !== '1') return
  ipcMain.handle(
    'test:http-transport-t01',
    async (event, rawRequest: JsonValue): Promise<ProbeResponse> => {
      const expectedSender = getMainWindowContents()
      if (expectedSender === null) return emptyProbeResponse()
      if (event.sender !== expectedSender) return emptyProbeResponse()
      const request = parseProbeRequest(rawRequest)
      if (request === undefined) return emptyProbeResponse()
      return executeProbe(request)
    },
  )
}

async function executeProbe(request: ProbeRequest): Promise<ProbeResponse> {
  let logsContainSecret = false
  const originalLog = console.log
  const originalError = console.error
  console.log = (...values: ConsoleArgument[]) => {
    for (const value of values) {
      const line = formatConsoleArgument(value)
      if (containsProbeSecret(line)) logsContainSecret = true
    }
  }
  console.error = (...values: ConsoleArgument[]) => {
    for (const value of values) {
      const line = formatConsoleArgument(value)
      if (containsProbeSecret(line)) logsContainSecret = true
    }
  }

  try {
    await session.defaultSession.cookies.set({
      url: request.originA,
      name: 'ambient_probe',
      value: 'ambient-cookie-secret',
    })
    const factory = new ElectronHttpClientFactory(
      EMPTY_HTTP_CONFIG,
      new DefaultElectronFetchTransport(),
    )
    const clientA = factory.createClient({
      baseURL: `${request.originA}/prefix-a`,
      headers: {
        Authorization: 'Bearer authorization-A',
        'X-API-Key': 'api-key-A',
      },
      sensitiveHeaders: ['X-API-Key'],
    })
    const clientB = factory.createClient({
      baseURL: `${request.originB}/prefix-b`,
      headers: {
        Authorization: 'Bearer authorization-B',
        'X-API-Key': 'api-key-B',
      },
      sensitiveHeaders: ['X-API-Key'],
    })

    const outcomes: ProbeOutcome[] = []
    outcomes.push(
      await outcome('a-first', clientA, '/resource', {}, (value) =>
        matchesField(value, 'source', 'server-a'),
      ),
    )
    outcomes.push(
      await outcome('b-middle', clientB, '/resource', {}, (value) =>
        matchesField(value, 'source', 'server-b'),
      ),
    )
    outcomes.push(
      await outcome('a-last', clientA, '/resource', {}, (value) =>
        matchesField(value, 'source', 'server-a'),
      ),
    )
    outcomes.push(
      await outcome(
        'same-redirect',
        clientA,
        '/redirect-same',
        {
          Cookie: 'explicit-cookie-secret',
        },
        (value) => matchesField(value, 'target', 'same-origin'),
      ),
    )
    outcomes.push(
      await outcome(
        'cross-redirect',
        clientA,
        '/redirect-cross',
        {
          Cookie: 'explicit-cookie-secret',
        },
        (value) => matchesField(value, 'target', 'cross-origin'),
      ),
    )
    outcomes.push(
      await outcome('ambient-cookie', clientA, '/cookie-probe', {}, (value) =>
        matchesField(value, 'cookiePresent', false),
      ),
    )
    outcomes.push(
      await outcome('http-error', clientA, '/error', {}, () => false),
    )
    outcomes.push(
      await postOutcome(
        'post-303',
        clientA,
        '/redirect-post-303',
        { payload: 'body-303' },
        (value) => matchesField(value, 'target', 'post-303'),
      ),
    )
    outcomes.push(
      await postOutcome(
        'post-307',
        clientA,
        '/redirect-post-307',
        { payload: 'body-307' },
        (value) => matchesField(value, 'target', 'post-307'),
      ),
    )

    return { outcomes, logsContainSecret }
  } finally {
    console.log = originalLog
    console.error = originalError
  }
}

async function outcome(
  name: string,
  client: ReturnType<ElectronHttpClientFactory['createClient']>,
  url: string,
  headers: Record<string, string>,
  matchesBody: BodyMatcher,
): Promise<ProbeOutcome> {
  const result = await client.get<JsonValue>(url, {
    headers,
    responseValidator: isJsonValue,
  })
  return toOutcome(name, result, matchesBody)
}

async function postOutcome(
  name: string,
  client: ReturnType<ElectronHttpClientFactory['createClient']>,
  url: string,
  body: Record<string, string>,
  matchesBody: BodyMatcher,
): Promise<ProbeOutcome> {
  const result = await client.post<JsonValue>(url, body, {
    responseValidator: isJsonValue,
  })
  return toOutcome(name, result, matchesBody)
}

function toOutcome(
  name: string,
  result: Either<AppError, JsonValue>,
  matchesBody: BodyMatcher,
): ProbeOutcome {
  if (result.isFailure()) {
    return {
      name,
      isSuccess: false,
      statusCode: result.failure.statusCode,
      message: `HTTP ${result.failure.statusCode}`,
      diagnosticCode: safeDiagnosticCode(result.failure.messageKey),
      bodyMatches: false,
    }
  }
  return {
    name,
    isSuccess: true,
    statusCode: null,
    message: 'OK',
    diagnosticCode: 'NONE',
    bodyMatches: matchesBody(result.success),
  }
}

function matchesField(
  value: JsonValue,
  field: string,
  expectedValue: string | boolean,
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  return value[field] === expectedValue
}

function safeDiagnosticCode(messageKey: string): string {
  const networkError = messageKey.match(/ERR_[A-Z0-9_]+/)
  if (networkError !== null) return networkError[0]
  if (messageKey === 'HTTP_TOO_MANY_REDIRECTS') return 'HTTP_TOO_MANY_REDIRECTS'
  return 'INTERNAL_TRANSPORT_ERROR'
}

function isJsonValue(value: JsonValue): value is JsonValue {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    Array.isArray(value) ||
    typeof value === 'object'
  )
}

function parseProbeRequest(value: JsonValue): ProbeRequest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined
  const originAValue = value.originA
  const originBValue = value.originB
  if (typeof originAValue !== 'string' || typeof originBValue !== 'string')
    return undefined
  const originA = parseLocalOrigin(originAValue)
  const originB = parseLocalOrigin(originBValue)
  if (originA === undefined || originB === undefined) return undefined
  return { originA, originB }
}

function formatConsoleArgument(value: ConsoleArgument): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    try {
      const serialized = JSON.stringify(value)
      if (serialized !== undefined) return serialized
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function emptyProbeResponse(): ProbeResponse {
  return { outcomes: [], logsContainSecret: false }
}

function containsProbeSecret(value: string): boolean {
  return (
    value.includes('authorization-A') ||
    value.includes('api-key-A') ||
    value.includes('authorization-B') ||
    value.includes('api-key-B') ||
    value.includes('sentinel-secret') ||
    value.includes('explicit-cookie-secret') ||
    value.includes('ambient-cookie-secret')
  )
}

function parseLocalOrigin(value: string): string | undefined {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:') return undefined
    if (parsed.hostname !== '127.0.0.1') return undefined
    if (parsed.pathname !== '/' || parsed.search || parsed.hash)
      return undefined
    return parsed.origin
  } catch {
    return undefined
  }
}
