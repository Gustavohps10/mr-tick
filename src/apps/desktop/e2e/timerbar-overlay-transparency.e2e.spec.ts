import { expect, test } from './fixtures/electron-fixture'

test('widget stays transparent without centered workspace buttons when no workspace is selected', async ({
  electronApp,
  page,
}) => {
  await expect
    .poll(() =>
      electronApp
        .windows()
        .some((window) => window.url().includes('/widgets/timer')),
    )
    .toBe(true)
  const widget = electronApp
    .windows()
    .find((window) => window.url().includes('/widgets/timer'))
  expect(widget).toBeDefined()
  if (!widget) return

  await widget.evaluate(() => {
    localStorage.removeItem('mr-tick-timer-preferences')
    localStorage.setItem('vite-ui-theme', 'light')
    history.replaceState(null, '', '#/widgets/timer')
  })
  await widget.reload()
  await expect(widget.locator('html')).toHaveClass(/light/)
  await expect(widget.locator('body')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(widget.locator('html')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(widget.locator('#root')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(widget.getByRole('button')).toHaveCount(0)
  await expect(widget.locator('[data-widget-card]')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
})
