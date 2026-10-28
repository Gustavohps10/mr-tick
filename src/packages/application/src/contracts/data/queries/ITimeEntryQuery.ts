import { IQueryBase } from '@/contracts/data/queries/IQueryBase'
import { PagedResultDTO, TimeEntryDTO } from '@/dtos'

export interface ITimeEntryQuery extends IQueryBase<TimeEntryDTO> {
  findByMemberId(
    memberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PagedResultDTO<TimeEntryDTO>>

  pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TimeEntryDTO[]>
}
