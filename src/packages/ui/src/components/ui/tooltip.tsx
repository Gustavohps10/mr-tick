'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'

import { cn } from '@/lib/utils'

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const contentRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return

    const syncArrowColor = () => {
      const computed = window.getComputedStyle(node)
      const bgColor = computed.backgroundColor
      const borderColor = computed.borderColor

      const arrow = node.querySelector<SVGElement>(
        '[data-slot="tooltip-arrow"]',
      )
      if (arrow) {
        arrow.style.fill = bgColor

        const polygon = arrow.querySelector('polygon')
        if (polygon) {
          polygon.style.fill = bgColor
          polygon.style.stroke = borderColor
          polygon.style.strokeWidth = '2px'
          polygon.style.strokeLinejoin = 'round'
          polygon.style.strokeDasharray = '0 30 100'
        }
      }
    }

    syncArrowColor()
    requestAnimationFrame(syncArrowColor)

    const nodeObserver = new MutationObserver(syncArrowColor)
    nodeObserver.observe(node, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    const rootObserver = new MutationObserver(syncArrowColor)
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
  }, [])

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={contentRef}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        updatePositionStrategy="always"
        className={cn(
          'bg-background text-muted-foreground dark:bg-secondary dark:text-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-w-sm rounded-md border px-3 py-1.5 text-xs shadow-md',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          data-slot="tooltip-arrow"
          width={11}
          height={5}
          className="z-50 -translate-y-[1px]"
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
