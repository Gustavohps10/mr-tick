'use client'

import { HelpCircle, Minus, Square, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { NotificationsPopover } from '@/components/notifications/notifications-popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHostBridge } from '@/hooks'
import { useEnvironment } from '@/hooks/use-environment'

export interface TitleBarProps {
  title?: string
  children?: React.ReactNode
}

export function TitleBar({ title, children }: TitleBarProps) {
  const environment = useEnvironment()
  const bridge = useHostBridge()
  const [isMaximized, setIsMaximized] = useState(false)

  const platform = environment?.platform ?? 'web'
  const isWeb = platform === 'web'
  const isMac = platform === 'darwin'
  const isWindowsOrLinux = platform === 'win32' || platform === 'linux'

  // Consulta o estado inicial de maximizado
  useEffect(() => {
    if (isWeb) return

    bridge.system
      .isMaximized('main')
      .then((maximized) => setIsMaximized(Boolean(maximized)))
      .catch(() => {})
  }, [bridge, isWeb])

  // Ouve eventos em tempo real do Electron Main
  useEffect(() => {
    if (isWeb) return

    const unsub = bridge.events.on<boolean>(
      'window:maximized-change',
      (maximized) => {
        setIsMaximized(Boolean(maximized))
      },
    )

    return () => unsub()
  }, [bridge, isWeb])

  const handleMinimize = () => {
    bridge.system.minimizeWindow('main')
  }

  const handleMaximizeToggle = async () => {
    if (isMaximized) {
      await bridge.system.unmaximizeWindow('main')
      setIsMaximized(false)
      return
    }
    await bridge.system.maximizeWindow('main')
    setIsMaximized(true)
  }

  const handleClose = () => {
    bridge.system.closeWindow('main')
  }

  // Estilos de região arrastável
  const dragStyle = {
    WebkitAppRegion: 'drag',
  } as React.CSSProperties

  const noDragStyle = {
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties

  return (
    <header
      style={dragStyle}
      className="bg-background/95 text-foreground relative z-50 flex h-9 w-full shrink-0 items-center justify-between backdrop-blur-md select-none"
    >
      {/* 1. SEÇÃO ESQUERDA (macOS Traffic Lights) */}
      <div className="flex items-center gap-2 px-3">
        {isMac && (
          <div style={noDragStyle} className="flex items-center gap-2 pr-2">
            <button
              type="button"
              onClick={handleClose}
              className="border-border/20 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full border bg-[#ff5f56] transition-transform hover:brightness-90 active:scale-95"
              aria-label="Fechar"
            />
            <button
              type="button"
              onClick={handleMinimize}
              className="border-border/20 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full border bg-[#ffbd2e] transition-transform hover:brightness-90 active:scale-95"
              aria-label="Minimizar"
            />
            <button
              type="button"
              onClick={handleMaximizeToggle}
              className="border-border/20 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full border bg-[#27c93f] transition-transform hover:brightness-90 active:scale-95"
              aria-label="Maximizar"
            />
          </div>
        )}
      </div>

      {/* 2. SEÇÃO CENTRAL (Título / Drag Area / Workspace Header) */}
      <div className="pointer-events-none absolute inset-0 mx-auto flex h-full w-fit items-center justify-center">
        {title ? (
          <span className="text-muted-foreground/70 pointer-events-none truncate text-xs font-medium tracking-tight">
            {title}
          </span>
        ) : children ? (
          <div
            style={noDragStyle}
            className="pointer-events-auto flex items-center justify-center"
          >
            {children}
          </div>
        ) : null}
      </div>

      {/* 3. SEÇÃO DIREITA (Ajuda & Controles do Sistema) */}
      <div className={`flex h-full items-center ${isMac ? 'pr-3' : ''}`}>
        <div style={noDragStyle} className="flex h-full items-center gap-1">
          {/* Botão de Notificações */}
          <NotificationsPopover />

          {/* Botão de Ajuda (Estilo Discord) */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm transition-colors"
                  aria-label="Ajuda e Documentação"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                Ajuda e Atalhos
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isWindowsOrLinux && (
            <>
              {/* Separador Vertical Sutil */}
              <div className="bg-border/60 mx-1.5 h-3.5 w-px" />

              {/* Minimizar */}
              <button
                type="button"
                onClick={handleMinimize}
                className="hover:bg-muted/80 text-muted-foreground hover:text-foreground flex h-full w-10 items-center justify-center transition-colors"
                title="Minimizar"
                aria-label="Minimizar"
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>

              {/* Maximizar / Restaurar */}
              <button
                type="button"
                onClick={handleMaximizeToggle}
                className="hover:bg-muted/80 text-muted-foreground hover:text-foreground flex h-full w-10 items-center justify-center transition-colors"
                title={isMaximized ? 'Restaurar' : 'Maximizar'}
                aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}
              >
                {isMaximized ? (
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M4 4V1.5A.5.5 0 0 1 4.5 1h10a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H12" />
                    <rect x="1.5" y="4.5" width="10" height="10" rx="0.5" />
                  </svg>
                ) : (
                  <Square className="h-3 w-3" strokeWidth={1.5} />
                )}
              </button>

              {/* Fechar */}
              <button
                type="button"
                onClick={handleClose}
                className="text-muted-foreground flex h-full w-10 items-center justify-center transition-colors hover:bg-red-600 hover:text-white active:bg-red-700"
                title="Fechar"
                aria-label="Fechar"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
