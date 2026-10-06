import { Skeleton } from '@/components/ui/skeleton'

export function TimeEntriesLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando apontamentos"
      aria-busy="true"
      className="flex flex-col gap-3 p-3"
    >
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (value, index) => (
          <Skeleton key={index} className="h-48 w-full" />
        ))}
      </div>
    </div>
  )
}
