'use client'

import { cva } from 'class-variance-authority'
import { motion } from 'framer-motion'
import {
  Compass,
  HomeIcon,
  LayoutGridIcon,
  PlusIcon,
  Settings,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useOpenAPI } from '@/hooks'
import { useTimerSettings } from '@/hooks/use-timer-settings'
import { cn } from '@/lib'

const sidebarButtonVariants = cva(
  'group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg shadow-sm transition-colors duration-150',
  {
    variants: {
      isActive: {
        true: 'bg-primary text-primary-foreground',
        false:
          'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      },
    },
    defaultVariants: {
      isActive: false,
    },
  },
)

interface IndicatorProps {
  isActive: boolean
  isHovered: boolean
}

function RailIndicators({ isActive, isHovered }: IndicatorProps) {
  return (
    <>
      {/* Barra de Seleção Principal: Desliza apenas entre itens ativos */}
      {isActive && (
        <motion.span
          layoutId="active-indicator"
          className="bg-primary absolute top-0 -left-3.5 z-20 h-10 w-1 rounded-r-md"
          transition={{
            type: 'spring',
            stiffness: 350,
            damping: 28,
          }}
        />
      )}

      {/* Indicador de Hover: Desliza acompanhando o mouse apenas em itens inativos */}
      {!isActive && isHovered && (
        <motion.span
          layoutId="hover-indicator"
          className="bg-muted-foreground/40 absolute top-3 -left-3.5 z-10 h-4 w-1 rounded-r-md"
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
          }}
        />
      )}
    </>
  )
}

export function AppRail({
  onNewWorkspaceClick,
  onSettingsClick,
}: {
  onNewWorkspaceClick: () => void
  onSettingsClick: () => void
}) {
  const { workspaces } = useWorkspace()
  const openAPI = useOpenAPI()
  const { setSelectedWorkspaceId } = useTimerSettings()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <nav
      onMouseLeave={() => setHoveredId(null)}
      className="relative flex h-full w-[72px] flex-col items-center space-y-3 py-4 select-none"
    >
      {/* Home */}
      <NavLink
        to="/"
        end
        onMouseEnter={() => setHoveredId('home')}
        className={({ isActive }) =>
          cn(sidebarButtonVariants({ isActive }), 'shrink-0')
        }
      >
        {({ isActive }) => (
          <>
            <RailIndicators
              isActive={isActive}
              isHovered={hoveredId === 'home'}
            />
            <HomeIcon className="size-5" />
          </>
        )}
      </NavLink>

      <hr className="border-border w-8 border-t" />

      {/* Workspaces */}
      <div className="flex w-full flex-1 flex-col items-center space-y-3 overflow-x-hidden overflow-y-auto">
        {workspaces
          .filter((w) => w.status === 'configured')
          .map((workspace) => (
            <NavLink
              key={workspace.id}
              to={`/workspaces/${workspace.id}`}
              onClick={() => {
                setSelectedWorkspaceId(workspace.id)
                openAPI.events?.emit?.('workspace:switched', {
                  workspaceId: workspace.id,
                })
              }}
              onMouseEnter={() => setHoveredId(workspace.id)}
              className={({ isActive }) =>
                cn(
                  'group bg-background text-muted-foreground hover:text-foreground relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg shadow-sm transition-colors duration-150',
                  isActive && 'text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <RailIndicators
                    isActive={isActive}
                    isHovered={hoveredId === workspace.id}
                  />

                  <div className="h-full w-full overflow-hidden rounded-lg">
                    <Avatar className="bg-background h-full w-full rounded-lg border-none">
                      <AvatarImage
                        src={workspace.avatarUrl}
                        alt={workspace.name}
                        className="h-full w-full object-cover"
                      />
                      <AvatarFallback className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center rounded-lg">
                        <LayoutGridIcon className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </>
              )}
            </NavLink>
          ))}

        <hr className="border-border w-8 shrink-0 border-t" />

        <button
          onClick={onNewWorkspaceClick}
          onMouseEnter={() => setHoveredId('new-workspace')}
          className={cn(sidebarButtonVariants(), 'shrink-0')}
        >
          <RailIndicators
            isActive={false}
            isHovered={hoveredId === 'new-workspace'}
          />
          <PlusIcon className="size-5" />
        </button>

        <button
          onMouseEnter={() => setHoveredId('explore')}
          className={cn(sidebarButtonVariants(), 'shrink-0')}
        >
          <RailIndicators
            isActive={false}
            isHovered={hoveredId === 'explore'}
          />
          <Compass className="size-5" />
        </button>
        <button
          onClick={onSettingsClick}
          onMouseEnter={() => setHoveredId('settings')}
          className={cn(sidebarButtonVariants(), 'mt-auto mb-2 shrink-0')}
        >
          <RailIndicators
            isActive={false}
            isHovered={hoveredId === 'settings'}
          />
          <Settings className="size-5" />
        </button>
      </div>
    </nav>
  )
}
