import { useEventListener } from '@vueuse/core'
import type { Ref } from 'vue'

/**
 * Follows growing content only while the reader is at the bottom. Scrolling up to reread pauses it
 * and returning to the bottom resumes it, so a streaming answer never yanks the viewport away.
 */
export function useStickToBottom(element: Ref<HTMLElement | undefined>, threshold = 24) {
  let stuck = true

  useEventListener(element, 'scroll', () => {
    const el = element.value
    if (el === undefined) return
    stuck = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
  })

  function follow(): void {
    const el = element.value
    if (el !== undefined && stuck) el.scrollTop = el.scrollHeight
  }

  /** The user just sent something: they want to see the reply begin, wherever they had scrolled. */
  function pin(): void {
    stuck = true
    follow()
  }

  return { follow, pin }
}
