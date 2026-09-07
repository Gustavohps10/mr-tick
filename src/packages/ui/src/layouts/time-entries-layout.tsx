'use client'

import { motion } from 'framer-motion'
import { CalendarDays, CalendarRange, List } from 'lucide-react'
import { NavLink, Outlet, useParams } from 'react-router-dom'

import { cn } from '@/lib/utils'

export function TimeEntriesLayout() {
  const { workspaceId } = useParams()

  const nav = [
    {
      to: `/workspaces/${workspaceId}/time-entries`,
      label: 'Modo Lista',
      icon: List,
      end: true,
    },
    {
      to: `/workspaces/${workspaceId}/time-entries/calendar`,
      label: 'Grade Mensal',
      icon: CalendarDays,
      end: false,
    },
    {
      to: `/workspaces/${workspaceId}/time-entries/timesheet`,
      label: 'Grade Semanal',
      icon: CalendarRange,
      end: false,
    },
  ]

  return (
    <>
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
                          layoutId="activeTimeEntriesTab"
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

        <div className="flex-1 overflow-hidden py-4">
          <Outlet />
        </div>
      </div>
    </>
  )
}
