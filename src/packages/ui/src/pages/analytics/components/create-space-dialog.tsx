import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  buildNewSpaceWidgetOptions,
  GENERIC_CHART_MODELS,
  type WidgetId,
} from '../lib/analytics-types'

const NEW_SPACE_WIDGET_OPTIONS =
  buildNewSpaceWidgetOptions(GENERIC_CHART_MODELS)

export interface CreateSpaceDialogProps {
  open: boolean
  newSpaceTitle: string
  newSpaceSubtitle: string
  newSpaceWidgets: WidgetId[]
  onOpenChange: (open: boolean) => void
  onChangeTitle: (val: string) => void
  onChangeSubtitle: (val: string) => void
  onToggleWidget: (widgetId: WidgetId, checked: boolean) => void
  onCreateSpace: () => void
}

export function CreateSpaceDialog({
  open,
  newSpaceTitle,
  newSpaceSubtitle,
  newSpaceWidgets,
  onOpenChange,
  onChangeTitle,
  onChangeSubtitle,
  onToggleWidget,
  onCreateSpace,
}: CreateSpaceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-3xl min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-8">
          <DialogTitle className="text-base font-bold">
            Criar Novo Espaço Analítico (Página)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cada espaço possui sua própria View Final em Grade Inteligente e seu
            próprio Background de DataSources.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                Nome do Espaço (ex: Qualidade &amp; QA, Diretoria, Sprint)
              </Label>
              <Input
                value={newSpaceTitle}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="Ex: Qualidade & SLA"
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Descrição / Objetivo</Label>
              <Input
                value={newSpaceSubtitle}
                onChange={(e) => onChangeSubtitle(e.target.value)}
                placeholder="Ex: Indicadores de retrabalho, bugs e aderência da equipe"
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs">
                Gráficos Iniciais Posicionados na Grade Inteligente:
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {NEW_SPACE_WIDGET_OPTIONS.map((item) => {
                  const checked = newSpaceWidgets.includes(item.id)

                  return (
                    <div
                      key={item.id}
                      className="border-border/70 flex items-center gap-2 rounded-md border p-2.5"
                    >
                      <Checkbox
                        id={`new-sp-${item.id}`}
                        checked={checked}
                        onCheckedChange={(val) =>
                          onToggleWidget(item.id, Boolean(val))
                        }
                      />
                      <Label
                        htmlFor={`new-sp-${item.id}`}
                        className="cursor-pointer text-xs"
                      >
                        {item.label}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onCreateSpace}
            disabled={!newSpaceTitle.trim()}
          >
            Criar Espaço e Abrir View
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
