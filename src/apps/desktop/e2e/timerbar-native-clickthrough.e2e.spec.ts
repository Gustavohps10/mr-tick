import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/electron-fixture'
import { NativeHarnessClient } from './harness/native-harness-client'

const currentDir = dirname(fileURLToPath(import.meta.url))
const seedWorkspaces: Array<{
  id: string
  name: string
  status: string
  dataSourceConnections: Array<{ dataSourceId: string }>
}> = JSON.parse(
  readFileSync(resolve(currentDir, 'fixtures/seed-workspaces.json'), 'utf-8'),
)

async function openWorkspace(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  const actionTrigger = page.getByTestId('time-entry-actions-trigger').first()
  if (await actionTrigger.isVisible().catch(() => false)) {
    return
  }

  const fakeWorkspace = seedWorkspaces.find((workspace) =>
    workspace.dataSourceConnections.some(
      (connection) => connection.dataSourceId === 'mr-tick-datasource-fake',
    ),
  )
  expect(fakeWorkspace).toBeDefined()
  if (!fakeWorkspace) return

  const workspaceTrigger = page
    .locator('nav a[href*="/workspaces/' + fakeWorkspace.id + '"]')
    .or(page.getByRole('button', { name: fakeWorkspace.name, exact: false }))
    .or(page.locator('nav a[href*="/workspaces/"]'))
    .first()

  if (await workspaceTrigger.isVisible().catch(() => false)) {
    await workspaceTrigger.click()
  } else {
    await expect(workspaceTrigger.or(actionTrigger)).toBeVisible({
      timeout: 20000,
    })
    if (await workspaceTrigger.isVisible().catch(() => false)) {
      await workspaceTrigger.click()
    }
  }

  await expect(actionTrigger).toBeVisible({ timeout: 30000 })
}

test.describe('Timerbar Native Win32 Click-Through & Focus Contract', () => {
  let harnessClient: NativeHarnessClient | null = null

  test.beforeEach(async () => {
    harnessClient = new NativeHarnessClient()
    await harnessClient.start()
  })

  test.afterEach(async () => {
    if (harnessClient) {
      await harnessClient.stop()
      harnessClient = null
    }
  })

  test('validação nativa Win32 com SendInput: click-through em região transparente vs contenção nos controles', async ({
    electronApp,
    page,
  }, testInfo) => {
    test.setTimeout(120000)
    expect(harnessClient).not.toBeNull()
    if (!harnessClient) return

    // 1. Abre workspace e aguarda o widget Electron carregar
    await openWorkspace(page)
    await expect
      .poll(
        () =>
          electronApp
            .windows()
            .filter((window) => window.url().includes('/widgets/timer')).length,
      )
      .toBe(1)

    const widget = electronApp
      .windows()
      .find((window) => window.url().includes('/widgets/timer'))
    expect(widget).toBeDefined()
    if (!widget) return

    // Aguarda barra visual estar visível
    const barElement = widget.locator('[data-widget-card]').first()
    await expect(barElement).toBeVisible({ timeout: 30000 })

    const barBox = await barElement.boundingBox()
    expect(barBox).not.toBeNull()
    if (!barBox) return

    const widgetHwndStr = await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (win) => win.windowType === 'widget',
      )
      if (!w) return null
      return w.getNativeWindowHandle().readBigUInt64LE(0).toString()
    })
    expect(widgetHwndStr).not.toBeNull()
    const widgetHwnd = Number(widgetHwndStr)

    const dpr = await widget.evaluate(() => window.devicePixelRatio || 1)
    const toPhysical = (box: {
      x: number
      y: number
      width: number
      height: number
    }) => ({
      x: Math.round((box.x + box.width / 2) * dpr),
      y: Math.round((box.y + box.height / 2) * dpr),
    })

    // 2. Prepara janela Win32 de teste posicionada imediatamente atrás do overlay
    const transparentX = Math.round((barBox.x + barBox.width / 2) * dpr)
    const transparentY = Math.max(100, Math.round((barBox.y - 200) * dpr))

    const testWin = await harnessClient.createWindow({
      x: transparentX - 200,
      y: transparentY - 100,
      width: 400,
      height: 300,
      title: 'MrTick-Native-Underlay-Target',
      show: true,
    })
    expect(testWin.status).toBe('ok')
    expect(testWin.hwnd).toBeGreaterThan(0)

    // Posiciona a janela de teste imediatamente atrás da janela secundária do Electron
    await harnessClient.setWindowPos({
      hwnd: testWin.hwnd,
      x: transparentX - 200,
      y: transparentY - 100,
      width: 400,
      height: 300,
      zOrder: 'behind_hwnd',
      targetHwnd: widgetHwnd,
    })

    // Observa separadamente os eventos de mouse e pointer realmente entregues ao renderer.
    await widget.evaluate(() => {
      const trace: string[] = []
      const recordMove = (
        event: MouseEvent | PointerEvent,
        eventType: 'mouse' | 'pointer',
      ) => {
        const target = event.target
        const interactive =
          target instanceof Element &&
          Boolean(
            target.closest(
              '[data-widget-card], [data-widget-interactive], [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"]',
            ),
          )
        trace.push(
          `${eventType}:${interactive ? 'interactive' : 'transparent'}`,
        )
        document.documentElement.dataset.nativeHoverTrace = trace.join(',')
      }
      document.addEventListener(
        'pointermove',
        (event) => recordMove(event, 'pointer'),
        true,
      )
      document.addEventListener(
        'mousemove',
        (event) => recordMove(event, 'mouse'),
        true,
      )
    })

    // 3. CENÁRIO 1: click-through natural, sem alterar ignoreMouseEvents pelo teste.
    await harnessClient.clearEvents()
    const stagingX = transparentX - 30
    await harnessClient.sendMouseInput({
      action: 'move',
      x: stagingX,
      y: transparentY,
    })
    await expect
      .poll(() =>
        harnessClient
          ?.getWindowAtPoint(stagingX, transparentY)
          .then((windowAtPoint) => windowAtPoint.isTestWindow),
      )
      .toBe(true)
    await harnessClient.sendMouseInput({
      action: 'move',
      x: transparentX,
      y: transparentY,
    })
    await expect
      .poll(() =>
        harnessClient
          ?.getWindowAtPoint(transparentX, transparentY)
          .then((windowAtPoint) => windowAtPoint.isTestWindow),
      )
      .toBe(true)
    await expect
      .poll(() =>
        widget.evaluate(() =>
          document.documentElement.dataset.nativeHoverTrace?.endsWith(
            'transparent',
          ),
        ),
      )
      .toBe(true)
    await harnessClient.clearEvents()
    await harnessClient.sendMouseInput({
      action: 'click',
      x: transparentX,
      y: transparentY,
      button: 'left',
    })
    await expect
      .poll(() =>
        harnessClient
          ?.getEvents()
          .then((events) =>
            events.events.some((event) => event.type === 'lbuttondown'),
          ),
      )
      .toBe(true)
    const passThroughEvents = await harnessClient.getEvents()
    const downEv = passThroughEvents.events.find(
      (event) => event.type === 'lbuttondown',
    )
    const upEv = passThroughEvents.events.find(
      (event) => event.type === 'lbuttonup',
    )
    expect(downEv).toBeDefined()
    expect(upEv).toBeDefined()

    // 4. CENÁRIO 2: Destino Correto do Clique Nativo, Mudança de Estado e Contenção
    // Clica especificamente no botão de visão geral via SendInput para abrir o popover nativamente
    const overviewBtn = widget.getByTestId('timerbar-overview-button')
    await expect(overviewBtn).toBeVisible({ timeout: 10000 })
    const overviewBox = await overviewBtn.boundingBox()
    expect(overviewBox).not.toBeNull()
    if (!overviewBox) return
    const overviewPt = toPhysical(overviewBox)
    const controlX = overviewPt.x
    const controlY = overviewPt.y

    await harnessClient.clearEvents()

    // Entrada natural: aguarda o hit-test nativo trocar o underlay pelo widget.
    await harnessClient.sendMouseInput({
      action: 'move',
      x: controlX,
      y: controlY,
    })
    await expect
      .poll(() =>
        harnessClient
          ?.getWindowAtPoint(controlX, controlY)
          .then((windowAtPoint) => windowAtPoint.isTestWindow),
      )
      .toBe(false)
    await expect
      .poll(() =>
        widget.evaluate(() =>
          document.documentElement.dataset.nativeHoverTrace?.endsWith(
            'interactive',
          ),
        ),
      )
      .toBe(true)

    await harnessClient.sendMouseInput({
      action: 'click',
      x: controlX,
      y: controlY,
      button: 'left',
    })

    // Falha se o clique Win32 não abrir o popover; não há fallback Playwright.
    await expect(widget.getByTestId('overview-tab-list')).toBeVisible({
      timeout: 10000,
    })

    // Comprova que nenhum clique vazou para a janela Win32 de trás
    const postControlEvents = await harnessClient.getEvents()
    const leakedClicks = postControlEvents.events.filter(
      (e) => e.type === 'lbuttondown',
    ).length
    expect(leakedClicks).toBe(0)

    // Clica nativamente na aba semanal via SendInput para comprovar interatividade do popover
    const weeklyTab = widget.getByTestId('overview-tab-weekly')
    await expect(weeklyTab).toBeVisible({ timeout: 10000 })
    const weeklyBox = await weeklyTab.boundingBox()
    expect(weeklyBox).not.toBeNull()
    if (weeklyBox) {
      const weeklyPt = toPhysical(weeklyBox)
      await harnessClient.clearEvents()
      // Injeta clique nativo com SendInput no interior do popover
      await harnessClient.sendMouseInput({
        action: 'click',
        x: weeklyPt.x,
        y: weeklyPt.y,
        button: 'left',
      })

      // Comprova contenção: nenhum clique no popover vazou para a janela Win32 de trás
      const popoverEvents = await harnessClient.getEvents()
      expect(
        popoverEvents.events.filter((e) => e.type === 'lbuttondown'),
      ).toHaveLength(0)
      // O SendInput deve ativar a classe de seleção sem completar a ação via DOM.
      await expect(weeklyTab).toHaveClass(/bg-primary/)
      await expect(
        widget.getByRole('columnheader', { name: 'Total', exact: true }),
      ).toBeVisible({ timeout: 10000 })
    }

    // Fecha o popover com Escape
    await widget.keyboard.press('Escape')
    await expect(widget.getByTestId('overview-tab-list')).not.toBeVisible({
      timeout: 5000,
    })

    // 5. CENÁRIO 3: 20 ciclos rápidos reais de entrada/saída, sem forçar IPC.
    let totalTransitionLeaks = 0
    let successfulEntries = 0
    let successfulExits = 0
    for (let cycle = 0; cycle < 20; cycle++) {
      await harnessClient.sendMouseInput({
        action: 'move',
        x: transparentX,
        y: transparentY,
      })
      await expect
        .poll(() =>
          harnessClient
            ?.getWindowAtPoint(transparentX, transparentY)
            .then((windowAtPoint) => windowAtPoint.isTestWindow),
        )
        .toBe(true)
      successfulExits += 1
      await harnessClient.sendMouseInput({
        action: 'click',
        x: transparentX,
        y: transparentY,
        button: 'left',
      })
      await expect
        .poll(() =>
          harnessClient
            ?.getEvents()
            .then((events) =>
              events.events.some((event) => event.type === 'lbuttondown'),
            ),
        )
        .toBe(true)
      await harnessClient.clearEvents()

      await harnessClient.sendMouseInput({
        action: 'move',
        x: controlX,
        y: controlY,
      })
      await expect
        .poll(() =>
          harnessClient
            ?.getWindowAtPoint(controlX, controlY)
            .then((windowAtPoint) => windowAtPoint.isTestWindow),
        )
        .toBe(false)
      successfulEntries += 1
      await expect
        .poll(() =>
          widget.evaluate(() =>
            document.documentElement.dataset.nativeHoverTrace?.endsWith(
              'interactive',
            ),
          ),
        )
        .toBe(true)

      await harnessClient.sendMouseInput({
        action: 'click',
        x: controlX,
        y: controlY,
        button: 'left',
      })
      await expect(widget.getByTestId('overview-tab-list')).toBeVisible()
      const cycleEvents = await harnessClient.getEvents()
      totalTransitionLeaks += cycleEvents.events.filter(
        (event) => event.type === 'lbuttondown',
      ).length
      await widget.keyboard.press('Escape')
      await expect(widget.getByTestId('overview-tab-list')).not.toBeVisible()
      await harnessClient.clearEvents()
    }
    expect(totalTransitionLeaks).toBe(0)
    expect(successfulEntries).toBe(20)
    expect(successfulExits).toBe(20)
    const hoverTrace = await widget.evaluate(() =>
      (document.documentElement.dataset.nativeHoverTrace ?? '').split(','),
    )
    expect(hoverTrace).toContain('pointer:transparent')
    expect(hoverTrace).toContain('pointer:interactive')

    // Fecha eventual popover aberto pelos ciclos rápidos
    await widget.keyboard.press('Escape')

    // Fecha o popover com Escape
    await widget.keyboard.press('Escape')

    // 7. CENÁRIO 5: Contrato de Foco e WS_EX_NOACTIVATE
    const fgBefore = await harnessClient.getForegroundWindow()
    expect(fgBefore.status).toBe('ok')
    expect(fgBefore.hwnd).toBeGreaterThan(0)

    // Clica no controle com SendInput
    await harnessClient.sendMouseInput({
      action: 'click',
      x: controlX,
      y: controlY,
      button: 'left',
    })
    await new Promise((r) => setTimeout(r, 80))

    const fgAfter = await harnessClient.getForegroundWindow()
    expect(fgAfter.status).toBe('ok')
    expect(fgAfter.hwnd).toBe(fgBefore.hwnd) // HWND em primeiro plano É EXATAMENTE IDÊNTICO
    expect(fgAfter.isTestWindow).toBe(fgBefore.isTestWindow)

    // 8. CENÁRIO 6: Interceptação de Teclado Ativa e Repasse de Alt+Tab (DR-02 / Addon C++)
    const interceptionActiveBefore = await electronApp.evaluate(() => {
      globalThis.nativeOverlayInstance?.startKeyboardInterception?.()
      return (
        globalThis.nativeOverlayInstance?.isKeyboardInterceptionActive?.() ??
        false
      )
    })
    expect(interceptionActiveBefore).toBe(true)

    // Dispara Alt+Tab com hook ativo e exige uma troca real de foreground.
    const altTabForegroundBefore = await harnessClient.getForegroundWindow()
    expect(altTabForegroundBefore.status).toBe('ok')
    const altTabRes = await harnessClient.sendAltTab()
    expect(altTabRes.status).toBe('ok')
    await expect
      .poll(() =>
        harnessClient
          ?.getForegroundWindow()
          .then((foreground) => foreground.hwnd),
      )
      .not.toBe(altTabForegroundBefore.hwnd)
    const altTabForegroundAfter = await harnessClient.getForegroundWindow()
    expect(altTabForegroundAfter.hwnd).not.toBe(altTabForegroundBefore.hwnd)

    // 9. CENÁRIO 7: Reposicionamento Multi-Monitor Real e Hit-Testing no Segundo Monitor (GEO-03)
    const sysInfo = await harnessClient.getSystemInfo()
    const secondaryMon = sysInfo.monitors.find((m) => !m.isPrimary)
    let multiMonitorSuccess = false
    if (secondaryMon) {
      const mon2X = secondaryMon.left + 200
      const mon2Y = secondaryMon.top + 200

      // Reposiciona o widget no segundo monitor
      await electronApp.evaluate(
        ({ BrowserWindow }, { x, y }) => {
          const w = BrowserWindow.getAllWindows().find(
            (win) => win.windowType === 'widget',
          )
          if (w && !w.isDestroyed()) {
            w.setPosition(x, y)
          }
        },
        { x: mon2X, y: mon2Y },
      )
      await new Promise((r) => setTimeout(r, 100))

      // Reposiciona a janela de teste de trás no segundo monitor
      await harnessClient.setWindowPos({
        hwnd: testWin.hwnd,
        x: mon2X,
        y: mon2Y,
        width: 400,
        height: 300,
        zOrder: 'behind_hwnd',
        targetHwnd: widgetHwnd,
      })
      await widget.evaluate(() => {
        window.api?.system?.setIgnoreMouseEvents?.({
          body: { ignore: true, forward: true },
        })
      })
      await harnessClient.clearEvents()

      // Injeta clique nativo na região transparente no segundo monitor (DPI 96)
      await harnessClient.sendMouseInput({
        action: 'click',
        x: mon2X + 150,
        y: mon2Y + 200,
        button: 'left',
      })
      await new Promise((r) => setTimeout(r, 100))

      const mon2Events = await harnessClient.getEvents()
      const mon2Click = mon2Events.events.find((e) => e.type === 'lbuttondown')
      multiMonitorSuccess = Boolean(mon2Click)
      expect(multiMonitorSuccess).toBe(true)
    }

    // 10. CENÁRIO 8: Fechamento Limpo do Widget e Desalocação Observável de Hooks
    await electronApp.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(
        (win) => win.windowType === 'widget',
      )
      if (w && !w.isDestroyed()) {
        w.close()
      }
    })
    await new Promise((r) => setTimeout(r, 200))

    // Confirma que a janela fechou
    const activeWidgetWindows = await electronApp.evaluate(
      ({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().filter(
          (win) => win.windowType === 'widget' && !win.isDestroyed(),
        ).length
      },
    )
    expect(activeWidgetWindows).toBe(0)

    // A interceptação deve ficar inativa após fechar; o estado de instalação
    // do hook não é exposto pelo addon e não pode ser alegado como verificado.
    const interceptionInactiveAfterClose = await electronApp.evaluate(() => {
      return (
        globalThis.nativeOverlayInstance?.isKeyboardInterceptionActive?.() ===
        false
      )
    })
    expect(interceptionInactiveAfterClose).toBe(true)
    const report = {
      timestamp: new Date().toISOString(),
      system: sysInfo,
      scenarios: {
        clickThroughTransparentOverlay: {
          status: 'PASS',
          coordinates: { x: transparentX, y: transparentY },
          receivedEventsCount: passThroughEvents.count,
          receivedEvents: passThroughEvents.events,
        },
        clickContainmentOnControls: {
          status: 'PASS',
          coordinates: { x: controlX, y: controlY },
          leakedClicksCount: leakedClicks,
        },
        rapidTransitionAntiFlicker: {
          status: 'PASS',
          method:
            'native SendInput moves with natural pointer events, renderer IPC, and Win32 hit-testing',
          cycles: 20,
          successfulEntries,
          successfulExits,
          pointerEventCount: hoverTrace.filter((event) =>
            event.startsWith('pointer:'),
          ).length,
          leakedClicksCount: totalTransitionLeaks,
          trace: hoverTrace.slice(-80),
        },
        popoverInteractivityAndContainment: {
          status: 'PASS',
        },
        focusContractAndNoActivate: {
          status: 'PASS',
          fgBefore,
          fgAfter,
        },
        altTabIntegrity: {
          status: 'PARTIAL',
          verification:
            'foreground changed after SendInput Alt+Tab; selected destination app was not asserted',
          hookActiveDuringShortcut: interceptionActiveBefore,
          fgBefore: altTabForegroundBefore,
          fgAfter: altTabForegroundAfter,
        },
        multiMonitorHitTesting: {
          status: multiMonitorSuccess ? 'PARTIAL' : 'NOT_TESTED',
          verification:
            'click-through at a secondary-monitor point; mixed-DPI drag and control positioning are not exercised',
          monitorsDetected: sysInfo.monitors.length,
          multiMonitorHitTested: multiMonitorSuccess,
        },
        cleanCloseAndHookCleanup: {
          status: 'PARTIAL',
          activeWidgetsAfterClose: activeWidgetWindows,
          interceptionInactiveAfterClose,
          hookUninstallationObservable: false,
        },
      },
    }

    const evidencePath = resolve(
      'C:/myapps/metric-context/evidencias_qa_timerbar/rodada-03/native-clickthrough.json',
    )
    const reportJson = JSON.stringify(report, null, 2)
    await testInfo.attach('native-clickthrough.json', {
      body: reportJson,
      contentType: 'application/json',
    })
    try {
      writeFileSync(evidencePath, reportJson, 'utf-8')
      console.log('✅ Evidência nativa gravada em:', evidencePath)
    } catch (err) {
      console.error('Falha ao salvar evidência nativa:', err)
    }
  })
})
