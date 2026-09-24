import { FileData } from '@mr-tick/application'
import { WorkspaceViewModel } from '@mr-tick/shared/view-models'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, ReactNode, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { useHostBridge } from '@/hooks'

export interface CreateWorkspaceInput {
  name: string
  description?: string
  avatarFile?: FileData
}

export interface UpdateIdentityInput {
  name: string
  description?: string
  avatarFile?: Uint8Array
  removeAvatar: boolean
}

export interface WorkspaceContextType {
  workspace?: WorkspaceViewModel | null
  workspaces: WorkspaceViewModel[]
  isLoading: boolean
  isLoadingWorkspaces: boolean
  create: (
    input: CreateWorkspaceInput,
  ) => Promise<WorkspaceViewModel | undefined>
  updateIdentity: (
    input: UpdateIdentityInput,
  ) => Promise<WorkspaceViewModel | undefined>
  remove: () => Promise<void>
  isCreating: boolean
  isUpdatingIdentity: boolean
  isRemoving: boolean
}

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (id: string) => ['workspace', id] as const,
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined,
)

interface WorkspaceProviderProps {
  children: ReactNode
  workspaceId?: string
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({
  children,
  workspaceId,
}) => {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: workspace, isLoading } = useQuery({
    queryKey: workspaceId
      ? workspaceKeys.detail(workspaceId)
      : ['workspace', 'idle'],
    queryFn: async () => {
      if (!workspaceId) return null

      const response = await bridge.workspaces.getById({
        body: { workspaceId },
      })

      if (!response.isSuccess || !response.data) return null
      return response.data
    },
    enabled: !!workspaceId,
    retry: false,
  })

  useEffect(() => {
    if (workspaceId) {
      bridge.addons.setActiveWorkspace({ body: { workspaceId } })
    }
  }, [workspaceId, bridge])

  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: async () => {
      const response = await bridge.workspaces.listAll()

      if (!response.isSuccess) {
        toast.error('Falha ao carregar workspaces.')
        return []
      }

      return response.data ?? []
    },
  })

  const { mutateAsync: create, isPending: isCreating } = useMutation({
    mutationFn: async (input: CreateWorkspaceInput) => {
      const response = await bridge.workspaces.create({ body: input })
      if (!response.isSuccess) throw new Error(response.error)
      return response.data
    },
    onSuccess: (newWorkspace) => {
      if (!newWorkspace) return

      queryClient.setQueryData<WorkspaceViewModel[]>(
        workspaceKeys.all,
        (prev) => (prev ? [...prev, newWorkspace] : [newWorkspace]),
      )

      toast.success('Workspace criado com sucesso.')
    },
    onError: () => toast.error('Falha ao criar workspace.'),
  })

  const { mutateAsync: updateIdentity, isPending: isUpdatingIdentity } =
    useMutation({
      mutationFn: async (input: UpdateIdentityInput) => {
        if (!workspaceId) throw new Error('workspaceId ausente.')

        const response = await bridge.workspaces.updateIdentity({
          body: { workspaceId, ...input },
        })

        if (!response.isSuccess) throw new Error(response.error)
        return response.data
      },
      onSuccess: (updated) => {
        if (!updated || !workspaceId) return

        const withBuster = {
          ...updated,
          avatarUrl: updated.avatarUrl
            ? `${updated.avatarUrl}?buster=${Date.now()}`
            : updated.avatarUrl,
        }

        queryClient.setQueryData<WorkspaceViewModel>(
          workspaceKeys.detail(workspaceId),
          withBuster,
        )

        queryClient.setQueryData<WorkspaceViewModel[]>(
          workspaceKeys.all,
          (prev) =>
            prev?.map((w) => (w.id === workspaceId ? withBuster : w)) ?? [],
        )

        toast.success('Identidade atualizada com sucesso.')
      },
      onError: () => toast.error('Falha ao atualizar workspace.'),
    })

  const { mutateAsync: remove, isPending: isRemoving } = useMutation({
    mutationFn: async () => {
      if (!workspaceId) return

      const response = await bridge.workspaces.delete({
        body: { workspaceId },
      })

      if (!response.isSuccess) throw new Error(response.error)
    },
    onSuccess: () => {
      queryClient.setQueryData<WorkspaceViewModel[]>(
        workspaceKeys.all,
        (prev) => prev?.filter((w) => w.id !== workspaceId) ?? [],
      )

      queryClient.removeQueries({
        queryKey: workspaceKeys.detail(workspaceId!),
      })

      toast.success('Workspace removido.')
      navigate('/')
    },
    onError: () => toast.error('Falha ao remover workspace.'),
  })

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces,
        isLoading,
        isLoadingWorkspaces,
        create,
        updateIdentity,
        remove,
        isCreating,
        isUpdatingIdentity,
        isRemoving,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext)

  if (!context) {
    throw new Error('useWorkspace must be used within a <WorkspaceProvider>')
  }

  return context
}
