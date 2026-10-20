import {
  AppError,
  Either,
  isArray,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'
import type { MemberViewModel } from '@mr-tick/shared/view-models'

export interface StoredConnectionCredentialPayload {
  credentials?: Record<string, string | number | boolean>
}

type CredentialJsonValue = object | string | number | boolean | null

export function parseConnectionCredentialPayload(
  raw: string,
): Either<AppError, StoredConnectionCredentialPayload> {
  const parsedObject = parseJsonObject(raw)
  if (parsedObject.isFailure()) return parsedObject.forwardFailure()

  const credentials = parseCredentials(parsedObject.success)
  if (credentials.isFailure()) return credentials.forwardFailure()
  return Either.success({ credentials: credentials.success })
}

export function parseMemberPayload(
  raw: string,
): Either<AppError, MemberViewModel> {
  const parsedObject = parseJsonObject(raw)
  if (parsedObject.isFailure()) return parsedObject.forwardFailure()
  return parseMember(parsedObject.success)
}

function parseJsonObject(
  raw: string,
): Either<AppError, Record<string, CredentialJsonValue>> {
  try {
    const parsed: object = JSON.parse(raw)
    if (!isRecord(parsed)) return invalidCredentialPayload()
    const result: Record<string, CredentialJsonValue> = {}
    for (const key of Object.keys(parsed)) {
      const value = parsed[key]
      if (
        !isString(value) &&
        !isNumber(value) &&
        !isBoolean(value) &&
        value !== null &&
        !isRecord(value) &&
        !isArray(value)
      )
        return invalidCredentialPayload()
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return Either.success(result)
  } catch {
    return invalidCredentialPayload()
  }
}

function parseMember(
  value: object | string | number | boolean | null,
): Either<AppError, MemberViewModel> {
  if (!isRecord(value)) return invalidCredentialPayload()
  if (
    !isNumber(value.id) ||
    !isString(value.login) ||
    !isString(value.firstname) ||
    !isString(value.lastname) ||
    !isBoolean(value.admin) ||
    !isString(value.createdOn) ||
    !isString(value.lastLoginOn) ||
    (value.avatarUrl !== undefined && !isString(value.avatarUrl)) ||
    !isArray(value.customFields)
  )
    return invalidCredentialPayload()

  const customFields: MemberViewModel['customFields'] = []
  for (const field of value.customFields) {
    if (
      !isRecord(field) ||
      !isNumber(field.id) ||
      !isString(field.name) ||
      !isString(field.value)
    )
      return invalidCredentialPayload()
    customFields.push({ id: field.id, name: field.name, value: field.value })
  }

  const member: MemberViewModel = {
    id: value.id,
    login: value.login,
    firstname: value.firstname,
    lastname: value.lastname,
    admin: value.admin,
    createdOn: value.createdOn,
    lastLoginOn: value.lastLoginOn,
    customFields,
  }
  if (isString(value.avatarUrl)) member.avatarUrl = value.avatarUrl
  return Either.success(member)
}

function parseCredentials(
  value: object | string | number | boolean | null,
): Either<AppError, Record<string, string | number | boolean>> {
  if (!isRecord(value)) return invalidCredentialPayload()
  const credentials: Record<string, string | number | boolean> = {}
  for (const key of Object.keys(value)) {
    const credential = value[key]
    if (
      !isString(credential) &&
      !isNumber(credential) &&
      !isBoolean(credential)
    )
      return invalidCredentialPayload()
    Object.defineProperty(credentials, key, {
      value: credential,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return Either.success(credentials)
}

function invalidCredentialPayload(): Either<AppError, never> {
  return Either.failure(AppError.ValidationError('CREDENTIAL_PAYLOAD_INVALID'))
}
