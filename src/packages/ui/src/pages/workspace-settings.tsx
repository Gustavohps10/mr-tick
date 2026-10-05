'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Briefcase, ImageIcon, Loader2, Trash2, X } from 'lucide-react'
import React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'
import { useSyncDrop } from '@/stores/syncStore'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  name: z.string().min(3, 'O nome precisa ter no mínimo 3 caracteres.'),
  description: z.string().optional(),
  avatarUrl: z.string().optional(),
  removeAvatar: z.boolean().default(false),
})

type IdentityFormData = z.infer<typeof identitySchema>

// ---------------------------------------------------------------------------
// WorkspaceAvatar
// ---------------------------------------------------------------------------

function WorkspaceAvatar({
  value,
  onChange,
  onRemove,
  name,
}: {
  value?: string
  onChange: (url: string) => void
  onRemove: () => void
  name?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [preview, setPreview] = React.useState<string | null>(value ?? null)

  React.useEffect(() => {
    setPreview(value ?? null)
  }, [value])

  const initials = name
    ?.split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    onChange(url)
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreview(null)
    onRemove()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-4">
      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 transition-all',
          preview
            ? 'border-border hover:border-primary/50'
            : 'border-muted-foreground/30 bg-muted/40 hover:border-primary/50 hover:bg-muted/60 border-dashed',
        )}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <ImageIcon className="h-4 w-4 text-white" />
            </div>
          </>
        ) : initials ? (
          <span className="text-muted-foreground text-base font-bold">
            {initials}
          </span>
        ) : (
          <Briefcase className="text-muted-foreground/50 h-5 w-5" />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-foreground text-left text-xs font-semibold underline-offset-2 hover:underline"
        >
          {preview ? 'Alterar imagem' : 'Enviar logotipo'}
        </button>
        <p className="text-muted-foreground text-[11px]">
          PNG, JPG ou SVG. Máx 2MB.
        </p>
        {preview && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-destructive/80 hover:text-destructive flex items-center gap-1 text-left text-[11px]"
          >
            <X className="h-3 w-3" />
            Remover
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DeleteWorkspaceDialog
// ---------------------------------------------------------------------------

function DeleteWorkspaceDialog({
  workspaceName,
  isRemoving,
  onConfirm,
}: {
  workspaceName: string
  isRemoving: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState('')

  const matches = confirmation === workspaceName

  function handleConfirm() {
    if (!matches) return
    onConfirm()
  }

  function handleOpenChange(next: boolean) {
    if (!next) setConfirmation('')
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" type="button">
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir Workspace
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir workspace</DialogTitle>
          <DialogDescription>
            Esta ação é permanente e não pode ser desfeita. Todos os dados,
            integrações e configurações serão removidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-muted-foreground text-sm">
            Digite{' '}
            <span className="text-foreground font-semibold">
              {workspaceName}
            </span>{' '}
            para confirmar.
          </p>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={isRemoving}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            type="button"
            disabled={!matches || isRemoving}
            onClick={handleConfirm}
          >
            {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceSettings
// ---------------------------------------------------------------------------

export function WorkspaceSettings() {
  const {
    workspace,
    isLoading,
    updateIdentity,
    isUpdatingIdentity,
    remove,
    isRemoving,
  } = useWorkspace()

  const drop = useSyncDrop()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setValue,
  } = useForm<IdentityFormData>({
    resolver: zodResolver(identitySchema),
    values: {
      name: workspace?.name ?? '',
      description: workspace?.description ?? '',
      avatarUrl: workspace?.avatarUrl ?? '',
      removeAvatar: false,
    },
  })

  async function onSubmit(data: IdentityFormData) {
    let avatarFile: Uint8Array | undefined
    let removeAvatar = false

    if (!data.avatarUrl) {
      removeAvatar = true
    } else if (data.avatarUrl.startsWith('blob:')) {
      try {
        const blob = await fetch(data.avatarUrl).then((r) => r.blob())
        avatarFile = new Uint8Array(await blob.arrayBuffer())
      } catch {
        return
      }
    }

    const updated = await updateIdentity({
      name: data.name,
      description: data.description,
      avatarFile,
      removeAvatar,
    })

    if (updated) {
      reset({
        name: updated.name,
        description: updated.description ?? '',
        avatarUrl: updated.avatarUrl ?? '',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground p-4 text-sm">
        Carregando workspace...
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Identidade */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Identidade do Workspace</CardTitle>
            <CardDescription>
              Nome, descrição e logotipo exibidos em todo o sistema.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <Controller
              name="avatarUrl"
              control={control}
              render={({ field }) => (
                <WorkspaceAvatar
                  value={field.value}
                  onChange={(url) => {
                    field.onChange(url)
                    setValue('removeAvatar', false)
                  }}
                  onRemove={() => {
                    field.onChange('')
                    setValue('removeAvatar', true)
                  }}
                  name={workspace?.name}
                />
              )}
            />

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">
                Nome do Workspace
              </Label>
              <Input
                placeholder="Ex: Redmine Atak, Freelance..."
                {...register('name')}
              />
              {errors.name && (
                <p className="text-destructive text-xs">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold">
                Descrição{' '}
                <span className="font-normal opacity-60">(opcional)</span>
              </Label>
              <Textarea
                placeholder="Descreva o propósito deste workspace..."
                className="resize-none"
                rows={3}
                {...register('description')}
              />
            </div>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || isUpdatingIdentity}
              onClick={() => reset()}
            >
              Descartar
            </Button>
            <Button type="submit" disabled={!isDirty || isUpdatingIdentity}>
              {isUpdatingIdentity && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar Alterações
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Zona de Perigo</CardTitle>
          <CardDescription>
            Ações irreversíveis que afetam permanentemente este workspace.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Excluir este workspace</p>
              <p className="text-muted-foreground text-xs">
                Remove permanentemente o workspace e todos os seus dados.
              </p>
            </div>
            <DeleteWorkspaceDialog
              workspaceName={workspace?.name ?? ''}
              isRemoving={isRemoving}
              onConfirm={async () => {
                await drop?.()
                await remove()
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
