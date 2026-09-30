import { readonly, ref } from 'vue'

const isOpen = ref(false)
let returnFocusTo: HTMLElement | undefined

/**
 * Open/closed state of the global advisor panel, shared by the header button that opens it and the
 * panel itself. It is a module singleton because the two live in unrelated subtrees of `App.vue`
 * and there is exactly one panel.
 */
export function useAdvisorPanel() {
  function open(trigger?: HTMLElement): void {
    returnFocusTo = trigger
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(trigger?: HTMLElement): void {
    if (isOpen.value) close()
    else open(trigger)
  }

  /** Safari does not focus a button on click, so the browser's own focus restoration cannot be relied on. */
  function restoreFocus(): void {
    returnFocusTo?.focus()
  }

  return { isOpen: readonly(isOpen), open, close, toggle, restoreFocus }
}
