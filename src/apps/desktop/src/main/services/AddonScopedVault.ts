import type { ICredentialsVault } from '@mr-tick/application'
import type {
  AddonSettingsValues,
  AddonVaultScope,
  IAddonVaultAPI,
} from '@mr-tick/sdk'
import {
  AppError,
  Either,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString,
} from '@mr-tick/shared/helpers'

/** Shared queue prevents settings UI and background addon updates losing each other. */
export class AddonScopedVault implements IAddonVaultAPI {
  private readonly tails = new Map<string, Promise<void>>()
  constructor(
    private readonly addonId: string,
    private readonly credentialsVault: ICredentialsVault,
  ) {}

  get(
    scope: AddonVaultScope,
    key: string,
  ): Promise<Either<AppError, string | null>> {
    return this.serial(scope, async (account) => {
      if (!isNonEmptyString(key))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_KEY_REQUIRED'),
        )
      const result = await this.read(account)
      if (result.isFailure()) return result.forwardFailure()
      if (!Object.hasOwn(result.success, key)) return Either.success(null)
      const value = result.success[key]
      if (value === undefined || value === null) return Either.success(null)
      if (!isString(value))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_VALUE_NOT_STRING'),
        )
      return Either.success(value)
    })
  }
  set(
    scope: AddonVaultScope,
    key: string,
    value: string,
  ): Promise<Either<AppError, void>> {
    return this.serial(scope, async (account) => {
      if (!isNonEmptyString(key) || !isString(value))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_VALUE_INVALID'),
        )
      const result = await this.read(account)
      if (result.isFailure()) return result.forwardFailure()
      Object.defineProperty(result.success, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      return this.write(account, result.success)
    })
  }
  delete(scope: AddonVaultScope, key: string): Promise<Either<AppError, void>> {
    return this.serial(scope, async (account) => {
      if (!isNonEmptyString(key))
        return Either.failure(
          AppError.ValidationError('ADDON_VAULT_KEY_REQUIRED'),
        )
      const result = await this.read(account)
      if (result.isFailure()) return result.forwardFailure()
      delete result.success[key]
      return this.write(account, result.success)
    })
  }
  getSettings(
    scope: AddonVaultScope,
  ): Promise<Either<AppError, AddonSettingsValues>> {
    return this.serial(scope, (account) => this.read(account))
  }
  saveSettings(
    scope: AddonVaultScope,
    settings: AddonSettingsValues,
  ): Promise<Either<AppError, void>> {
    return this.serial(scope, async (account) => {
      const parsed = parseSettings(JSON.stringify(settings))
      if (parsed.isFailure()) return parsed.forwardFailure()
      const result = await this.read(account)
      if (result.isFailure()) return result.forwardFailure()
      return this.write(account, { ...result.success, ...parsed.success })
    })
  }
  private serial<T>(
    scope: AddonVaultScope,
    operation: (account: string) => Promise<Either<AppError, T>>,
  ): Promise<Either<AppError, T>> {
    const account = vaultAccount(scope)
    if (account.isFailure()) return Promise.resolve(account.forwardFailure())
    let previous = this.tails.get(account.success)
    if (previous === undefined) previous = Promise.resolve()
    const result = previous.then(() => operation(account.success))
    const tail = result.then(
      () => {},
      () => {},
    )
    this.tails.set(account.success, tail)
    void tail.then(() => {
      if (this.tails.get(account.success) === tail)
        this.tails.delete(account.success)
    })
    return result
  }
  private async read(
    account: string,
  ): Promise<Either<AppError, AddonSettingsValues>> {
    try {
      const raw = await this.credentialsVault.getToken(this.addonId, account)
      if (raw === undefined || raw === null) return Either.success({})
      return parseSettings(raw)
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal('ADDON_VAULT_READ_FAILED'))
    }
  }
  private async write(
    account: string,
    values: AddonSettingsValues,
  ): Promise<Either<AppError, void>> {
    try {
      if (Object.keys(values).length === 0) {
        await this.credentialsVault.deleteToken(this.addonId, account)
        return Either.success()
      }
      await this.credentialsVault.saveToken(
        this.addonId,
        account,
        JSON.stringify(values),
      )
      return Either.success()
    } catch (error) {
      if (error instanceof Error)
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(AppError.Internal('ADDON_VAULT_WRITE_FAILED'))
    }
  }
}
function vaultAccount(scope: AddonVaultScope): Either<AppError, string> {
  if (!isRecord(scope))
    return Either.failure(
      AppError.ValidationError('ADDON_VAULT_SCOPE_REQUIRED'),
    )
  if (scope.kind === 'addon') return Either.success('addon_config')
  if (scope.kind === 'workspace' && isNonEmptyString(scope.workspaceId))
    return Either.success(`ws_${scope.workspaceId}_config`)
  return Either.failure(AppError.ValidationError('ADDON_VAULT_SCOPE_REQUIRED'))
}
/** Corrupted records must never be silently overwritten or deleted. */
function parseSettings(raw: string): Either<AppError, AddonSettingsValues> {
  try {
    const parsed: object = JSON.parse(raw)
    if (!isRecord(parsed))
      return Either.failure(AppError.ValidationError('ADDON_SETTINGS_INVALID'))
    const values: AddonSettingsValues = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        isString(value) ||
        (isNumber(value) && Number.isFinite(value)) ||
        value === true ||
        value === false ||
        value === null
      ) {
        Object.defineProperty(values, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        })
        continue
      }
      return Either.failure(AppError.ValidationError('ADDON_SETTINGS_INVALID'))
    }
    return Either.success(values)
  } catch {
    return Either.failure(AppError.ValidationError('ADDON_SETTINGS_INVALID'))
  }
}
