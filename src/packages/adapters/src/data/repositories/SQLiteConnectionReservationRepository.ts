import {
  ConnectionReservationScope,
  ConnectionSlotReservation,
  IConnectionReservationRepository,
  PersistedConnectionReservation,
} from '@mr-tick/application'
import { AppError, Either } from '@mr-tick/shared/helpers'
import { Knex } from 'knex'

import {
  createSQLiteConnection,
  ensureDatabaseSchema,
  withSafeTransaction,
} from './sqlite-connection'

type ReservationRow = {
  reservation_id: string
  workspace_id: string
  addon_id: string
  connection_profile_id: string
  connection_id: string
  cardinality: string
  is_default: boolean | number
  status: string
}

function parseReservationStatus(
  status: string,
): Either<AppError, PersistedConnectionReservation['status']> {
  switch (status) {
    case 'pending':
    case 'confirmed':
    case 'released':
      return Either.success(status)
    default:
      return Either.failure(
        AppError.Internal(`INVALID_CONNECTION_RESERVATION_STATUS: ${status}`),
      )
  }
}

function parseReservationCardinality(
  cardinality: string,
): Either<AppError, ConnectionSlotReservation['cardinality']> {
  switch (cardinality) {
    case 'single':
    case 'multi':
      return Either.success(cardinality)
    default:
      return Either.failure(
        AppError.Internal(
          `INVALID_CONNECTION_RESERVATION_CARDINALITY: ${cardinality}`,
        ),
      )
  }
}

export class SQLiteConnectionReservationRepository implements IConnectionReservationRepository {
  public readonly db: Knex
  private readonly ownsConnection: boolean

  constructor(storagePathOrDb: string | Knex) {
    if (typeof storagePathOrDb !== 'string') {
      this.db = storagePathOrDb
      this.ownsConnection = false
      return
    }
    this.db = createSQLiteConnection(storagePathOrDb)
    this.ownsConnection = true
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.db.destroy()
    }
  }

  public async reserveConnectionSlot(
    reservation: ConnectionSlotReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      if (reservation.cardinality === 'single') {
        const conflicting = await trx<ReservationRow>('connection_reservations')
          .where('workspace_id', reservation.workspaceId)
          .where('addon_id', reservation.addonId)
          .where('connection_profile_id', reservation.connectionProfileId)
          .where('status', 'confirmed')
          .whereNot('connection_id', reservation.connectionId)
          .first()

        if (conflicting) {
          return Either.failure(
            AppError.Http(409, 'CONNECTION_CARDINALITY_REACHED'),
          )
        }
      }

      const existing = await trx<ReservationRow>('connection_reservations')
        .where('reservation_id', reservation.reservationId)
        .first()

      if (existing) {
        if (existing.status === 'released') {
          return Either.failure(
            AppError.Http(409, 'CONNECTION_RESERVATION_RELEASED'),
          )
        }
        await trx('connection_reservations')
          .where('reservation_id', reservation.reservationId)
          .update({
            workspace_id: reservation.workspaceId,
            addon_id: reservation.addonId,
            connection_profile_id: reservation.connectionProfileId,
            connection_id: reservation.connectionId,
            cardinality: reservation.cardinality,
            is_default: reservation.default ? 1 : 0,
            status: 'confirmed',
          })
        return Either.success(undefined)
      }

      await trx('connection_reservations').insert({
        reservation_id: reservation.reservationId,
        workspace_id: reservation.workspaceId,
        addon_id: reservation.addonId,
        connection_profile_id: reservation.connectionProfileId,
        connection_id: reservation.connectionId,
        cardinality: reservation.cardinality,
        is_default: reservation.default ? 1 : 0,
        status: 'confirmed',
      })

      return Either.success(undefined)
    })
  }

  public async findConnectionReservation(
    scope: ConnectionReservationScope,
  ): Promise<Either<AppError, PersistedConnectionReservation | undefined>> {
    const initResult = await ensureDatabaseSchema(this.db)
    if (initResult.isFailure()) return initResult.forwardFailure()

    try {
      const row = await this.db<ReservationRow>('connection_reservations')
        .where('workspace_id', scope.workspaceId)
        .where('addon_id', scope.addonId)
        .where('connection_profile_id', scope.connectionProfileId)
        .where('connection_id', scope.connectionId)
        .first()

      if (!row) return Either.success(undefined)

      const status = parseReservationStatus(row.status)
      if (status.isFailure()) return status.forwardFailure()
      const cardinality = parseReservationCardinality(row.cardinality)
      if (cardinality.isFailure()) return cardinality.forwardFailure()

      const result: PersistedConnectionReservation = {
        reservationId: row.reservation_id,
        workspaceId: row.workspace_id,
        addonId: row.addon_id,
        connectionProfileId: row.connection_profile_id,
        connectionId: row.connection_id,
        cardinality: cardinality.success,
        default: Boolean(row.is_default),
        status: status.success,
      }

      return Either.success(result)
    } catch (error) {
      if (error instanceof Error) {
        return Either.failure(AppError.Internal(error.message))
      }
      return Either.failure(AppError.Internal('DATABASE_ERROR'))
    }
  }

  public async releaseConnectionSlot(
    reservation: ConnectionSlotReservation,
  ): Promise<Either<AppError, void>> {
    return withSafeTransaction(this.db, async (trx) => {
      await trx('connection_reservations')
        .where('workspace_id', reservation.workspaceId)
        .where('connection_id', reservation.connectionId)
        .update({
          status: 'released',
        })
      return Either.success(undefined)
    })
  }

  public async recoverPendingConnectionReservations(): Promise<
    Either<AppError, void>
  > {
    return withSafeTransaction(this.db, async (trx) => {
      await trx('connection_reservations').where('status', 'pending').update({
        status: 'released',
      })
      return Either.success(undefined)
    })
  }
}
