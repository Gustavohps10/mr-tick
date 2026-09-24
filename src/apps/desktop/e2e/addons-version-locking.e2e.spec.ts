import { expect, test } from './fixtures/electron-fixture'

test.describe('E2E - Trava de Versão e Compatibilidade SemVer de Addons', () => {
  test('deve bloquear a seleção e instalação de pacotes com API incompatível na UI', async ({
    electronApp,
    page,
  }) => {
    // 1. Sobrescreve o handler IPC no processo Main do Electron para retornar catálogo de teste
    await electronApp.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('ADDONS_LIST_AVAILABLE')
      ipcMain.handle('ADDONS_LIST_AVAILABLE', async () => ({
        isSuccess: true,
        statusCode: 200,
        data: [
          {
            id: 'gustavohps10-redmine',
            name: 'Redmine',
            version: '0.1.1',
            categories: ['dataSource'],
            author: 'Gustavo Henrique',
            description:
              'Integration with Redmine to fetch projects, issues, users, and time entries',
            downloadUrl:
              'https://github.com/Gustavohps10/redmine-plugin/releases/download/v0.1.1/gustavohps10-redmine-0.1.1.tladdon',
            requiredApiVersion: '>=0.1.1',
            packages: [
              {
                version: '0.1.1',
                requiredApiVersion: '>=0.1.1',
                releaseDate: '2026-08-30',
                downloadUrl:
                  'https://github.com/Gustavohps10/redmine-plugin/releases/download/v0.1.1/gustavohps10-redmine-0.1.1.tladdon',
                changelog: ['Release 0.1.1 legado com API 0.1.x'],
              },
              {
                version: '0.1.0',
                requiredApiVersion: '>=0.1.0',
                releaseDate: '2026-08-29',
                downloadUrl:
                  'https://github.com/Gustavohps10/redmine-plugin/releases/download/v0.1.0/gustavohps10-redmine-0.1.0.tladdon',
                changelog: ['Release 0.1.0 legado com API 0.1.x'],
              },
            ],
          },
          {
            id: 'test-multi-version-addon',
            name: 'Plugin Híbrido E2E',
            version: '0.3.0',
            categories: ['dataSource'],
            author: 'E2E Tester',
            description: 'Plugin com versões legadas e compatíveis',
            downloadUrl: 'https://example.com/hybrid-0.3.0.tladdon',
            requiredApiVersion: '>=0.3.0',
            packages: [
              {
                version: '0.1.0',
                requiredApiVersion: '>=0.1.0',
                releaseDate: '2026-08-29',
                downloadUrl: 'https://example.com/hybrid-0.1.0.tladdon',
                changelog: ['Versão legada incompatível (>=0.1.0)'],
              },
              {
                version: '0.3.0',
                requiredApiVersion: '>=0.3.0',
                releaseDate: '2026-09-24',
                downloadUrl: 'https://example.com/hybrid-0.3.0.tladdon',
                changelog: ['Versão compatível com API atual (>=0.3.0)'],
              },
            ],
          },
        ],
        totalItems: 2,
        totalPages: 1,
        currentPage: 1,
      }))
    })

    // 2. Acessa o workspace padrão
    const workspaceLinks = page.locator('nav a[href*="/workspaces/"]')
    await expect(workspaceLinks.first()).toBeVisible({ timeout: 15000 })
    await workspaceLinks.first().click()

    // 3. Abre o modal de gerenciamento de addons
    const addonsButton = page.locator('button[aria-label="Gerenciar Addons"]')
    await expect(addonsButton.first()).toBeVisible({ timeout: 10000 })
    await addonsButton.first().click()

    // 4. Clica em "Explorar" para ver o catálogo de addons disponíveis
    const exploreTab = page.locator('button:has-text("Explorar")')
    await expect(exploreTab).toBeVisible({ timeout: 10000 })
    await exploreTab.click()

    // 5. Cenário 1: Addon legado (Redmine antigo da era 0.1.x)
    const redmineCard = page.locator('button:has-text("Redmine")')
    await expect(redmineCard).toBeVisible({ timeout: 10000 })
    await redmineCard.click()

    // Abre o modal de instalação
    const installBtn = page.locator('button:has-text("Instalar")')
    await expect(installBtn).toBeVisible({ timeout: 5000 })
    await installBtn.click()

    // Valida que o pacote legado exibe a badge "Incompatível"
    const incompatibleBadge = page.getByText('Incompatível', { exact: true })
    await expect(incompatibleBadge.first()).toBeVisible({ timeout: 5000 })

    // Valida que o botão "Confirmar e Instalar" está estritamente desabilitado para o Redmine antigo
    const confirmInstallBtn = page.locator(
      'button:has-text("Confirmar e Instalar")',
    )
    await expect(confirmInstallBtn).toBeDisabled()

    // Fecha o modal de instalação do cenário 1
    const cancelBtn = page.locator('button:has-text("Cancelar")')
    await cancelBtn.click()
    await expect(confirmInstallBtn).not.toBeVisible({ timeout: 5000 })

    // 6. Cenário 2: Addon Híbrido (possui v0.1.0 legada incompatível e v0.3.0 compatível)
    const hybridAddonCard = page.locator(
      'button:has-text("Plugin Híbrido E2E")',
    )
    await expect(hybridAddonCard).toBeVisible({ timeout: 5000 })
    await hybridAddonCard.click()

    // Abre o modal de instalação do plugin híbrido
    const hybridInstallBtn = page.locator('button:has-text("Instalar")')
    await expect(hybridInstallBtn).toBeVisible({ timeout: 5000 })
    await hybridInstallBtn.click()
    await expect(confirmInstallBtn).toBeVisible({ timeout: 5000 })

    // Valida que o pacote incompatível (v0.1.0) exibe a badge "Incompatível"
    await expect(incompatibleBadge.first()).toBeVisible({ timeout: 5000 })

    // Valida que a versão compatível (v0.3.0) foi selecionada automaticamente e o botão fica habilitado para ela
    await expect(confirmInstallBtn).toBeEnabled()
    await expect(confirmInstallBtn).toContainText('v0.3.0')

    // Tenta clicar no card incompatível (v0.1.0) e garante que a seleção NÃO muda
    const incompatibleCard = page.locator(
      '.cursor-not-allowed:has-text("v0.1.0")',
    )
    await expect(incompatibleCard).toBeVisible()
    await incompatibleCard.click({ force: true })

    // O botão ainda deve manter v0.3.0 selecionado e não v0.1.0
    await expect(confirmInstallBtn).toContainText('v0.3.0')
  })
})
