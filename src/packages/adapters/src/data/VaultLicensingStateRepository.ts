import {
  ICredentialsVault,
  ILicensingStateRepository,
  StoredLicensingStateDTO,
} from '@mr-tick/application'
import {
  AppError,
  Either,
  isNonEmptyString,
  isRecord,
} from '@mr-tick/shared/helpers'

const VAULT_SERVICE = 'MrTick-App'
const STATE_KEY = 'licensing:state:v1'
const INSTALLATION_SEED_KEY = 'licensing:device-id:v1'

function isStoredState(value: object): value is StoredLicensingStateDTO {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value.licenseKey) &&
    isNonEmptyString(value.installationId) &&
    isNonEmptyString(value.signedAuthorization) &&
    isNonEmptyString(value.lastVerifiedAt) &&
    Number.isFinite(Date.parse(value.lastVerifiedAt))
  )
}

export class VaultLicensingStateRepository implements ILicensingStateRepository {
  constructor(private readonly credentialsVault: ICredentialsVault) {}

  async getInstallationSeed(): Promise<Either<AppError, string | null>> {
    try {
      const result = await this.credentialsVault.getToken(
        VAULT_SERVICE,
        INSTALLATION_SEED_KEY,
      )
      if (result.kind === 'unavailable')
        return Either.failure(
          AppError.Internal('LICENCA_COFRE_LEITURA_IDENTIDADE_FALHOU'),
        )
      if (result.kind === 'absent') return Either.success(null)
      const seed = result.token
      if (seed.trim().length < 16)
        return Either.failure(
          AppError.Unauthorized('LICENCA_IDENTIDADE_LOCAL_INVALIDA'),
        )
      return Either.success(seed)
    } catch (error) {
      if (isRecord(error) && isNonEmptyString(error.message))
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(
        AppError.Internal('LICENCA_COFRE_LEITURA_IDENTIDADE_FALHOU'),
      )
    }
  }

  async saveInstallationSeed(seed: string): Promise<Either<AppError, void>> {
    try {
      await this.credentialsVault.saveToken(
        VAULT_SERVICE,
        INSTALLATION_SEED_KEY,
        seed,
      )
      return Either.success()
    } catch (error) {
      if (isRecord(error) && isNonEmptyString(error.message))
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(
        AppError.Internal('LICENCA_COFRE_GRAVACAO_IDENTIDADE_FALHOU'),
      )
    }
  }

  async readState(): Promise<Either<AppError, StoredLicensingStateDTO | null>> {
    try {
      const result = await this.credentialsVault.getToken(
        VAULT_SERVICE,
        STATE_KEY,
      )
      if (result.kind === 'unavailable')
        return Either.failure(
          AppError.Internal('LICENCA_COFRE_LEITURA_CACHE_FALHOU'),
        )
      if (result.kind === 'absent') return Either.success(null)
      const parsed: object = JSON.parse(result.token)
      if (!isStoredState(parsed))
        return Either.failure(AppError.Unauthorized('LICENCA_CACHE_INVALIDO'))
      return Either.success(parsed)
    } catch (error) {
      if (isRecord(error) && isNonEmptyString(error.message))
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(
        AppError.Internal('LICENCA_COFRE_LEITURA_CACHE_FALHOU'),
      )
    }
  }

  async saveState(
    state: StoredLicensingStateDTO,
  ): Promise<Either<AppError, void>> {
    try {
      await this.credentialsVault.saveToken(
        VAULT_SERVICE,
        STATE_KEY,
        JSON.stringify(state),
      )
      return Either.success()
    } catch (error) {
      if (isRecord(error) && isNonEmptyString(error.message))
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(
        AppError.Internal('LICENCA_COFRE_GRAVACAO_CACHE_FALHOU'),
      )
    }
  }

  async clearState(): Promise<Either<AppError, void>> {
    try {
      await this.credentialsVault.deleteToken(VAULT_SERVICE, STATE_KEY)
      return Either.success()
    } catch (error) {
      if (isRecord(error) && isNonEmptyString(error.message))
        return Either.failure(AppError.Internal(error.message))
      return Either.failure(
        AppError.Internal('LICENCA_COFRE_LIMPEZA_CACHE_FALHOU'),
      )
    }
  }
}
