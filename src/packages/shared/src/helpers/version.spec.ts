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
    it('deve bloquear addons antigos sem requiredApiVersion no app 0.3.0 (fallback 0.1.0 pertence à família 0.1.x)', () => {
      expect(isApiVersionCompatible(undefined, '0.3.0')).toBe(false)
      expect(isApiVersionCompatible(null, '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('   ', '0.3.0')).toBe(false)
      expect(DEFAULT_MIN_API_VERSION).toBe('0.1.0')
    })

    it('deve permitir addon sem requiredApiVersion quando app for da mesma família 0.1.x', () => {
      expect(isApiVersionCompatible(undefined, '0.1.0')).toBe(true)
      expect(isApiVersionCompatible(undefined, '0.1.2')).toBe(true)
    })

    it('deve bloquear versões legadas do Redmine (0.1.0 e >=0.1.1) no app 0.3.0 devido a breaking changes de contrato', () => {
      // Manifest real do Redmine legado:
      expect(isApiVersionCompatible('0.1.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('>=0.1.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('>=0.1.1', '0.3.0')).toBe(false)
    })

    it('deve aceitar addons com a versão corrente do app (0.3.0) e compatibilidade com minor patches', () => {
      expect(isApiVersionCompatible('0.3.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('>=0.3.0', '0.3.0')).toBe(true)
      // Suporta minor updates / patches dentro da mesma família 0.3.x:
      expect(isApiVersionCompatible('>=0.3.0', '0.3.1')).toBe(true)
      expect(isApiVersionCompatible('>=0.3.0', '0.3.5')).toBe(true)
      expect(isApiVersionCompatible('0.3.0', '0.3.5')).toBe(true)
    })

    it('deve rejeitar addon que exige patch superior ao do app atual', () => {
      expect(isApiVersionCompatible('>=0.3.2', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('0.3.2', '0.3.0')).toBe(false)
    })

    it('deve rejeitar addon 0.3.x em versão de app futura com breaking change minor (ex: 0.4.0)', () => {
      expect(isApiVersionCompatible('>=0.3.0', '0.4.0')).toBe(false)
      expect(isApiVersionCompatible('0.3.0', '0.4.0')).toBe(false)
      expect(isApiVersionCompatible('^0.3.0', '0.4.0')).toBe(false)
    })

    it('deve avaliar operador >', () => {
      expect(isApiVersionCompatible('>0.3.0', '0.3.1')).toBe(true)
      expect(isApiVersionCompatible('>0.3.0', '0.3.0')).toBe(false)
      expect(isApiVersionCompatible('>0.2.0', '0.3.0')).toBe(false)
    })

    it('deve avaliar operador <= e <', () => {
      expect(isApiVersionCompatible('<=0.3.0', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('<=0.3.5', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('<0.3.1', '0.3.0')).toBe(true)
      expect(isApiVersionCompatible('<0.3.0', '0.3.0')).toBe(false)
    })

    it('deve avaliar múltiplos limites com intervalo dentro do mesmo minor', () => {
      expect(isApiVersionCompatible('>=0.3.0 <0.3.5', '0.3.2')).toBe(true)
      expect(isApiVersionCompatible('>=0.3.0 <0.3.2', '0.3.2')).toBe(false)
    })

    it('deve suportar compatibilidade semver padrão quando major >= 1', () => {
      expect(isApiVersionCompatible('>=1.0.0', '1.2.0')).toBe(true)
      expect(isApiVersionCompatible('>=1.0.0', '1.0.0')).toBe(true)
      expect(isApiVersionCompatible('>=1.0.0', '2.0.0')).toBe(false)
    })

    it('deve retornar false se a versão do app for inválida', () => {
      expect(isApiVersionCompatible('>=0.3.0', 'invalid-version')).toBe(false)
    })
  })
})
