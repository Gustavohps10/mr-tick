import {
  IAddonConsentRepository,
  ICredentialsVault,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

export class VaultAddonConsentRepository implements IAddonConsentRepository {
  constructor(private readonly credentialsVault: ICredentialsVault) {}
  async isApproved(fingerprint: string): Promise<Either<AppError, boolean>> {
    try {
      return Either.success(
        (await this.credentialsVault.getToken(
          'MrTick-App',
          'addon-consent:' + fingerprint,
        )) === fingerprint,
      )
    } catch {
      return Either.failure(
        AppError.Internal('FALHA_AO_LER_CONSENTIMENTO_ADDON'),
      )
    }
  }
  async approve(fingerprint: string): Promise<Either<AppError, void>> {
    try {
      await this.credentialsVault.saveToken(
        'MrTick-App',
        'addon-consent:' + fingerprint,
        fingerprint,
      )
      return Either.success()
    } catch {
      return Either.failure(
        AppError.Internal('FALHA_AO_SALVAR_CONSENTIMENTO_ADDON'),
      )
    }
  }
}
