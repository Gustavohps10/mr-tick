'use client'

import { AddonManifest } from '@mr-tick/application'
import { Check } from 'lucide-react'

import { Badge, Button, ScrollArea } from '@/components/ui'
import { cn } from '@/lib/utils'

export function DataSourceSelector({
  addons,
  selectedPluginId,
  onSelect,
}: {
  addons: AddonManifest[]
  selectedPluginId?: string
  onSelect: (addon: AddonManifest) => void
}) {
  if (addons.length === 0) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm font-medium">
          Nenhum plugin instalado.
        </p>
        <p className="text-muted-foreground/60 text-xs">
          Instale um plugin na aba Marketplace para continuar.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[300px] pr-4">
      <div className="space-y-2">
        {addons.map((addon) => {
          const isSelected = selectedPluginId === addon.id
          return (
            <div
              key={addon.id}
              onClick={() => onSelect(addon)}
              className={cn(
                'group hover:bg-muted/50 relative flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-background',
              )}
            >
              <div className="flex items-center gap-4">
                <div className="bg-secondary flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border">
                  {addon.logo ? (
                    <img
                      src={addon.logo}
                      alt={addon.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-xl">📦</span>
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{addon.name}</span>
                    <Badge variant="outline" className="h-4 text-[10px]">
                      v{addon.version}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    {addon.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSelected ? (
                  <Badge className="bg-primary text-primary-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" /> Selecionado
                  </Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Selecionar
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
