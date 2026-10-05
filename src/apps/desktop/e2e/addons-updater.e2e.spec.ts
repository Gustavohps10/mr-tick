import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Atualizador de Addons & Notificações de Versão', () => {
  test('deve detectar nova versão disponível, exibir notificação toast, badge e disparar atualização com sucesso', async ({
    electronApp,
    page,
  }) => {
    let updatePayloadReceived: { addonId: string; downloadUrl: string } | null =
      null

    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ADDONS_LIST_INSTALLED')
      ipcMain.handle('ADDONS_LIST_INSTALLED', async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: 'mr-tick-datasource-redmine',
            name: 'Redmine Integration',
            version: '0.7.0',
            creator: 'Community',
            description: 'Plugin Redmine legado v0.7.0',
            category: 'integrations',
            categories: ['dataSource'],
            installed: true,
            path: './addons/mr-tick-datasource-redmine/0.7.0',
            logo: '',
            downloads: 50,
            stars: 5,
          },
        ],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      }))

      ipcMain.removeHandler('ADDONS_LIST_AVAILABLE')
      ipcMain.handle('ADDONS_LIST_AVAILABLE', async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: 'mr-tick-datasource-redmine',
            name: 'Redmine Integration',
            version: '0.8.0',
            creator: 'Community',
            description: 'Plugin Redmine atualizado v0.8.0',
            category: 'integrations',
            categories: ['dataSource'],
            downloadUrl: 'https://example.com/redmine-0.8.0.tladdon',
            requiredApiVersion: '>=0.8.0',
            installed: false,
            path: '',
            logo: '',
            downloads: 120,
            stars: 5,
            changelog: ['Melhorias de estabilidade e hot-reload'],
          },
        ],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      }))

      ipcMain.removeHandler('ADDONS_UPDATE')
      ipcMain.handle('ADDONS_UPDATE', async (_event, req) => {
        ;(
          globalThis as unknown as { lastUpdatePayload: unknown }
        ).lastUpdatePayload = req?.body
        return {
          isSuccess: true,
          statusCode: 200,
          data: { jobId: 'job-update-123' },
        }
      })
    })

    // 1. Acessa o workspace padrão
    const workspaceLinks = page.locator('nav a[href*="/workspaces/"]')
    await expect(workspaceLinks.first()).toBeVisible({ timeout: 15000 })
    await workspaceLinks.first().click()

    // 2. Abre o modal de gerenciamento de addons
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    // 3. Valida a exibição do badge de atualização na lista de addons
    const updateBadge = page.locator(
      '[data-testid="addon-update-badge-mr-tick-datasource-redmine"]',
    )
    await expect(updateBadge.first()).toBeVisible({ timeout: 10000 })
    await expect(updateBadge.first()).toHaveText('Atualização')

    // 4. Seleciona o addon na lista para abrir a coluna de detalhes
    const addonBrowseCard = page.locator(
      '[data-testid="addon-browse-card-mr-tick-datasource-redmine"]',
    )
    await expect(addonBrowseCard).toBeVisible({ timeout: 5000 })
    await addonBrowseCard.click()

    // 5. Clica no botão de atualizar nos detalhes
    const updateButton = page.locator(
      '[data-testid="addon-update-btn-mr-tick-datasource-redmine"]',
    )
    await expect(updateButton.first()).toBeVisible({ timeout: 5000 })
    await updateButton.first().click()

    // 6. Valida que o payload IPC foi enviado corretamente ao Main Process
    updatePayloadReceived = await electronApp.evaluate(() => {
      return (
        globalThis as unknown as {
          lastUpdatePayload: { addonId: string; downloadUrl: string }
        }
      ).lastUpdatePayload
    })

    expect(updatePayloadReceived).not.toBeNull()
    expect(updatePayloadReceived?.addonId).toBe('mr-tick-datasource-redmine')
    expect(updatePayloadReceived?.downloadUrl).toBe(
      'https://example.com/redmine-0.8.0.tladdon',
    )

    // 7. Valida o toast de sucesso
    await expect(
      page.getByText('Plugin atualizado com sucesso!').first(),
    ).toBeVisible({
      timeout: 10000,
    })
  })

  test('deve tratar falha na atualização exibindo toast de erro', async ({
    electronApp,
    page,
  }) => {
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ADDONS_LIST_INSTALLED')
      ipcMain.handle('ADDONS_LIST_INSTALLED', async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: 'mr-tick-datasource-failing',
            name: 'Plugin com Falha',
            version: '1.0.0',
            creator: 'Tester',
            description: 'Plugin para teste de erro',
            category: 'integrations',
            categories: ['dataSource'],
            installed: true,
            path: './addons/mr-tick-datasource-failing/1.0.0',
            logo: '',
            downloads: 1,
            stars: 1,
          },
        ],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      }))

      ipcMain.removeHandler('ADDONS_LIST_AVAILABLE')
      ipcMain.handle('ADDONS_LIST_AVAILABLE', async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: 'mr-tick-datasource-failing',
            name: 'Plugin com Falha',
            version: '1.1.0',
            creator: 'Tester',
            description: 'Plugin para teste de erro',
            category: 'integrations',
            categories: ['dataSource'],
            downloadUrl: 'https://example.com/failing-1.1.0.tladdon',
            requiredApiVersion: '>=1.0.0',
            installed: false,
            path: '',
            logo: '',
            downloads: 2,
            stars: 1,
          },
        ],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      }))

      ipcMain.removeHandler('ADDONS_UPDATE')
      ipcMain.handle('ADDONS_UPDATE', async () => ({
        isSuccess: false,
        statusCode: 500,
        error: 'FALHA_AO_ATIVAR_NOVA_VERSAO',
      }))
    })

    const workspaceLinks = page.locator('nav a[href*="/workspaces/"]')
    await expect(workspaceLinks.first()).toBeVisible({ timeout: 15000 })
    await workspaceLinks.first().click()

    // Abre o modal de gerenciamento de addons
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    // Clica na aba "Atualizações" do gerenciador
    const updatesTab = page.locator(
      '[data-testid="addons-manager-tab-updates"]',
    )
    await expect(updatesTab).toBeVisible({ timeout: 10000 })
    await updatesTab.click()

    // Clica no botão de atualizar do addon na lista de atualizações
    const updateBtn = page.locator(
      '[data-testid="addon-update-btn-mr-tick-datasource-failing"]',
    )
    await expect(updateBtn.first()).toBeVisible({ timeout: 10000 })
    await updateBtn.first().click()

    // O toast de erro deve ser exibido com a mensagem de falha
    await expect(
      page.getByText('FALHA_AO_ATIVAR_NOVA_VERSAO').first(),
    ).toBeVisible({
      timeout: 10000,
    })
  })
})
