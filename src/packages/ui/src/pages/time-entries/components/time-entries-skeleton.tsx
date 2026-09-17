import { Skeleton } from '@/components/ui/skeleton'

export function TimeEntriesSkeleton({ message }: { message?: string } = {}) {
  return (
    <div className="space-y-4">
      {message && (
        <div className="border-primary/20 bg-primary/5 text-primary flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
            <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
          </span>
          <span className="font-medium">{message}</span>
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
        <div className="rounded-md border">
          <div className="bg-muted/50 border-b p-2">
            <div className="flex gap-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b p-3 last:border-0"
            >
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end pr-4">
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    </div>
  )
}
