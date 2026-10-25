import { createServer } from 'node:http'

import type { JsonValue } from '@mr-tick/application'
import { afterEach, describe, expect, it } from 'vitest'

import { HttpClient } from './HttpClient'

const closeServers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closeServers.splice(0)) await close()
})

async function server(status: number, body: string) {
  const urls: string[] = []
  const instance = createServer((request, response) => {
    if (request.url) urls.push(request.url)
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(body)
  })
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve))
  closeServers.push(
    () =>
      new Promise<void>((resolve, reject) =>
        instance.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        }),
      ),
  )
  const address = instance.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing HTTP server address')
  return {
    client: new HttpClient({ baseURL: `http://127.0.0.1:${address.port}` }),
    urls,
  }
}

describe('HTTP adapter contract over a real local HTTP server', () => {
  it('passes numeric and boolean request parameters, including zero and false', async () => {
    const { client, urls } = await server(200, 'null')
    const result = await client.get('/feed', {
      params: { since: 123, startAt: 0, notifyUsers: false },
      responseValidator: (value: JsonValue): value is null => value === null,
    })
    expect(result.isSuccess()).toBe(true)
    const received = urls.at(0)
    if (!received) throw new Error('No HTTP request received')
    const query = new URL(received, 'http://test').searchParams
    expect(query.get('since')).toBe('123')
    expect(query.get('startAt')).toBe('0')
    expect(query.get('notifyUsers')).toBe('false')
  })
  it('normalizes a bodyless JSON response to null', async () => {
    const { client } = await server(204, '')
    const result = await client.delete('/worklog', {
      responseValidator: (value: JsonValue): value is null => value === null,
    })
    expect(result.isSuccess()).toBe(true)
    expect(result.success).toBeNull()
  })
  it('uses the explicit error message decoder', async () => {
    const { client } = await server(422, '{"messageKey":"WORKLOG_NOT_ALLOWED"}')
    const options = {
      responseValidator: (value: JsonValue): value is null => value === null,
      readErrorMessage: (value: JsonValue): string | undefined => {
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          typeof value.messageKey === 'string'
        )
          return value.messageKey
        return undefined
      },
    }
    const result = await client.get('/error', options)
    expect(result.failure.messageKey).toBe('WORKLOG_NOT_ALLOWED')
  })
})
