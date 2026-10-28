import { Entity } from '@mr-tick/domain'

import { IQueryBase } from '@/contracts/data'
import { IRepositoryBase } from '@/contracts/data'

export interface IDataContext {
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  getQuery<T>(entity: new () => T): IQueryBase<T>
  getRepository<T extends Entity>(entity: new () => T): IRepositoryBase<T>
}
