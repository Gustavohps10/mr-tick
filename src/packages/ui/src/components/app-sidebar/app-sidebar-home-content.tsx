import { FileText, HomeIcon, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const mainItems = [
  { title: 'Home', url: '/', icon: HomeIcon },
  { title: 'About', url: '/about', icon: FileText },
  { title: 'Contact', url: '/contact', icon: User },
]

export function AppSidebarHomeContent() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navegar</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {mainItems.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  className="z-40 flex items-center rounded-md transition-colors [&.active]:bg-zinc-100 dark:[&.active]:bg-zinc-800"
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={
                          isActive ? 'text-primary' : 'text-foreground'
                        }
                      />
                      <span>{item.title}</span>
                    </>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
