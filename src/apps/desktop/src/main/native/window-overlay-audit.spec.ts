import { createRequire } from 'node:module'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface NativeOverlayModule {
  applyOverlayStyles?: (buf: Buffer) => boolean
  removeOverlayStyles?: (buf: Buffer) => void
  cleanupOverlay?: () => void
  isKeyboardInterceptionActive?: () => boolean
}

describe('Auditoria do Addon window_overlay (.node e contratos Win32)', () => {
  const binaryPath = join(
    __dirname,
    '../../../native-prebuilds/window_overlay.node',
  )
  let nativeMod: NativeOverlayModule | null = null

  try {
    nativeMod = require(binaryPath) as NativeOverlayModule
  } catch {
    nativeMod = null
  }

  it('deve carregar o addon nativo existente sem falhas de ABI', () => {
    expect(nativeMod).not.toBeNull()
    expect(typeof nativeMod?.applyOverlayStyles).toBe('function')
  })

  it('valida funções de ciclo de vida e segurança: removeOverlayStyles, cleanupOverlay e isKeyboardInterceptionActive presentes e funcionais no prebuild reconstruído', () => {
    const hasRemove = typeof nativeMod?.removeOverlayStyles === 'function'
    const hasCleanup = typeof nativeMod?.cleanupOverlay === 'function'
    const hasInterceptionStatus =
      typeof nativeMod?.isKeyboardInterceptionActive === 'function'

    expect(hasRemove).toBe(true)
    expect(hasCleanup).toBe(true)
    expect(hasInterceptionStatus).toBe(true)
    expect(nativeMod?.isKeyboardInterceptionActive?.()).toBe(false)
    expect(() => nativeMod?.cleanupOverlay?.()).not.toThrow()
  })

  it('deve rejeitar buffers nulos ou inválidos com retorno seguro', () => {
    const applyOverlayStyles = nativeMod?.applyOverlayStyles
    expect(applyOverlayStyles).toBeDefined()
    if (!applyOverlayStyles) return

    // HWND nulo (ponteiro 0)
    const nullBuffer = Buffer.alloc(8)
    nullBuffer.writeBigUInt64LE(0n, 0)

    const result = applyOverlayStyles(nullBuffer)
    expect(result).toBe(false)
  })

  it('deve lançar TypeError se o argumento de applyOverlayStyles não for um Buffer', () => {
    const applyOverlayStyles = nativeMod?.applyOverlayStyles as (
      buf: Buffer | number,
    ) => boolean

    expect(() => {
      applyOverlayStyles(12345)
    }).toThrow('Buffer HWND esperado')
  })
})
