import { AppError, Either } from '@mr-tick/shared/helpers'
import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import type { AddonLoader } from '@/main/services/addons/loader/AddonLoader'

import { AddonsHandler } from './AddonsHandler'

function createHandlerWithLoader(
  addonLoader: Partial<AddonLoader>,
): AddonsHandler {
  const fullLoader = {
    hasActiveAddon: vi.fn(() => true),
    ...addonLoader,
  }
  return new AddonsHandler(
    {} as ConstructorParameters<typeof AddonsHandler>[0],
    {} as ConstructorParameters<typeof AddonsHandler>[1],
    {} as ConstructorParameters<typeof AddonsHandler>[2],
    {} as ConstructorParameters<typeof AddonsHandler>[3],
    {} as ConstructorParameters<typeof AddonsHandler>[4],
    fullLoader as unknown as AddonLoader,
    {} as ConstructorParameters<typeof AddonsHandler>[6],
  )
}

const event = {} as IpcMainInvokeEvent

describe('AddonsHandler Settings & Operational Routes', () => {
  it('forwards resolveSettingsOptions to addonLoader and returns view model', async () => {
    const resolveSettingsOptions = vi
      .fn<AddonLoader['resolveSettingsOptions']>()
      .mockResolvedValue(
        Either.success({
          availability: 'available',
          options: [{ label: 'Option A', value: 'opt-a' }],
          hasMore: false,
        }),
      )
    const handler = createHandlerWithLoader({ resolveSettingsOptions })

    const res = await handler.resolveSettingsOptions(event, {
      body: {
        addonId: 'discord-observer',
        providerId: 'channels',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        fieldAddress: { path: [{ kind: 'field', fieldId: 'channel' }] },
        dependencies: [],
        draftValues: {},
        limit: 20,
      },
    })

    expect(resolveSettingsOptions).toHaveBeenCalledWith('discord-observer', {
      addonId: 'discord-observer',
      providerId: 'channels',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      fieldAddress: { path: [{ kind: 'field', fieldId: 'channel' }] },
      dependencies: [],
      draftValues: {},
      limit: 20,
    })
    expect(res.isSuccess).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.data?.options).toHaveLength(1)
    expect(res.data?.options[0]?.value).toBe('opt-a')
  })

  it('forwards getOperationalList to addonLoader', async () => {
    const getOperationalList = vi
      .fn<AddonLoader['getOperationalList']>()
      .mockResolvedValue(
        Either.success({
          items: [
            {
              itemId: 'item-1',
              title: 'Item 1',
              status: 'pending',
              timestamp: '2026-10-28T09:00:00.000Z',
              data: {},
              availableActions: [],
            },
          ],
          hasMore: false,
        }),
      )
    const handler = createHandlerWithLoader({ getOperationalList })

    const res = await handler.getOperationalList(event, {
      body: {
        addonId: 'discord-observer',
        providerId: 'active-voice-channels',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        limit: 10,
      },
    })

    expect(getOperationalList).toHaveBeenCalledWith('discord-observer', {
      addonId: 'discord-observer',
      providerId: 'active-voice-channels',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      limit: 10,
    })
    expect(res.isSuccess).toBe(true)
    expect(res.data?.items[0]?.itemId).toBe('item-1')
  })

  it('forwards executeOperationalAction to addonLoader and returns failure view model on error', async () => {
    const executeOperationalAction = vi
      .fn<AddonLoader['executeOperationalAction']>()
      .mockResolvedValue(Either.failure(AppError.NotFound('ACTION_NOT_FOUND')))
    const handler = createHandlerWithLoader({ executeOperationalAction })

    const res = await handler.executeOperationalAction(event, {
      body: {
        addonId: 'discord-observer',
        actionId: 'sync-now',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        providerId: 'pending-sessions',
        itemId: 'item-1',
      },
    })

    expect(executeOperationalAction).toHaveBeenCalledWith('discord-observer', {
      addonId: 'discord-observer',
      actionId: 'sync-now',
      scope: { kind: 'workspace', workspaceId: 'workspace-1' },
      providerId: 'pending-sessions',
      itemId: 'item-1',
    })
    expect(res.isSuccess).toBe(false)
    expect(res.statusCode).toBe(404)
    expect(res.error).toBe('ACTION_NOT_FOUND')
  })

  it('forwards evaluateSettingsForm to addonLoader', async () => {
    const evaluateSettingsForm = vi
      .fn<AddonLoader['evaluateSettingsForm']>()
      .mockResolvedValue(
        Either.success({
          fieldVisibility: [
            {
              address: { path: [{ kind: 'field', fieldId: 'channelId' }] },
              visible: true,
            },
          ],
        }),
      )
    const handler = createHandlerWithLoader({ evaluateSettingsForm })

    const res = await handler.evaluateSettingsForm(event, {
      body: {
        addonId: 'discord-observer',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        evaluatorId: 'visibility',
        draftValues: { enabled: true },
      },
    })

    expect(evaluateSettingsForm).toHaveBeenCalled()
    expect(res.isSuccess).toBe(true)
    expect(res.data?.fieldVisibility).toEqual([
      {
        address: { path: [{ kind: 'field', fieldId: 'channelId' }] },
        visible: true,
      },
    ])
  })

  it('forwards reapplySettings to addonLoader', async () => {
    const reapplySettings = vi
      .fn<AddonLoader['reapplySettings']>()
      .mockResolvedValue(
        Either.success({
          schemaVersion: 1,
          credentialStates: {},
          values: { enabled: true },
          revision: 2,
        }),
      )
    const handler = createHandlerWithLoader({ reapplySettings })

    const res = await handler.reapplySettings(event, {
      body: {
        addonId: 'discord-observer',
        scope: { kind: 'workspace', workspaceId: 'workspace-1' },
        revision: 1,
      },
    })

    expect(reapplySettings).toHaveBeenCalledWith(
      'discord-observer',
      { kind: 'workspace', workspaceId: 'workspace-1' },
      1,
    )
    expect(res.isSuccess).toBe(true)
    expect(res.data?.revision).toBe(2)
  })
})
