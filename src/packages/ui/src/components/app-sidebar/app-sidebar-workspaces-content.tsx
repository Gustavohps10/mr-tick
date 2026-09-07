import type { SidebarMenuItem as AddonSidebarMenuItem } from '@mr-tick/sdk'
import {
  Brain,
  CalendarDays,
  ChartColumnBig,
  ChevronRight,
  FolderGit2,
  Layers,
  LayoutDashboard,
  ListTodo,
  ListTodoIcon,
  Lock,
  type LucideIcon,
  Puzzle as PuzzleIcon,
  Scale,
  Timer,
  User,
} from 'lucide-react'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useOpenAPI } from '@/hooks'
import { cn } from '@/lib/utils'

export interface NavItem {
  title: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  isPro?: boolean
  isBlocked?: boolean
  blockedReason?: string
  onClick?: () => void
  children?: NavItem[]
}

const personalItems: NavItem[] = [
  {
    title: 'Meus Apontamentos',
    path: 'time-entries',
    icon: Timer,
  },
  {
    title: 'Métricas',
    path: 'my-metric',
    icon: ChartColumnBig,
  },
  {
    title: 'Minhas Tarefas',
    path: 'activities',
    icon: ListTodoIcon,
    isBlocked: false,
    blockedReason: 'Em breve',
  },
  {
    title: 'Calendário',
    path: 'calendar',
    icon: CalendarDays,
    isBlocked: false,
    blockedReason: 'Em breve',
  },
]

const teamItems: NavItem[] = [
  {
    title: 'Visão Geral',
    path: 'team',
    icon: LayoutDashboard,
    isPro: true,
  },
  {
    title: 'Membros',
    path: 'members',
    icon: User,
    isPro: true,
  },
  {
    title: 'Carga de Trabalho',
    path: 'workload',
    icon: Scale,
    isPro: true,
  },
  {
    title: 'Insights IA',
    path: 'insights',
    icon: Brain,
    isPro: true,
  },
]

interface SidebarNavItemProps {
  item: NavItem
  workspaceId: string | undefined
  end?: boolean
  nested?: boolean
}

function SidebarNavItem({
  item,
  workspaceId,
  end = false,
  nested = false,
}: SidebarNavItemProps) {
  const { open } = useSidebar()
  const location = useLocation()

  if (item.isBlocked) {
    return <SidebarBlockedNavItem item={item} />
  }

  const Icon = item.icon
  const hasChildren = Boolean(item.children && item.children.length > 0)
  const isChildActive = Boolean(
    hasChildren &&
    item.children?.some((child) =>
      location.pathname.includes(`/workspaces/${workspaceId}/${child.path}`),
    ),
  )

  // Caso tenha subitens e a sidebar esteja colapsada (Modo Ícones) -> Abrir Popover/DropdownMenu
  if (hasChildren && !open) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className={cn(
                'hover:bg-muted/60 text-muted-foreground hover:text-foreground flex h-8.5 w-full cursor-pointer items-center justify-center rounded-md p-0 text-sm transition-colors',
                isChildActive &&
                  'bg-muted/80 text-foreground font-medium shadow-2xs',
              )}
            >
              <Icon
                className={cn(
                  'size-4 transition-colors',
                  isChildActive ? 'text-primary' : 'opacity-70',
                )}
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={12}
            className="w-48 p-1 shadow-lg"
          >
            <DropdownMenuLabel className="text-muted-foreground/80 px-2 py-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase">
              {item.title}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1" />
            {item.children?.map((child) => {
              const ChildIcon = child.icon
              return (
                <DropdownMenuItem asChild key={child.path}>
                  <NavLink
                    to={`/workspaces/${workspaceId}/${child.path}`}
                    className={({ isActive }) =>
                      cn(
                        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-normal transition-colors',
                        isActive
                          ? 'bg-muted text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground',
                      )
                    }
                  >
                    <ChildIcon className="size-3.5 opacity-70" />
                    <span>{child.title}</span>
                    {child.isPro && <ProBadge />}
                  </NavLink>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  // Caso tenha subitens e a sidebar esteja expandida -> Collapsible com animação
  if (hasChildren && open) {
    return (
      <Collapsible defaultOpen className="group/nav-collapsible">
        <SidebarMenuItem className={nested ? 'ml-2' : undefined}>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={cn(
                'hover:bg-muted/60 text-muted-foreground hover:text-foreground flex h-8.5 w-full items-center justify-between rounded-md px-2.5 text-sm transition-colors',
                isChildActive && 'bg-muted/80 text-foreground font-medium',
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    'size-4 opacity-70',
                    isChildActive && 'text-primary',
                  )}
                />
                <span>{item.title}</span>
              </div>
              <ChevronRight className="text-muted-foreground/60 size-4 transition-transform group-data-[state=open]/nav-collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-0.5 flex flex-col space-y-0.5">
              {item.children?.map((child) => (
                <SidebarNavItem
                  key={child.path}
                  item={child}
                  workspaceId={workspaceId}
                  nested
                />
              ))}
            </div>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  if (item.onClick) {
    return (
      <SidebarMenuItem className={nested && open ? 'ml-2' : undefined}>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                onClick={item.onClick}
                className={cn(
                  'hover:bg-muted/60 text-muted-foreground hover:text-foreground flex h-8.5 w-full cursor-pointer items-center rounded-md px-2.5 text-sm transition-colors',
                  open ? 'justify-between' : 'justify-center p-0',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="size-4 opacity-70" />
                  {open && <span>{item.title}</span>}
                </div>
                {open && item.isPro && <ProBadge />}
              </SidebarMenuButton>
            </TooltipTrigger>
            {!open && (
              <TooltipContent side="right" className="text-xs">
                {item.title} {item.isPro && '(PRO)'}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem className={nested && open ? 'ml-2' : undefined}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarMenuButton asChild>
              <NavLink
                to={`/workspaces/${workspaceId}/${item.path}`}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'hover:bg-muted/60 flex h-8.5 items-center rounded-md px-2.5 text-sm font-normal transition-colors select-none',
                    open ? 'justify-between' : 'justify-center p-0',
                    isActive
                      ? 'bg-muted/80 text-foreground font-medium shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          'size-4 shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'opacity-70',
                        )}
                      />
                      {open && <span className="truncate">{item.title}</span>}
                    </div>

                    {open && item.isPro && <ProBadge />}
                  </>
                )}
              </NavLink>
            </SidebarMenuButton>
          </TooltipTrigger>
          {!open && (
            <TooltipContent side="right" className="text-xs">
              {item.title} {item.isPro && '(PRO)'}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </SidebarMenuItem>
  )
}

interface SidebarBlockedNavItemProps {
  item: NavItem
}

function SidebarBlockedNavItem({ item }: SidebarBlockedNavItemProps) {
  const { open } = useSidebar()
  const Icon = item.icon

  return (
    <SidebarMenuItem>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarMenuButton
              disabled
              className={cn(
                'text-muted-foreground/40 flex h-8.5 cursor-not-allowed items-center rounded-md px-2.5 text-sm select-none hover:bg-transparent',
                open ? 'justify-between' : 'justify-center p-0',
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 opacity-40" />
                {open && <span>{item.title}</span>}
              </div>

              {open && <Lock className="size-3.5 opacity-50" />}
            </SidebarMenuButton>
          </TooltipTrigger>

          <TooltipContent side="right" className="text-xs">
            <p>
              {item.title} — {item.blockedReason ?? 'Bloqueado temporariamente'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </SidebarMenuItem>
  )
}

function ProBadge() {
  return (
    <Badge
      variant="secondary"
      className="h-4 border-amber-500/20 bg-amber-500/10 px-1.5 font-mono text-[9px] font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400"
    >
      PRO
    </Badge>
  )
}

interface SidebarNavItemsProps {
  items: NavItem[]
  workspaceId: string | undefined
  end?: boolean
  nested?: boolean
}

function SidebarNavItems({
  items,
  workspaceId,
  end = false,
  nested = false,
}: SidebarNavItemsProps) {
  return (
    <SidebarMenu className="gap-0.5">
      {items.map((item) => (
        <SidebarNavItem
          key={item.path || item.title}
          item={item}
          workspaceId={workspaceId}
          end={end}
          nested={nested}
        />
      ))}
    </SidebarMenu>
  )
}

interface SidebarSectionProps {
  title: string
  children: React.ReactNode
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  const { open } = useSidebar()

  return (
    <SidebarGroup className="py-1">
      {open ? (
        <SidebarGroupLabel className="text-muted-foreground/70 px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wider uppercase">
          {title}
        </SidebarGroupLabel>
      ) : (
        <div className="bg-border/50 mx-2 my-1 h-px" />
      )}

      <SidebarGroupContent className="pt-0.5">{children}</SidebarGroupContent>
    </SidebarGroup>
  )
}

const iconMap: Record<string, LucideIcon> = {
  Layers,
  ListTodo,
  FolderGit2,
  Puzzle: PuzzleIcon,
}

function resolveIcon(name?: string): LucideIcon {
  if (name && iconMap[name]) {
    return iconMap[name]
  }
  return PuzzleIcon
}

function SidebarAddonSection({
  workspaceId,
}: {
  workspaceId: string | undefined
}) {
  const { open } = useSidebar()
  const location = useLocation()
  const api = useOpenAPI()
  const [addonMenus, setAddonMenus] = useState<AddonSidebarMenuItem[]>([])

  useEffect(() => {
    let isMounted = true

    async function loadAddonMenus() {
      try {
        const response = await api.integrations.addons.getSidebarMenus()
        if (!isMounted) return
        if (!response?.isSuccess || !Array.isArray(response.data)) return
        setAddonMenus(response.data)
      } catch (err: unknown) {
        console.error('Erro ao carregar menus dos addons:', err)
      }
    }

    loadAddonMenus()
    return () => {
      isMounted = false
    }
  }, [api])

  if (addonMenus.length === 0) return null

  return (
    <SidebarSection title="Addons">
      <SidebarMenu className="gap-0.5">
        {addonMenus.map((menu) => {
          const Icon = resolveIcon(menu.icon)
          const hasChildren = Boolean(menu.children && menu.children.length > 0)
          const isChildActive = Boolean(
            hasChildren &&
            menu.children?.some((sub) =>
              location.pathname.includes(
                `/workspaces/${workspaceId}${sub.href}`,
              ),
            ),
          )

          // 1. Caso com filhos e sidebar colapsada (Modo Ícones) -> DropdownMenu Popover flutuante
          if (hasChildren && !open) {
            return (
              <SidebarMenuItem key={menu.id}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      className={cn(
                        'hover:bg-muted/60 text-muted-foreground hover:text-foreground flex h-8.5 w-full cursor-pointer items-center justify-center rounded-md p-0 text-sm transition-colors',
                        isChildActive &&
                          'bg-muted/80 text-foreground font-medium shadow-2xs',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4 transition-colors',
                          isChildActive ? 'text-primary' : 'opacity-70',
                        )}
                      />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="start"
                    sideOffset={12}
                    className="w-48 p-1 shadow-lg"
                  >
                    <DropdownMenuLabel className="text-muted-foreground/80 px-2 py-1.5 font-mono text-[11px] font-semibold tracking-wider uppercase">
                      {menu.label}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="my-1" />
                    {menu.children?.map((sub) => {
                      const SubIcon = resolveIcon(sub.icon)
                      return (
                        <DropdownMenuItem asChild key={sub.id}>
                          <NavLink
                            to={`/workspaces/${workspaceId}${sub.href}`}
                            className={({ isActive }) =>
                              cn(
                                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-normal transition-colors',
                                isActive
                                  ? 'bg-muted text-foreground font-medium'
                                  : 'text-muted-foreground hover:text-foreground',
                              )
                            }
                          >
                            <SubIcon className="size-3.5 opacity-70" />
                            <span>{sub.label}</span>
                          </NavLink>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )
          }

          // 2. Caso com filhos e sidebar expandida -> Collapsible com animação
          if (hasChildren && open) {
            return (
              <Collapsible
                key={menu.id}
                defaultOpen
                className="group/addon-menu"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={cn(
                        'hover:bg-muted/60 text-muted-foreground hover:text-foreground flex h-8.5 w-full items-center justify-between rounded-md px-2.5 text-sm transition-colors',
                        isChildActive &&
                          'bg-muted/80 text-foreground font-medium',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            'size-4 opacity-70',
                            isChildActive && 'text-primary',
                          )}
                        />
                        <span>{menu.label}</span>
                      </div>
                      <ChevronRight className="text-muted-foreground/60 size-4 transition-transform group-data-[state=open]/addon-menu:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-0.5 flex flex-col space-y-0.5">
                      {menu.children?.map((sub) => {
                        const SubIcon = resolveIcon(sub.icon)
                        return (
                          <SidebarMenuItem key={sub.id} className="ml-2">
                            <SidebarMenuButton asChild>
                              <NavLink
                                to={`/workspaces/${workspaceId}${sub.href}`}
                                className={({ isActive }) =>
                                  cn(
                                    'hover:bg-muted/60 flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-normal transition-colors select-none',
                                    isActive
                                      ? 'bg-muted/80 text-foreground font-medium shadow-2xs'
                                      : 'text-muted-foreground hover:text-foreground',
                                  )
                                }
                              >
                                <SubIcon className="size-3.5 opacity-60" />
                                <span>{sub.label}</span>
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </div>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          }

          // 3. Item simples sem filhos
          return (
            <SidebarMenuItem key={menu.id}>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={`/workspaces/${workspaceId}${menu.href ?? ''}`}
                        className={({ isActive }) =>
                          cn(
                            'hover:bg-muted/60 flex h-8.5 items-center rounded-md px-2.5 text-sm font-normal transition-colors select-none',
                            open ? 'gap-2.5' : 'justify-center p-0',
                            isActive
                              ? 'bg-muted/80 text-foreground font-medium shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              className={cn(
                                'size-4 shrink-0 transition-colors',
                                isActive ? 'text-primary' : 'opacity-70',
                              )}
                            />
                            {open && (
                              <span className="truncate">{menu.label}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {!open && (
                    <TooltipContent side="right" className="text-xs">
                      {menu.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarSection>
  )
}

export function AppSidebarWorkspacesContent() {
  const { workspaceId } = useParams<{
    workspaceId: string
  }>()

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <SidebarSection title="Pessoal">
        <SidebarNavItems items={personalItems} workspaceId={workspaceId} />
      </SidebarSection>

      <SidebarSection title="Gestão de Time">
        <SidebarNavItems items={teamItems} workspaceId={workspaceId} />
      </SidebarSection>

      <SidebarAddonSection workspaceId={workspaceId} />
    </div>
  )
}
