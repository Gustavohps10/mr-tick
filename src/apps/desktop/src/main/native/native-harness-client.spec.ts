import { afterEach, describe, expect, it } from 'vitest'

import { NativeHarnessClient } from './native-harness-client'

describe('NativeHarnessClient (timerbar_native_test.exe)', () => {
  let client: NativeHarnessClient | null = null

  afterEach(async () => {
    if (client) {
      await client.stop()
      client = null
    }
  })

  it('deve inicializar o harness C++, responder ao ping e coletar informações do sistema', async () => {
    client = new NativeHarnessClient()
    await client.start()

    const pingRes = await client.ping()
    expect(pingRes.status).toBe('ok')
    expect(pingRes.response).toBe('pong')

    const sysInfo = await client.getSystemInfo()
    expect(sysInfo.status).toBe('ok')
    expect(sysInfo.os).toBe('Windows')
    expect(sysInfo.arch).toBe('x64')
    expect(sysInfo.monitors.length).toBeGreaterThanOrEqual(1)

    const primaryMon = sysInfo.monitors.find((m) => m.isPrimary)
    expect(primaryMon).toBeDefined()
    expect(primaryMon?.dpi).toBeGreaterThan(0)
  })

  it('deve criar janela Win32, posicionar e registrar eventos físicos sintetizados via SendInput', async () => {
    client = new NativeHarnessClient()
    await client.start()

    const winRes = await client.createWindow({
      x: 200,
      y: 200,
      width: 400,
      height: 300,
      title: 'MrTick-Harness-Validation-Window',
      show: true,
    })
    expect(winRes.status).toBe('ok')
    expect(winRes.hwnd).toBeGreaterThan(0)

    const rect = await client.getWindowRect(winRes.hwnd)
    expect(rect.status).toBe('ok')
    expect(rect.width).toBe(400)
    expect(rect.height).toBe(300)

    await client.bringToFront()
    await client.clearEvents()
    let eventsRes = await client.getEvents()
    expect(eventsRes.count).toBe(0)

    // Injeta clique do mouse dentro da janela criada (coordenadas de tela: 250, 250)
    await client.sendMouseInput({
      action: 'click',
      x: 250,
      y: 250,
      button: 'left',
    })
    await new Promise((r) => setTimeout(r, 100))

    eventsRes = await client.getEvents()
    expect(eventsRes.count).toBeGreaterThanOrEqual(2)

    const downEv = eventsRes.events.find((e) => e.type === 'lbuttondown')
    const upEv = eventsRes.events.find((e) => e.type === 'lbuttonup')

    expect(downEv).toBeDefined()
    expect(upEv).toBeDefined()
    expect(Math.abs((downEv?.screenX ?? 0) - 250)).toBeLessThanOrEqual(1)
    expect(Math.abs((downEv?.screenY ?? 0) - 250)).toBeLessThanOrEqual(1)
  })
})
