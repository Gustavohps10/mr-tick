import { Entity } from '@mr-tick/domain'

export interface IRepositoryBase<T extends Entity> {
  create(entity: T): Promise<void>
  update(entity: T): Promise<void>
  delete(id: string): Promise<void>
  findById(id: string): Promise<T | undefined>
}
