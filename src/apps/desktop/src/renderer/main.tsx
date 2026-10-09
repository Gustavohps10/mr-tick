import React from 'react'
import { createRoot } from 'react-dom/client'

async function startRenderer(): Promise<void> {
  if (window.location.hash === '#/runtime') {
    const { startLocalRuntimeRenderer } = await import('./local-runtime')
    await startLocalRuntimeRenderer()
    return
  }
  const root = document.getElementById('root')
  if (!root) return
  const { AppDesktop } = await import('@/renderer/App')
  createRoot(root).render(
    <React.StrictMode>
      <AppDesktop />
    </React.StrictMode>,
  )
}

void startRenderer()
