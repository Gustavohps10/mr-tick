import type {
  ILocalRuntimeAPI,
  LocalRuntimeRequest,
  LocalRuntimeResponse,
  LocalRuntimeResult,
  TimeEntryRecordDTO,
} from '@mr-tick/application/local-runtime'
import { describe, expect, it } from 'vitest'

import {
  AddonRuntimeCapabilities,
  AddonTimerControlLock,
} from './AddonRuntimeCapabilities'

const entry: TimeEntryRecordDTO = {
  id: 'stable-entry',
  taskId: '77366',
  timeSpentSeconds: 60,
  pauseSeconds: 0,
  status: 'finished',
  source: 'addon',
  createdAt: '2026-10-08T12:00:00.000Z',
}
const result: LocalRuntimeResult = {
  entry,
  entries: [entry],
  timer: null,
  deleted: false,
}

class ReceiptRuntime implements ILocalRuntimeAPI {
  readonly calls: LocalRuntimeRequest[] = []
  readonly saved = new Map<string, LocalRuntimeResult>()
  loseFirstResponse = true
  mutations = 0

  async request(input: LocalRuntimeRequest): Promise<LocalRuntimeResponse> {
    this.calls.push(input)
    if (!('commandId' in input)) return { ok: true, value: result }
    const receipt = this.saved.get(input.commandId)
    if (receipt !== undefined) return { ok: true, value: receipt }
    this.mutations += 1
    this.saved.set(input.commandId, result)
    if (this.loseFirstResponse) {
      this.loseFirstResponse = false
      return {
        ok: false,
        error: { statusCode: 503, messageKey: 'RESPONSE_LOST' },
      }
    }
    return { ok: true, value: result }
  }
}

describe('AddonRuntimeCapabilities', () => {
  it('reuses caller command and entry identities after a lost post-commit response', async () => {
    const runtime = new ReceiptRuntime()
    const capabilities = new AddonRuntimeCapabilities(
      runtime,
      { id: 'official-addon', name: 'Official' },
      new AddonTimerControlLock(),
    )
    const operation = { commandId: 'stable-operation', entryId: 'stable-entry' }
    const payload = {
      taskId: '77366',
      timeSpentSeconds: 60,
      connectionInstanceId: 'redmine-client',
    }
    const first = await capabilities.timeEntries.create(
      'client-workspace',
      payload,
      operation,
    )
    expect(first.isFailure()).toBe(true)
    const repeated = await capabilities.timeEntries.create(
      'client-workspace',
      payload,
      operation,
    )
    expect(repeated.isSuccess()).toBe(true)
    expect(repeated.success.id).toBe('stable-entry')
    expect(runtime.mutations).toBe(1)
    expect(runtime.calls).toHaveLength(2)
    expect(runtime.calls.at(0)).toEqual(runtime.calls.at(1))
  })

  it('attributes source to the host addon identity instead of trusting payload origin', async () => {
    const runtime = new ReceiptRuntime()
    runtime.loseFirstResponse = false
    const capabilities = new AddonRuntimeCapabilities(
      runtime,
      { id: 'real-addon', name: 'Real' },
      new AddonTimerControlLock(),
    )
    await capabilities.timeEntries.createSuggestion(
      'workspace',
      {
        taskId: '77366',
        timeSpentSeconds: 60,
        addonSource: { id: 'forged-addon', name: 'Forged' },
        source: 'manual',
      },
      { commandId: 'command', entryId: 'entry' },
    )
    expect(runtime.calls.at(0)).toMatchObject({
      action: 'suggest',
      workspaceId: 'workspace',
      payload: {
        source: 'addon',
        addonSource: { id: 'real-addon', name: 'Real' },
      },
    })
  })

  it('enforces control lock and targets the caller-selected timer without extra queries', async () => {
    const runtime = new ReceiptRuntime()
    runtime.loseFirstResponse = false
    const lock = new AddonTimerControlLock()
    const first = new AddonRuntimeCapabilities(
      runtime,
      { id: 'first', name: 'First' },
      lock,
    )
    const second = new AddonRuntimeCapabilities(
      runtime,
      { id: 'second', name: 'Second' },
      lock,
    )
    await first.timer.requestControlLock()
    const denied = await second.timer.pause('workspace', {
      commandId: 'pause-command',
      entryId: 'timer-entry',
    })
    expect(denied.isFailure()).toBe(true)
    expect(runtime.calls).toHaveLength(0)
    await first.timer.pause('workspace', {
      commandId: 'pause-command',
      entryId: 'timer-entry',
    })
    expect(runtime.calls).toEqual([
      {
        action: 'timerPause',
        workspaceId: 'workspace',
        commandId: 'pause-command',
        entryId: 'timer-entry',
      },
    ])
  })

  it('preserves runtime failure status, message and field details', async () => {
    const runtime: ILocalRuntimeAPI = {
      request: async () => ({
        ok: false,
        error: {
          statusCode: 403,
          messageKey: 'ACCESS_DENIED_BY_PROVIDER',
          details: { task: ['original detail'] },
        },
      }),
    }
    const capabilities = new AddonRuntimeCapabilities(
      runtime,
      { id: 'addon', name: 'Addon' },
      new AddonTimerControlLock(),
    )
    const failed = await capabilities.timeEntries.list('workspace')
    expect(failed.isFailure()).toBe(true)
    expect(failed.failure.messageKey).toBe('ACCESS_DENIED_BY_PROVIDER')
    expect(failed.failure.statusCode).toBe(403)
    expect(failed.failure.details).toEqual({ task: ['original detail'] })
  })
})
