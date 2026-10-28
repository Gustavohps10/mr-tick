export interface PagedResultDTO<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
