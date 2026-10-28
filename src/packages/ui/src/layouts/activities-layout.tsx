'use client'

import { motion } from 'framer-motion'
import { ClipboardList, LayoutGrid } from 'lucide-react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

export function ActivitiesLayout() {
  const { workspaceId } = useParams()
  const location = useLocation()

  const nav = [
    {
      to: `/workspaces/${workspaceId}/activities`,
      label: 'Área de Trabalho',
      icon: LayoutGrid,
      end: true,
    },
    {
      to: `/workspaces/${workspaceId}/activities/backlog`,
      label: 'Backlog',
      icon: ClipboardList,
      end: false,
    },
  ]

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Atividades</h1>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Workspace</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Atividades</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex h-full flex-col pt-4">
        <div className="relative border-b">
          <div className="relative flex">
            {nav.map((n) => {
              const Icon = n.icon
              return (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  {({ isActive }) => (
                    <div
                      className={cn(
                        'relative flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-tighter transition-colors',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon size={16} />
                      {n.label}
                      {isActive && (
                        <motion.span
                          layoutId="activeTab"
                          className="bg-primary absolute bottom-0 left-0 h-[3px] w-full rounded-full"
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 30,
                          }}
                        />
                      )}
                    </div>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-6 py-4">
          <Outlet />
        </div>
      </div>
    </>
  )
}
