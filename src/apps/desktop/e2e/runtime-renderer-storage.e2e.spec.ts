import type { ElectronApplication, Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'

async function findRuntimeWindow(
  electronApp: ElectronApplication,
): Promise<Page | null> {
  for (const page of await electronApp.windows()) {
    const browserWindow = await electronApp.browserWindow(page)
    const isRuntime = await browserWindow.evaluate(
      (window) => window.windowType === 'runtime',
    )
    await browserWindow.dispose()
    if (isRuntime) return page
  }
  return null
}

async function readProbe(
  page: Page,
  databaseName: string,
): Promise<string | null> {
  return page.evaluate(async (name) => {
    return new Promise<string | null>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => {
        request.transaction?.abort()
        reject(new Error('STORAGE_PROBE_DATABASE_NOT_FOUND'))
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('probe', 'readonly')
        const result = transaction.objectStore('probe').get('value')
        let value: string | null = null
        result.onsuccess = () => {
          if (typeof result.result === 'string') value = result.result
        }
        transaction.onerror = () => reject(transaction.error)
        transaction.oncomplete = () => {
          database.close()
          resolve(value)
        }
      }
    })
  }, databaseName)
}

test.describe('Runtime renderer - origem e lifecycle do IndexedDB', () => {
  test.use({ electronNodeEnv: 'production' })

  test('executor oculto acessa IndexedDB da janela principal após reload', async ({
    electronApp,
    page,
  }) => {
    await expect
      .poll(async () => (await findRuntimeWindow(electronApp)) !== null)
      .toBe(true)
    const runtime = await findRuntimeWindow(electronApp)
    if (!runtime) throw new Error('RUNTIME_WINDOW_NOT_FOUND')
    await runtime.waitForLoadState('domcontentloaded')

    const principalDocument = new URL(page.url())
    const runtimeDocument = new URL(runtime.url())
    principalDocument.hash = ''
    runtimeDocument.hash = ''
    expect(runtimeDocument.href).toBe(principalDocument.href)
    expect(runtimeDocument.protocol).toBe('file:')

    const runtimeWindow = await electronApp.browserWindow(runtime)
    expect(await runtimeWindow.evaluate((window) => window.isVisible())).toBe(
      false,
    )
    await runtimeWindow.dispose()

    const databaseName = await page.evaluate(
      () => `runtime-probe-${crypto.randomUUID()}`,
    )
    await page.evaluate(async (name) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1)
        request.onerror = () => reject(request.error)
        request.onupgradeneeded = () =>
          request.result.createObjectStore('probe')
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('probe', 'readwrite')
          transaction.objectStore('probe').put('preserved', 'value')
          transaction.onerror = () => reject(transaction.error)
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
        }
      })
    }, databaseName)

    expect(await readProbe(runtime, databaseName)).toBe('preserved')
    await runtime.reload({ waitUntil: 'domcontentloaded' })
    expect(await readProbe(runtime, databaseName)).toBe('preserved')
  })
})
