import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ConnectionSlotReservation } from '@mr-tick/application'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SQLiteConnectionReservationRepository } from './SQLiteConnectionReservationRepository'

const scope = {
  workspaceId: 'ws-1',
  addonId: 'addon-1',
  connectionProfileId: 'profile-1',
  connectionId: 'conn-1',
}

const reservation: ConnectionSlotReservation = {
  ...scope,
  reservationId: 'res-1',
  cardinality: 'single',
  default: true,
}

describe('SQLiteConnectionReservationRepository', () => {
  let directory: string
  let repository: SQLiteConnectionReservationRepository

  beforeEach(async () => {
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'connection-reservation-repo-'),
    )
    repository = new SQLiteConnectionReservationRepository(
      path.join(directory, 'db.sqlite'),
    )
  })

  afterEach(async () => {
    await repository.close()
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('does not restore a released reservation when a late reserve arrives', async () => {
    const reserved = await repository.reserveConnectionSlot(reservation)
    expect(reserved.isSuccess()).toBe(true)

    const released = await repository.releaseConnectionSlot(reservation)
    expect(released.isSuccess()).toBe(true)

    const late = await repository.reserveConnectionSlot(reservation)
    expect(late.isFailure()).toBe(true)

    const found = await repository.findConnectionReservation(scope)
    expect(found.isSuccess()).toBe(true)
    if (found.isFailure()) return
    expect(found.success?.status).toBe('released')
  })

  it('fails explicitly when the persisted cardinality is invalid', async () => {
    await repository.reserveConnectionSlot(reservation)
    await repository
      .db('connection_reservations')
      .where('reservation_id', reservation.reservationId)
      .update({ cardinality: 'corrupted' })

    const found = await repository.findConnectionReservation(scope)
    expect(found.isFailure()).toBe(true)
  })

  it('fails explicitly when the persisted status is invalid', async () => {
    await repository.reserveConnectionSlot(reservation)
    await repository
      .db('connection_reservations')
      .where('reservation_id', reservation.reservationId)
      .update({ status: 'corrupted' })

    const found = await repository.findConnectionReservation(scope)
    expect(found.isFailure()).toBe(true)
  })
})
