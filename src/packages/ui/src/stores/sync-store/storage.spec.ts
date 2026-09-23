import { RxError } from 'rxdb'
import { describe, expect, it } from 'vitest'

import { isDb6Error } from './storage'

describe('Storage DB6 Auto-Healing (STR-05)', () => {
  it('deve identificar erro DB6 vindo de instância RxError', () => {
    const rxErr = new RxError('DB6', 'Schema version mismatch for collection')
    expect(isDb6Error(rxErr)).toBe(true)
  })

  it('deve identificar erro com propriedade code DB6', () => {
    const customErr = new Error('Schema mismatch')
    Object.assign(customErr, { code: 'DB6' })
    expect(isDb6Error(customErr)).toBe(true)
  })

  it('deve identificar erro contendo DB6 na mensagem', () => {
    const msgErr = new Error(
      'RxError (DB6): Another version of the schema was already added',
    )
    expect(isDb6Error(msgErr)).toBe(true)
  })

  it('deve retornar false para outros tipos de erro', () => {
    const regularErr = new Error('Network timeout')
    expect(isDb6Error(regularErr)).toBe(false)
  })
})
