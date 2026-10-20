import { createServer, type IncomingMessage, type Server } from 'node:http'

import { z } from 'zod'

import { expect, test } from './fixtures/electron-fixture'

interface ObservedRequest {
  method: string
  url: string
  authorization: string | undefined
  apiKey: string | undefined
  cookie: string | undefined
  body: string
}

interface LocalServer {
  server: Server
  requests: ObservedRequest[]
  origin: string
}

const probeResponseSchema = z
  .object({
    outcomes: z.array(
      z.object({
        name: z.string(),
        isSuccess: z.boolean(),
        statusCode: z.number().nullable(),
        message: z.string(),
        diagnosticCode: z.string(),
        bodyMatches: z.boolean(),
      }),
    ),
    logsContainSecret: z.boolean(),
  })
  .strict()

test('T01 Electron main transport isolates A→B→A, redirects, cookies, IPC and logs', async ({
  page,
}) => {
  const requestsA: ObservedRequest[] = []
  const requestsB: ObservedRequest[] = []
  let originB = ''

  const serverA = createServer(async (request, response) => {
    const observed = await observeRequest(request)
    requestsA.push(observed)
    respond(observed, response, originB, 'server-a')
  })
  const serverB = createServer(async (request, response) => {
    const observed = await observeRequest(request)
    requestsB.push(observed)
    respond(observed, response, '', 'server-b')
  })

  const portA = await listen(serverA)
  const portB = await listen(serverB)
  const localA: LocalServer = {
    server: serverA,
    requests: requestsA,
    origin: `http://127.0.0.1:${portA}`,
  }
  const localB: LocalServer = {
    server: serverB,
    requests: requestsB,
    origin: `http://127.0.0.1:${portB}`,
  }
  originB = localB.origin

  try {
    const rawResult = await page.evaluate(
      async (origins) =>
        window.electron.ipcRenderer.invoke('test:http-transport-t01', origins),
      { originA: localA.origin, originB: localB.origin },
    )
    const result = probeResponseSchema.parse(rawResult)

    expect(
      result.outcomes.map((outcome) => outcome.isSuccess),
      JSON.stringify({
        outcomes: result.outcomes,
        requestsA: requestsA.map((request) => request.url),
        requestsB: requestsB.map((request) => request.url),
      }),
    ).toEqual([true, true, true, true, true, true, false, true, true])
    expect(result.outcomes.map((outcome) => outcome.bodyMatches)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
    ])
    expect(JSON.stringify(result)).not.toContain('sentinel-secret')
    expect(JSON.stringify(result)).not.toContain('api-key-A')
    expect(JSON.stringify(result)).not.toContain('api-key-B')

    expect(
      requestsA.filter((request) => request.url === '/prefix-a/resource'),
    ).toHaveLength(2)
    expect(
      requestsB.filter((request) => request.url === '/prefix-b/resource'),
    ).toHaveLength(1)
    for (const request of requestsA.filter(
      (item) => item.url === '/prefix-a/resource',
    )) {
      expect(request.authorization).toBe('Bearer authorization-A')
      expect(request.apiKey).toBe('api-key-A')
    }
    for (const request of requestsB.filter(
      (item) => item.url === '/prefix-b/resource',
    )) {
      expect(request.authorization).toBe('Bearer authorization-B')
      expect(request.apiKey).toBe('api-key-B')
    }

    const sameOriginTarget = requestsA.find(
      (request) => request.url === '/prefix-a/redirect-same-target',
    )
    expect(sameOriginTarget?.apiKey).toBe('api-key-A')
    expect(sameOriginTarget?.cookie).toBe('explicit-cookie-secret')
    const crossOriginTarget = requestsB.find(
      (request) => request.url === '/prefix-b/redirect-cross-target',
    )
    expect(crossOriginTarget?.authorization).toBeUndefined()
    expect(crossOriginTarget?.apiKey).toBeUndefined()
    expect(crossOriginTarget?.cookie).toBeUndefined()

    const cookieProbe = requestsA.find(
      (request) => request.url === '/prefix-a/cookie-probe',
    )
    expect(cookieProbe?.cookie).toBeUndefined()
    const errorOutcome = result.outcomes.find(
      (outcome) => outcome.name === 'http-error',
    )
    expect(errorOutcome?.statusCode).toBe(500)
    expect(errorOutcome?.message).toBe('HTTP 500')
    expect(result.logsContainSecret).toBe(false)

    const post303Target = requestsA.find(
      (request) => request.url === '/prefix-a/redirect-post-303-target',
    )
    expect(post303Target?.method).toBe('GET')
    expect(post303Target?.body).toBe('')
    const post307Target = requestsA.find(
      (request) => request.url === '/prefix-a/redirect-post-307-target',
    )
    expect(post307Target?.method).toBe('POST')
    expect(post307Target?.body).toBe('{"payload":"body-307"}')
  } finally {
    await close(localA.server)
    await close(localB.server)
  }
})

async function observeRequest(
  request: IncomingMessage,
): Promise<ObservedRequest> {
  let method = ''
  let url = ''
  if (request.method !== undefined) method = request.method
  if (request.url !== undefined) url = request.url
  const body = await new Promise<string>((resolve) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
  return {
    method,
    url,
    authorization: header(request, 'authorization'),
    apiKey: header(request, 'x-api-key'),
    cookie: header(request, 'cookie'),
    body,
  }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  if (typeof value !== 'string') return undefined
  return value
}

function respond(
  request: ObservedRequest,
  response: import('node:http').ServerResponse,
  redirectOrigin: string,
  serverName: string,
): void {
  const url = request.url
  if (
    url === '/prefix-a/redirect-same' ||
    url === '/prefix-a/redirect-same-target'
  ) {
    if (url.endsWith('redirect-same')) {
      response.writeHead(302, { Location: '/prefix-a/redirect-same-target' })
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ target: 'same-origin' }))
    return
  }
  if (url === '/prefix-a/redirect-cross') {
    response.writeHead(302, {
      Location: `${redirectOrigin}/prefix-b/redirect-cross-target`,
    })
    response.end()
    return
  }
  if (url === '/prefix-a/redirect-post-303') {
    response.writeHead(303, {
      Location: '/prefix-a/redirect-post-303-target',
    })
    response.end()
    return
  }
  if (url === '/prefix-a/redirect-post-307') {
    response.writeHead(307, {
      Location: '/prefix-a/redirect-post-307-target',
    })
    response.end()
    return
  }
  if (url === '/prefix-a/redirect-post-303-target') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ target: 'post-303' }))
    return
  }
  if (url === '/prefix-a/redirect-post-307-target') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ target: 'post-307' }))
    return
  }
  if (url === '/prefix-b/redirect-cross-target') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ target: 'cross-origin' }))
    return
  }
  if (url === '/prefix-a/cookie-probe') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        cookiePresent: request.cookie !== undefined,
      }),
    )
    return
  }
  if (url.startsWith('/prefix-a/error')) {
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ secret: 'sentinel-secret' }))
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ source: serverName }))
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  expect(address).not.toBeNull()
  if (address === null)
    return expect.fail('LOCAL_HTTP_SERVER_ADDRESS_UNAVAILABLE')
  if (typeof address === 'string')
    return expect.fail('LOCAL_HTTP_SERVER_ADDRESS_INVALID')
  return address.port
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
