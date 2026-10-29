import { useCallback, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

export interface AddonSelectOptionMediaProps {
  readonly imageUrl?: string
  readonly label: string
  readonly className?: string
  readonly size?: 'sm' | 'md'
}

function extractInitials(label: string): string {
  const trimmed = label.trim()
  if (trimmed.length === 0) return '?'
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0)
  if (words.length >= 2) {
    const firstWord = words[0]
    const secondWord = words[1]
    const firstChar = firstWord.charAt(0)
    const secondChar = secondWord.charAt(0)
    return (firstChar + secondChar).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

function isValidMediaUrl(url: string | undefined): url is string {
  if (!url) return false
  const trimmed = url.trim()
  if (trimmed.length === 0) return false
  if (trimmed.startsWith('https://')) return true
  if (trimmed.startsWith('data:image/')) return true
  return false
}

export function AddonSelectOptionMedia({
  imageUrl,
  label,
  className,
  size = 'sm',
}: AddonSelectOptionMediaProps) {
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  const initials = useMemo(() => extractInitials(label), [label])
  const isValid = useMemo(() => isValidMediaUrl(imageUrl), [imageUrl])
  const hasFailed = imageUrl !== undefined && failedUrls.has(imageUrl)

  const handleImageError = useCallback(() => {
    if (!imageUrl) return
    setFailedUrls((prev) => {
      const next = new Set(prev)
      next.add(imageUrl)
      return next
    })
  }, [imageUrl])

  const dimensionsClass =
    size === 'md' ? 'size-5 text-[10px]' : 'size-4 text-[9px]'

  if (!isValid || hasFailed || !imageUrl) {
    return (
      <span
        className={cn(
          'bg-muted text-muted-foreground border-border/40 pointer-events-none flex shrink-0 items-center justify-center rounded-xs border font-semibold select-none',
          dimensionsClass,
          className,
        )}
        aria-hidden="true"
        data-testid="addon-select-media-fallback"
      >
        {initials}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'border-border/40 pointer-events-none relative flex shrink-0 items-center justify-center overflow-hidden rounded-xs border select-none',
        dimensionsClass,
        className,
      )}
      aria-hidden="true"
      data-testid="addon-select-media-avatar"
    >
      <img
        src={imageUrl}
        alt=""
        onError={handleImageError}
        className="h-full w-full object-cover"
        data-testid="addon-select-media-img"
      />
    </span>
  )
}
