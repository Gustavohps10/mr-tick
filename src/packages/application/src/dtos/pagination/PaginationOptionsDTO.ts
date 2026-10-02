export interface PaginationOptionsDTO {
  page?: number
  pageSize?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
  search?: string
  ids?: string[]
}
