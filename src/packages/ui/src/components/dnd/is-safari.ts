import { once } from '@atlaskit/pragmatic-drag-and-drop/once'

export const isSafari = once(function isSafari(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false
  }

  const { userAgent } = navigator
  return userAgent.includes('AppleWebKit') && !userAgent.includes('Chrome')
})
