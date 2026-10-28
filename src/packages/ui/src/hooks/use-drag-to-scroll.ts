import { useEffect, useRef, useState } from 'react'

export function useDragToScroll<T extends HTMLElement>(options?: {
  disabled?: boolean
}) {
  const { disabled = false } = options || {}
  const ref = useRef<T>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  useEffect(() => {
    // LOG: Verificando a props 'disabled' do hook de scroll
    console.log(
      `%c[ScrollHook] Initializing or re-evaluating. Disabled: ${disabled}`,
      'color: gray',
    )
    const el = ref.current
    if (!el) return

    const handleMouseDown = (e: MouseEvent) => {
      if (disabled) {
        console.log(
          '%c[ScrollHook] MouseDown ignored because hook is disabled.',
          'color: orange',
        )
        return
      }

      const target = e.target as HTMLElement
      if (target.closest('button, a, input, textarea, select')) {
        return
      }

      console.log(
        '%c[ScrollHook] MouseDown: Drag scroll started.',
        'color: blue',
      )
      setIsDragging(true)
      setStartX(e.pageX - el.offsetLeft)
      setScrollLeft(el.scrollLeft)
      el.style.cursor = 'grabbing'
    }

    const handleMouseLeaveOrUp = () => {
      if (isDragging) {
        console.log(
          '%c[ScrollHook] MouseUp/Leave: Drag scroll ended.',
          'color: blue',
        )
        setIsDragging(false)
        el.style.cursor = 'grab'
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || disabled) return
      // Evitar log excessivo aqui, mas pode ser descomentado se necessário
      // console.log('%c[ScrollHook] MouseMove: Scrolling...', 'color: lightblue');
      e.preventDefault()
      const x = e.pageX - el.offsetLeft
      const walk = (x - startX) * 2
      el.scrollLeft = scrollLeft - walk
    }

    const handleDragStart = (e: DragEvent) => e.preventDefault()

    el.addEventListener('mousedown', handleMouseDown)
    el.addEventListener('mouseleave', handleMouseLeaveOrUp)
    el.addEventListener('mouseup', handleMouseLeaveOrUp)
    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('dragstart', handleDragStart)

    return () => {
      el.removeEventListener('mousedown', handleMouseDown)
      el.removeEventListener('mouseleave', handleMouseLeaveOrUp)
      el.removeEventListener('mouseup', handleMouseLeaveOrUp)
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('dragstart', handleDragStart)
    }
  }, [isDragging, startX, scrollLeft, disabled])

  return ref
}
