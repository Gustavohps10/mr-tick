import { Search, X } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type LookupSize = 'micro' | 'xs' | 'sm' | 'md' | 'lg'

interface LookupInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size' | 'onChange'
> {
  value: string
  onChange: (value: string) => void
  onOpenLookup?: () => void
  size?: LookupSize
  sourceIcon?: React.ReactNode
}

export function LookupInput({
  value,
  onChange,
  onOpenLookup,
  onKeyDown,
  onBlur,
  placeholder,
  disabled,
  size = 'md',
  className,
  sourceIcon,
  ...props
}: LookupInputProps) {
  const sizeConfig: Record<
    LookupSize,
    {
      input: string
      button: string
      icon: string
      leftIcon: string
      rightSpace: string
    }
  > = {
    micro: {
      input: 'h-[18px] text-[10px] pl-[18px] pr-5 rounded-[4px]',
      button: 'h-3.5 w-3.5',
      icon: 'h-2 w-2',
      leftIcon: 'h-2.5 w-2.5 left-[4px]',
      rightSpace: 'right-[2px]',
    },
    xs: {
      input: 'h-7 text-[11px] pl-[22px] pr-6 rounded-md',
      button: 'h-5 w-5',
      icon: 'h-2.5 w-2.5',
      leftIcon: 'h-3 w-3 left-[6px]',
      rightSpace: 'right-1',
    },
    sm: {
      input: 'h-8 text-xs pl-7 pr-7 rounded-md',
      button: 'h-6 w-6',
      icon: 'h-3 w-3',
      leftIcon: 'h-3.5 w-3.5 left-2',
      rightSpace: 'right-1',
    },
    md: {
      input: 'h-9 text-sm pl-8 pr-8 rounded-md',
      button: 'h-7 w-7',
      icon: 'h-3.5 w-3.5',
      leftIcon: 'h-4 w-4 left-2.5',
      rightSpace: 'right-1',
    },
    lg: {
      input: 'h-10 text-base pl-9 pr-9 rounded-lg',
      button: 'h-8 w-8',
      icon: 'h-4 w-4',
      leftIcon: 'h-4.5 w-4.5 left-3',
      rightSpace: 'right-1.5',
    },
  }

  const config = sizeConfig[size]

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'text-muted-foreground absolute top-1/2 flex -translate-y-1/2 items-center justify-center transition-colors',
          onOpenLookup
            ? 'hover:text-foreground cursor-pointer'
            : 'pointer-events-none opacity-60',
          config.leftIcon,
        )}
        onClick={onOpenLookup}
        title={onOpenLookup ? 'Buscar Tarefa' : undefined}
      >
        {sourceIcon ? sourceIcon : <Search className="h-full w-full" />}
      </div>

      <Input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onOpenLookup) {
            e.preventDefault()
            onOpenLookup()
          }
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'border-input/40 bg-background/50 focus-visible:ring-primary/20 font-mono shadow-xs backdrop-blur-xs transition-all focus-visible:ring-2 [&::-webkit-search-cancel-button]:appearance-none',
          value
            ? 'border-primary/30 bg-primary/5'
            : 'hover:border-primary/20 hover:bg-background',
          config.input,
        )}
        {...props}
      />

      {value && (
        <div
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center',
            config.rightSpace,
          )}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onChange('')}
            disabled={disabled}
            className={cn('shrink-0 p-0 hover:bg-transparent', config.button)}
          >
            <X
              className={cn(
                'text-muted-foreground hover:text-foreground transition-colors',
                config.icon,
              )}
            />
          </Button>
        </div>
      )}
    </div>
  )
}
