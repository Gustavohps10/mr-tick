import { expect, type Locator, type Page } from '@playwright/test'

type SyncStatus =
  | 'initializing'
  | 'local_only'
  | 'auth_error'
  | 'technical_error'
  | 'reconciling'
  | 'syncing'
  | 'pulling'
  | 'pushing'
  | 'pending_connections'
  | 'synced'

export function syncStatusIndicator(page: Page, status: SyncStatus): Locator {
  return page
    .getByTestId('sync-status-indicator')
    .and(page.locator(`[data-status="${status}"]`))
}

export async function expectSyncStatus(
  page: Page,
  status: SyncStatus,
  options?: { timeout?: number },
): Promise<void> {
  await expect(page.getByTestId('sync-status-indicator')).toHaveAttribute(
    'data-status',
    status,
    options,
  )
}

export async function closeSyncDiagnostics(page: Page): Promise<void> {
  const drawer = page.getByTestId('addons-diagnostics-drawer')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(drawer).not.toBeVisible()
}
