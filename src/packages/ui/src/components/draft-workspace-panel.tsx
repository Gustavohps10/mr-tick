'use client'

import { WorkspaceViewModel } from '@mr-tick/shared/view-models'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight,
  CircleDashed,
  Clock,
  LayoutGridIcon,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui'
import { useWorkspace, workspaceKeys } from '@/contexts/WorkspaceContext'
import { useHostBridge } from '@/hooks'
import { cn } from '@/lib'
import { dropWorkspaceStorage } from '@/stores/syncStore'

export function DraftWorkspacesPanel({
  onOpenWorkspace,
}: {
  onOpenWorkspace: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const { workspaces } = useWorkspace()

  const draftWorkspaces = workspaces.filter((w) => w.status === 'draft')

  const handleDeleteDraft = async (
    e: React.MouseEvent,
    workspaceId: string,
  ) => {
    e.stopPropagation()
    setDeletingId(workspaceId)

    try {
      const response = await bridge.workspaces.delete({
        body: { workspaceId },
      })

      if (!response.isSuccess) {
        toast.error(response.error || 'Erro ao remover rascunho')
        return
      }

      queryClient.setQueryData<WorkspaceViewModel[]>(
        workspaceKeys.all,
        (prev) => prev?.filter((w) => w.id !== workspaceId) ?? [],
      )

      await dropWorkspaceStorage(workspaceId)
      toast.success('Rascunho removido')

      if (draftWorkspaces.length <= 1) setIsOpen(false)
    } catch {
      toast.error('Ocorreu um erro inesperado')
    } finally {
      setDeletingId(null)
    }
  }

  if (draftWorkspaces.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50">
      <div className="pointer-events-auto flex items-end gap-2">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 260, damping: 25 }}
              className="w-[300px]"
            >
              <div className="bg-background/95 flex max-h-[420px] flex-col rounded-xl border shadow-2xl backdrop-blur-md">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 flex h-5 w-5 items-center justify-center rounded-full">
                      <CircleDashed className="text-primary animate-spin-slow size-3" />
                    </div>
                    <span className="text-xs font-semibold tracking-tight uppercase">
                      Rascunhos
                    </span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-muted-foreground hover:bg-muted rounded-md p-1 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Lista */}
                <div className="custom-scrollbar flex flex-col gap-1 overflow-y-auto p-2">
                  <AnimatePresence mode="popLayout">
                    {draftWorkspaces.map((workspace, i) => (
                      <motion.div
                        key={workspace.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: i * 0.03 }}
                        className="group relative"
                      >
                        <button
                          onClick={() => {
                            onOpenWorkspace(workspace.id)
                            setIsOpen(false)
                          }}
                          disabled={deletingId === workspace.id}
                          className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          <div className="relative shrink-0">
                            <div className="bg-muted h-9 w-9 overflow-hidden rounded-lg border shadow-sm">
                              <Avatar className="h-full w-full rounded-none border-none">
                                <AvatarImage
                                  src={workspace.avatarUrl}
                                  alt={workspace.name}
                                  className="object-cover"
                                />
                                <AvatarFallback className="rounded-none">
                                  <LayoutGridIcon className="text-muted-foreground/50 size-4" />
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            {/* bolinha pulse — mantém amarelo */}
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm" />
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm leading-none font-semibold">
                              {workspace.name || 'Sem nome'}
                            </p>
                            <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-[10px] font-medium">
                              <Clock className="size-3" />
                              Configuração incompleta
                            </p>
                          </div>

                          <div className="flex items-center">
                            <button
                              onClick={(e) =>
                                handleDeleteDraft(e, workspace.id)
                              }
                              className={cn(
                                'hover:bg-destructive/10 hover:text-destructive flex h-7 w-7 items-center justify-center rounded-md transition-all group-hover:opacity-100 sm:opacity-0',
                                deletingId === workspace.id && 'opacity-100',
                              )}
                              title="Remover rascunho"
                            >
                              {deletingId === workspace.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </button>

                            <ChevronRight
                              className={cn(
                                'text-muted-foreground/40 size-4 transition-all group-hover:translate-x-0.5',
                                deletingId === workspace.id && 'hidden',
                              )}
                            />
                          </div>
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Rodapé */}
                <div className="bg-muted/20 border-t px-4 py-3">
                  <p className="text-muted-foreground text-[11px] font-medium">
                    {draftWorkspaces.length}{' '}
                    {draftWorkspaces.length === 1
                      ? 'item pendente'
                      : 'itens pendentes'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botão Gatilho */}
        <motion.button
          onClick={() => setIsOpen((prev) => !prev)}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          className={cn(
            'bg-background relative flex h-12 w-12 items-center justify-center rounded-xl border shadow-2xl backdrop-blur-md transition-all',
            isOpen
              ? 'bg-muted ring-primary/20 ring-2'
              : 'hover:border-primary/30',
          )}
          aria-label="Workspaces em rascunho"
        >
          <AnimatePresence>
            {!isOpen && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="bg-primary text-primary-foreground ring-background absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-black shadow-lg ring-2"
              >
                {draftWorkspaces.length}
              </motion.span>
            )}
          </AnimatePresence>

          <CircleDashed
            className={cn(
              'size-5 transition-transform duration-500',
              isOpen
                ? 'text-foreground rotate-180'
                : 'text-primary animate-spin-slow',
            )}
          />
        </motion.button>
      </div>
    </div>
  )
}
