import { IQueryBase } from '@/contracts/data/queries/IQueryBase'
import { TaskDTO } from '@/dtos'

export interface ITaskQuery extends IQueryBase<TaskDTO> {
  pull(
    memberId: string,
    checkpoint: { updatedAt: Date; id: string },
    batch: number,
  ): Promise<TaskDTO[]>
}
