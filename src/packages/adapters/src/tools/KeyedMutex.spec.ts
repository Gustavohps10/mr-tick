import { describe, expect, it } from 'vitest'

import { KeyedMutex } from './KeyedMutex'

interface Deferred {
  promise: Promise<void>
  release: () => void
}

function createDeferred(): Deferred {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

describe('KeyedMutex', () => {
  it('should run operations of the same key one at a time and in order', async () => {
    const sut = new KeyedMutex()
    const events: string[] = []
    const gate = createDeferred()

    const first = sut.runExclusive('key', async () => {
      events.push('first:start')
      await gate.promise
      events.push('first:end')
    })
    const second = sut.runExclusive('key', async () => {
      events.push('second:start')
      events.push('second:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    gate.release()
    await Promise.all([first, second])

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  it('should run operations of different keys in parallel', async () => {
    const sut = new KeyedMutex()
    const events: string[] = []
    const gate = createDeferred()

    const blocked = sut.runExclusive('a', async () => {
      events.push('a:start')
      await gate.promise
    })
    const free = sut.runExclusive('b', async () => {
      events.push('b:start')
    })

    await free
    expect(events).toEqual(['a:start', 'b:start'])

    gate.release()
    await blocked
  })

  it('should keep the queue alive after an operation rejects', async () => {
    const sut = new KeyedMutex()

    const failing = sut.runExclusive('key', async () => {
      throw new Error('boom')
    })
    const following = sut.runExclusive('key', async () => 'ok')

    await expect(failing).rejects.toThrow('boom')
    await expect(following).resolves.toBe('ok')
  })

  it('should return the value produced by the operation', async () => {
    const sut = new KeyedMutex()

    const result = await sut.runExclusive('key', async () => 42)

    expect(result).toBe(42)
  })

  it('should let a late caller of an idle key start immediately', async () => {
    const sut = new KeyedMutex()
    await sut.runExclusive('key', async () => undefined)
    await Promise.resolve()

    const events: string[] = []
    await sut.runExclusive('key', async () => {
      events.push('ran')
    })

    expect(events).toEqual(['ran'])
  })
})
