import { describe, expect, it } from 'vitest'

import {
  compareSemVer,
  DEFAULT_MIN_API_VERSION,
  isApiVersionCompatible,
  parseSemVer,
} from './version'

describe('Version Locking & SemVer Compatibility', () => {
  describe('parseSemVer', () => {
    it('deve parsear versões completas major.minor.patch', () => {
      const parsed = parseSemVer('1.2.3')
      expect(parsed).toEqual({ major: 1, minor: 2, patch: 3 })
    })

    it('deve parsear versões parciais completando com zero', () => {
      expect(parseSemVer('0.3')).toEqual({ major: 0, minor: 3, patch: 0 })
      expect(parseSemVer('1')).toEqual({ major: 1, minor: 0, patch: 0 })
    })

    it('deve remover prefixo v ou V', () => {
      expect(parseSemVer('v0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 })
      expect(parseSemVer('V2.0.1')).toEqual({ major: 2, minor: 0, patch: 1 })
    })

    it('deve retornar null para strings inválidas', () => {
      expect(parseSemVer('')).toBeNull()
      expect(parseSemVer('abc')).toBeNull()
    })
  })

  describe('compareSemVer', () => {
    it('deve comparar corretamente versões maior, menor e igual', () => {
      const v1 = { major: 0, minor: 3, patch: 0 }
      const v2 = { major: 0, minor: 1, patch: 0 }
      const v3 = { major: 0, minor: 3, patch: 0 }

      expect(compareSemVer(v1, v2)).toBe(1)
      expect(compareSemVer(v2, v1)).toBe(-1)
      expect(compareSemVer(v1, v3)).toBe(0)
    })
  })

  describe('isApiVersionCompatible', () => {
    it('deve adotar 0.1.0 como fallback quando requiredApiVersion for ausente ou vazio', () => {
      expect(isApiVersionCompatible(undefined, '0.3.0')).toBe(true)
      expect(isApiVersionCompatible(null, '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('   ', '0.3.0')).toBe(true)
      expect(DEFAULT_MIN_API_VERSION).toBe('0.1.0')
    })

    it('deve tratar versão simples como versão mínima requerida (>=)', () => {
      expect(isApiVersionCompatible('0.1.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('0.3.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('0.4.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('1.0.0', '0.3.0')).toBe(false)
    })

    it('deve avaliar operador >=', () => {
      expect(isApiVersionCompatible('>=0.1.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('>=0.1.1', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('>=0.3.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('>=0.3.1', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('>=0.4.0', '0.3.0')).toBe(false)
    })

    it('deve avaliar operador >', () => {
      expect(isApiVersionCompatible('>0.2.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('>0.3.0', '0.3.0')).toBe(false)
    })

    it('deve avaliar operador <= e <', () => {
      expect(isApiVersionCompatible('<=0.3.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('<=0.2.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('<0.3.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('<0.4.0', '0.3.0')).toBe(true)
    })

    it('deve avaliar múltiplos limites com intervalo', () => {
      expect(isApiVersionCompatible('>=0.1.0 <0.4.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('>=0.1.0 <0.3.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('>=0.3.5 <0.5.0', '0.3.0')).toBe(false)
    })

    it('deve retornar false se a versão do app for inválida', () => {
      expect(isApiVersionCompatible('>=0.1.0', 'invalid-version')).toBe(false)
    })
  })
})
