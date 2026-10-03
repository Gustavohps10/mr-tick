import { describe, expect, it } from 'vitest'

import { AppError } from './AppError'

describe('AppError', () => {
  describe('Static Factories (Points of Entry)', () => {
    it('should create a ValidationError via AppError.ValidationError() with status 422', () => {
      const details = { email: ['Formato inválido'] }
      const error = AppError.ValidationError('VALIDATION_ERROR', details)

      expect(error.messageKey).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(422)
      expect(error.details).toEqual(details)
      expect(error.type).toBe('danger')
    })

    it('should create a NotFoundError via AppError.NotFound() with status 404', () => {
      const error = AppError.NotFound('USER_NOT_FOUND')

      expect(error.messageKey).toBe('USER_NOT_FOUND')
      expect(error.statusCode).toBe(404)
      expect(error.type).toBe('danger')
    })

    it('should create an UnauthorizedError via AppError.Unauthorized() with status 401', () => {
      const error = AppError.Unauthorized('TOKEN_EXPIRED')

      expect(error.messageKey).toBe('TOKEN_EXPIRED')
      expect(error.statusCode).toBe(401)
    })

    it('should create an InternalServerError via AppError.Internal() with status 500', () => {
      const error = AppError.Internal('DATABASE_CRASH')

      expect(error.messageKey).toBe('DATABASE_CRASH')
      expect(error.statusCode).toBe(500)
    })

    it('should allow overriding the error type to warning', () => {
      const error = AppError.ValidationError(
        'LOW_CREDITS',
        undefined,
        'warning',
      )

      expect(error.type).toBe('warning')
      expect(error.statusCode).toBe(422)
    })
  })

  describe('Helpers', () => {
    it('should return field errors when they exist', () => {
      const details = { password: ['Muito curto', 'Falta número'] }
      const error = AppError.ValidationError('ERR', details)

      expect(error.getFieldErrors('password')).toEqual([
        'Muito curto',
        'Falta número',
      ])
      expect(error.getFieldErrors('email')).toEqual([]) // Campo inexistente
    })

    it('should identify if it has errors correctly', () => {
      const errorWithDetails = AppError.ValidationError('ERR', { field: [] })
      const errorWithoutDetails = AppError.NotFound('ERR')

      expect(errorWithDetails.hasErrors()).toBe(true)
      expect(errorWithoutDetails.hasErrors()).toBe(false)
    })

    it('should return empty array in getFieldErrors if details are undefined', () => {
      const error = AppError.NotFound('ERR')
      expect(error.getFieldErrors('any')).toEqual([])
    })
  })
})

describe('HTTP failures preserve the provider status', () => {
  it.each([403, 429, 503])(
    'retains HTTP %i and the original server message',
    (status) => {
      const error = AppError.Http(status, 'SERVER_MESSAGE', {
        hours: ['INVALID'],
      })
      expect(error.statusCode).toBe(status)
      expect(error.messageKey).toBe('SERVER_MESSAGE')
      expect(error.details).toEqual({ hours: ['INVALID'] })
    },
  )
})
