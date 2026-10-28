import { PagedResultDTO, PaginationOptionsDTO } from '@/dtos/pagination'

export interface IQueryBase<T> {
  findAll(pagination?: PaginationOptionsDTO): Promise<PagedResultDTO<T>>
  findById(id: string): Promise<T | undefined>
  findByIds(ids: string[]): Promise<T[]>
  findByCondition(
    condition: Partial<T>,
    pagination?: PaginationOptionsDTO,
  ): Promise<PagedResultDTO<T>>
  count(criteria?: Partial<T>): Promise<number>
  exists(criteria: Partial<T>): Promise<boolean>
}
