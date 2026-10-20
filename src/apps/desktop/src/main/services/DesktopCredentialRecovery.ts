import {
  IConnectionCredentialsVault,
  IConnectionLifecycleRepository,
  IConnectionLifecycleTransactionBoundary,
  IConnectionReservationRepository,
  ICredentialsVault,
  IWorkspaceCredentialReferenceRegistry,
  IWorkspacesRepository,
  RecoverAddonWorkspaceCredentialWritesService,
  RecoverConnectionLifecycleService,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'

export class DesktopCredentialRecovery {
  constructor(
    private readonly credentialRegistry: IWorkspaceCredentialReferenceRegistry,
    private readonly lifecycleRepository: IConnectionLifecycleRepository,
    private readonly reservationRepository: IConnectionReservationRepository,
    private readonly credentialsVault: ICredentialsVault &
      IConnectionCredentialsVault,
    private readonly workspacesRepository: IWorkspacesRepository,
    private readonly transactionBoundary: IConnectionLifecycleTransactionBoundary,
  ) {}

  public async execute(): Promise<Either<AppError, void>> {
    const addonRecovery = new RecoverAddonWorkspaceCredentialWritesService(
      this.credentialRegistry,
      this.credentialsVault,
      this.credentialsVault,
    )
    const addonRecoveryResult = await addonRecovery.execute()
    if (addonRecoveryResult.isFailure())
      return addonRecoveryResult.forwardFailure()

    const connectionRecovery = new RecoverConnectionLifecycleService(
      this.lifecycleRepository,
      this.credentialsVault,
      this.workspacesRepository,
      this.transactionBoundary,
    )
    const connectionRecoveryResult = await connectionRecovery.execute()
    if (connectionRecoveryResult.isFailure())
      return connectionRecoveryResult.forwardFailure()

    const reservationRecoveryResult =
      await this.reservationRepository.recoverPendingConnectionReservations()
    if (reservationRecoveryResult.isFailure())
      return reservationRecoveryResult.forwardFailure()

    return Either.success()
  }
}
