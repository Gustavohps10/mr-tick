import { newRxError } from 'rxdb'
import { errorToPlainJson } from 'rxdb/plugins/utils'
import { describe, expect, it } from 'vitest'

import {
  getReplicationErrorMessage,
  getReplicationFailures,
  isReplicationAuthError,
  ReplicationError,
} from './ReplicationError'

describe('RxDB serialized provider failures', () => {
  it.each([401, 403, 422, 503])(
    'preserves status %s and original details through the actual RxDB serializer',
    (statusCode) => {
      const failure = {
        statusCode,
        messageKey: 'ARBITRARY_SERVER_MESSAGE',
        details: { session: ['original detail'] },
      }
      const wrapped = newRxError('RC_PUSH', {
        errors: [
          errorToPlainJson(new ReplicationError(failure.messageKey, [failure])),
        ],
      })
      expect(getReplicationFailures(wrapped)).toEqual([failure])
      expect(isReplicationAuthError(wrapped)).toBe(
        statusCode === 401 || statusCode === 403,
      )
      expect(getReplicationErrorMessage(wrapped)).toBe(
        'ARBITRARY_SERVER_MESSAGE (session: original detail)',
      )
    },
  )

  it('classifies mixed failures using all original codes', () => {
    const failures = [
      { statusCode: 503, messageKey: 'TEMPORARY_FAILURE' },
      { statusCode: 401, messageKey: 'SESSION_REQUIRES_LOGIN' },
    ]
    const wrapped = newRxError('RC_PUSH', {
      errors: [errorToPlainJson(new ReplicationError('batch', failures))],
    })
    expect(getReplicationFailures(wrapped)).toEqual(failures)
    expect(isReplicationAuthError(wrapped)).toBe(true)
    expect(getReplicationErrorMessage(wrapped)).toBe(
      'TEMPORARY_FAILURE; SESSION_REQUIRES_LOGIN',
    )
  })

  it('does not infer authentication from words or numeric text', () => {
    expect(
      isReplicationAuthError(new Error('UNAUTHORIZED TOKEN_EXPIRED 401')),
    ).toBe(false)
  })
})
