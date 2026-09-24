import { expect, test } from './fixtures/electron-fixture'

test.describe('Desktop Electron Smoke Test', () => {
  test('deve iniciar a aplicacao e exibir a janela principal', async ({
    page,
  }) => {
    const title = await page.title()
    expect(title).toBeDefined()

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})
