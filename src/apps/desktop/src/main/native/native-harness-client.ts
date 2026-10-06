import { ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

export interface VirtualScreenInfo {
  left: number
  top: number
  width: number
  height: number
}

export interface MonitorInfo {
  hMon: number
  isPrimary: boolean
  dpi: number
  left: number
  top: number
  right: number
  bottom: number
  workLeft: number
  workTop: number
  workRight: number
  workBottom: number
}

export type NativeCommandParam = string | number | boolean | undefined

export interface NativeCommandPayload {
  cmd: string
  [key: string]: NativeCommandParam
}

export interface NativeResponseEnvelope {
  status: string
  message?: string
  response?: string
  [key: string]: string | number | boolean | object | undefined
}

export interface SystemInfo extends NativeResponseEnvelope {
  status: string
  os: string
  arch: string
  virtualScreen: VirtualScreenInfo
  monitors: MonitorInfo[]
}

export interface NativeEventRecord {
  type: string
  x: number
  y: number
  screenX: number
  screenY: number
  timestamp: number
  vkCode: number
  ctrl: boolean
  alt: boolean
  shift: boolean
}

export interface ForegroundWindowInfo extends NativeResponseEnvelope {
  status: string
  hwnd: number
  title: string
  className: string
  isTestWindow: boolean
}

export interface WindowRectInfo extends NativeResponseEnvelope {
  status: string
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  dpi: number
}

export class NativeHarnessClient {
  private childProcess: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private pendingResolvers: Array<(res: NativeResponseEnvelope) => void> = []

  public async start(): Promise<void> {
    if (this.childProcess) {
      return
    }

    const candidatePaths = [
      join(process.cwd(), 'e2e/harness/timerbar_native_test.exe'),
      join(currentDir, '../../../e2e/harness/timerbar_native_test.exe'),
      join(currentDir, '../../e2e/harness/timerbar_native_test.exe'),
      join(currentDir, 'timerbar_native_test.exe'),
      join(
        process.cwd(),
        'src/apps/desktop/e2e/harness/timerbar_native_test.exe',
      ),
    ]

    const exePath = candidatePaths.find((p) => existsSync(p))
    if (!exePath) {
      throw new Error(
        `[NativeHarnessClient] Binário timerbar_native_test.exe não encontrado nos caminhos: ${candidatePaths.join(', ')}`,
      )
    }

    this.childProcess = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: false,
    })

    if (!this.childProcess.stdout || !this.childProcess.stdin) {
      throw new Error(
        '[NativeHarnessClient] Falha ao abrir stdio com o harness C++.',
      )
    }

    this.rl = readline.createInterface({
      input: this.childProcess.stdout,
      terminal: false,
    })

    this.rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const parsed = JSON.parse(trimmed)
        const resolver = this.pendingResolvers.shift()
        if (resolver) {
          resolver(parsed)
        }
      } catch (err) {
        console.error(
          '[NativeHarnessClient] Erro ao processar linha JSON do harness:',
          trimmed,
          err,
        )
      }
    })

    this.childProcess.on('exit', () => {
      this.childProcess = null
      this.rl = null
      while (this.pendingResolvers.length > 0) {
        const resolver = this.pendingResolvers.shift()
        if (resolver)
          resolver({ status: 'error', message: 'Harness finalizado' })
      }
    })

    // Valida conectividade imediata
    const pong = await this.ping()
    if (pong.response !== 'pong') {
      throw new Error(
        '[NativeHarnessClient] Harness não respondeu ao ping esperado.',
      )
    }
  }

  private sendCommand<T extends NativeResponseEnvelope>(
    cmdObj: NativeCommandPayload,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.childProcess || !this.childProcess.stdin) {
        return reject(
          new Error(
            '[NativeHarnessClient] Processo do harness não está ativo.',
          ),
        )
      }
      this.pendingResolvers.push((res) => resolve(res as T))
      const payload = JSON.stringify(cmdObj) + '\n'
      this.childProcess.stdin.write(payload, 'utf8')
    })
  }

  public async ping(): Promise<{ status: string; response: string }> {
    return this.sendCommand({ cmd: 'ping' })
  }

  public async getSystemInfo(): Promise<SystemInfo> {
    return this.sendCommand({ cmd: 'get_system_info' })
  }

  public async createWindow(
    options: {
      x?: number
      y?: number
      width?: number
      height?: number
      title?: string
      show?: boolean
    } = {},
  ): Promise<{ status: string; hwnd: number; dpi: number }> {
    return this.sendCommand({
      cmd: 'create_window',
      ...options,
    })
  }

  public async setWindowPos(options: {
    hwnd?: number
    x?: number
    y?: number
    width?: number
    height?: number
    zOrder?: 'bottom' | 'top' | 'topmost' | 'notopmost' | 'behind_hwnd'
    targetHwnd?: number
  }): Promise<{ status: string }> {
    return this.sendCommand({
      cmd: 'set_window_pos',
      ...options,
    })
  }

  public async bringToFront(): Promise<{ status: string }> {
    return this.sendCommand({ cmd: 'bring_to_front' })
  }

  public async clearEvents(): Promise<{ status: string }> {
    return this.sendCommand({ cmd: 'clear_events' })
  }

  public async getEvents(): Promise<{
    status: string
    count: number
    events: NativeEventRecord[]
  }> {
    return this.sendCommand({ cmd: 'get_events' })
  }

  public async getForegroundWindow(): Promise<ForegroundWindowInfo> {
    return this.sendCommand({ cmd: 'get_foreground_window' })
  }

  public async getWindowRect(hwnd?: number): Promise<WindowRectInfo> {
    return this.sendCommand({
      cmd: 'get_window_rect',
      hwnd,
    })
  }

  public async getWindowAtPoint(
    x: number,
    y: number,
  ): Promise<{
    status: string
    hwnd: number
    title: string
    className: string
    isTestWindow: boolean
  }> {
    return this.sendCommand({
      cmd: 'get_window_at_point',
      x,
      y,
    })
  }

  public async findWindow(options: {
    title?: string
    className?: string
  }): Promise<{
    status: string
    hwnd?: number
    title?: string
    left?: number
    top?: number
    width?: number
    height?: number
  }> {
    return this.sendCommand({
      cmd: 'find_window',
      ...options,
    })
  }

  public async sendMouseInput(options: {
    action: 'move' | 'down' | 'up' | 'click' | 'drag'
    x: number
    y: number
    button?: 'left' | 'right' | 'middle'
    toX?: number
    toY?: number
    steps?: number
    delayMs?: number
  }): Promise<{ status: string }> {
    return this.sendCommand({
      cmd: 'send_mouse_input',
      ...options,
    })
  }

  public async sendKeyInput(options: {
    vkCode: number
    down?: boolean
    up?: boolean
  }): Promise<{ status: string }> {
    return this.sendCommand({
      cmd: 'send_key_input',
      ...options,
    })
  }

  public async sendAltTab(): Promise<{ status: string }> {
    return this.sendCommand({ cmd: 'send_alt_tab' })
  }

  public async stop(): Promise<void> {
    if (!this.childProcess) return

    try {
      if (this.childProcess.stdin && !this.childProcess.stdin.destroyed) {
        this.childProcess.stdin.write(
          JSON.stringify({ cmd: 'exit' }) + '\n',
          'utf8',
        )
        this.childProcess.stdin.end()
      }
    } catch {
      // Ignora erro no fechamento de stdin
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.childProcess) {
          try {
            this.childProcess.kill()
          } catch {
            // Ignora se já morreu
          }
        }
        resolve()
      }, 1500)

      if (this.childProcess) {
        this.childProcess.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      } else {
        clearTimeout(timeout)
        resolve()
      }
    })
  }
}
