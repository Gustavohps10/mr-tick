import type { AddonLoadFailuresSnapshot } from '@mr-tick/shared/view-models'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAddonLoadFailures } from './use-addon-load-failures'

vi.mock('@/hooks/use-host-bridge')

import { useHostBridge } from '@/hooks/use-host-bridge'

describe('useAddonLoadFailures race condition & revision monotonicity', () => {
  it('applies pull snapshot initially', async () => {
    let getFailuresResolve: (val: any) => void = () => {}
    const getFailuresPromise = new Promise((resolve) => {
      getFailuresResolve = resolve
    })

    const mockHostBridge = {
      events: {
        on: vi.fn(),
      },
      addons: {
        getLoadFailures: vi.fn().mockReturnValue(getFailuresPromise),
      },
    }

    vi.mocked(useHostBridge).mockReturnValue(mockHostBridge as any)

    const { result } = renderHook(() => useAddonLoadFailures())

    expect(result.current.failures).toEqual([])
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      getFailuresResolve({
        isSuccess: true,
        data: {
          revision: 1,
          failures: [
            {
              addonId: 'test-addon',
              folderPath: '/path',
              stage: 'import',
              reason: 'IMPORT_FAILED',
              technicalMessage: 'syntax error',
              timestamp: 1000,
            },
          ],
        },
      })
    })

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].addonId).toBe('test-addon')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('ignores older pull if newer push has already arrived', async () => {
    let pushHandler: ((snapshot: AddonLoadFailuresSnapshot) => void) | undefined

    const mockHostBridge = {
      events: {
        on: vi.fn((event: string, handler: any) => {
          if (event === 'addons:load-failures-changed') {
            pushHandler = handler
          }
          return () => {}
        }),
      },
      addons: {
        getLoadFailures: vi.fn().mockImplementation(async () => {
          // Pull atrasado com revisão 1
          return {
            isSuccess: true,
            data: {
              revision: 1,
              failures: [
                {
                  addonId: 'old-addon',
                  folderPath: '/old',
                  stage: 'import',
                  reason: 'IMPORT_FAILED',
                  technicalMessage: 'old error',
                  timestamp: 500,
                },
              ],
            },
          }
        }),
      },
    }

    vi.mocked(useHostBridge).mockReturnValue(mockHostBridge as any)

    const { result } = renderHook(() => useAddonLoadFailures())

    // Simula push mais recente chegando primeiro com revisão 2
    act(() => {
      if (pushHandler) {
        pushHandler({
          revision: 2,
          failures: [
            {
              addonId: 'new-addon',
              folderPath: '/new',
              stage: 'activate',
              reason: 'INITIALIZATION_FAILED',
              technicalMessage: 'init error',
              timestamp: 2000,
            },
          ],
        })
      }
    })

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].addonId).toBe('new-addon')
  })

  it('handles getLoadFailures rejection and reports isError and errorMessage', async () => {
    const mockHostBridge = {
      events: {
        on: vi.fn(() => () => {}),
      },
      addons: {
        getLoadFailures: vi
          .fn()
          .mockRejectedValue(new Error('IPC invoke connection lost')),
      },
    }

    vi.mocked(useHostBridge).mockReturnValue(mockHostBridge as any)

    const { result } = renderHook(() => useAddonLoadFailures())

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.errorMessage).toBe('IPC invoke connection lost')
    expect(result.current.failures).toEqual([])
  })
})
