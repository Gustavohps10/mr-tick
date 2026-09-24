'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

import { useHostBridge } from '@/hooks'

interface ToastEventPayload {
  action?: 'show' | 'dismiss'
  toastId?: string
  type?: 'info' | 'success' | 'warning' | 'error' | 'loading'
  message: string
  title?: string
}

export function AddonToastBridge() {
  const bridge = useHostBridge()

  useEffect(() => {
    if (!bridge?.events?.on) return

    const unsub = bridge.events.on<ToastEventPayload>(
      'addons:toast',
      (toastData) => {
        console.log('🔔 [UI] Toast event received in renderer:', toastData)
        if (!toastData) return

        if (toastData.action === 'dismiss' && toastData.toastId) {
          toast.dismiss(toastData.toastId)
          return
        }

        const type = toastData.type ? toastData.type : 'info'
        const options = {
          id: toastData.toastId,
          description: toastData.title,
        }

        switch (type) {
          case 'loading':
            toast.loading(toastData.message, options)
            return
          case 'success':
            toast.success(toastData.message, options)
            return
          case 'error':
            toast.error(toastData.message, options)
            return
          case 'warning':
            toast.warning(toastData.message, options)
            return
          default:
            toast.info(toastData.message, options)
            return
        }
      },
    )

    return () => {
      unsub()
    }
  }, [bridge])

  return null
}
