'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useHostBridge } from '@/hooks/use-host-bridge'

export function AddonThemeBridge() {
  const bridge = useHostBridge()
  const queryClient = useQueryClient()

  const { data: activeTheme } = useQuery({
    queryKey: ['addons', 'activeTheme'],
    queryFn: async () => {
      const res = await bridge.addons.getActiveTheme()
      console.log('🎨 [AddonThemeBridge] API getActiveTheme response:', res)
      if (!res.isSuccess) return null
      return res.data
    },
    staleTime: 0,
  })

  // Escuta evento IPC em tempo real caso esteja rodando no Electron
  useEffect(() => {
    if (!bridge?.events?.on) return

    const unsubscribe = bridge.events.on(
      'addons:theme-changed',
      (theme: unknown) => {
        console.log(
          '🎨 [AddonThemeBridge] Evento IPC "addons:theme-changed" recebido:',
          theme,
        )
        queryClient.setQueryData(['addons', 'activeTheme'], theme)
      },
    )

    return () => {
      unsubscribe?.()
    }
  }, [bridge, queryClient])

  useEffect(() => {
    const STYLE_ID = 'mr-tick-addon-active-theme'
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null

    console.log(
      '🎨 [AddonThemeBridge] Atualizando estilos DOM. Tema Ativo:',
      activeTheme
        ? `${activeTheme.name} (${activeTheme.id})`
        : 'Nenhum (Padrão)',
    )

    if (activeTheme?.css) {
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = STYLE_ID
        styleEl.setAttribute('type', 'text/css')
        document.head.appendChild(styleEl)
        console.log(
          '🎨 [AddonThemeBridge] Tag <style id="mr-tick-addon-active-theme"> inserida no <head>.',
        )
      }

      // Extrai apenas as variáveis :root e .dark do CSS bruto, ignorando @theme e @apply
      // Isso é necessário porque o Tailwind v4 no lado do cliente (Vite) já injeta o necessário,
      // nós só precisamos substituir os valores das variáveis CSS.
      let rootVars = ''
      let darkVars = ''

      const rootMatch = activeTheme.css.match(/:root\s*{([^}]*)}/)
      if (rootMatch) {
        rootVars = rootMatch[1].trim()
      }

      const darkMatch = activeTheme.css.match(/\.dark\s*{([^}]*)}/)
      if (darkMatch) {
        darkVars = darkMatch[1].trim()
      }

      // Reconstrói um CSS válido e de alta especificidade (sem at-rules inválidas)
      const cleanCss = `
        :root:root {
          ${rootVars}
        }
        .dark:root {
          ${darkVars}
        }
      `

      styleEl.textContent = cleanCss
      console.log(
        `🎨 [AddonThemeBridge] CSS tratado do Addon (${activeTheme.name}) aplicado no DOM:\n${cleanCss}`,
      )
    } else {
      if (styleEl) {
        styleEl.remove()
        console.log(
          '🎨 [AddonThemeBridge] Tag de estilo removida. Interface retornou ao tema padrão nativo.',
        )
      }
    }
  }, [activeTheme])

  return null
}
