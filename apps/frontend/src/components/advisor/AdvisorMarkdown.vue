<script setup lang="ts">
import { nextTick, onScopeDispose, shallowRef, watch } from 'vue'
import { renderAdvisorMarkdown } from './advisorMarkdown'

const props = defineProps<{ source: string; streaming?: boolean }>()
const emit = defineEmits<{ navigate: [path: string]; rendered: [] }>()

const html = shallowRef('')
let frame: number | undefined

function renderNow(): void {
  if (frame !== undefined) {
    cancelAnimationFrame(frame)
    frame = undefined
  }
  html.value = renderAdvisorMarkdown(props.source)
}

// Tokens can arrive faster than a frame; parsing the whole answer per token would only be
// thrown away by the next one.
function scheduleRender(): void {
  if (frame !== undefined) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    html.value = renderAdvisorMarkdown(props.source)
  })
}

watch(
  () => [props.source, props.streaming] as const,
  ([, streaming]) => {
    if (streaming === true) scheduleRender()
    else renderNow()
  },
  { immediate: true, flush: 'sync' },
)

watch(html, () => nextTick(() => emit('rendered')), { flush: 'post' })

onScopeDispose(() => {
  if (frame !== undefined) cancelAnimationFrame(frame)
})

function onClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a')
  const href = anchor?.getAttribute('href')
  if (href === null || href === undefined) return
  event.preventDefault()
  emit('navigate', href)
}
</script>

<template>
  <div
    :class="[
      'break-words [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_table]:w-full [&_td]:border [&_td]:border-border-soft [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border-soft [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5',
      streaming ? 'inline [&>p:last-child]:inline' : '',
    ]"
    @click="onClick"
    v-html="html"
  />
</template>
