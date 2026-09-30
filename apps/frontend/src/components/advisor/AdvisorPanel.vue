<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { classifyExecutionProfile, type ModelChainEntry } from '@kryptofolio/shared-types'
import { Send, Square, SquarePen, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/composables/useI18n'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'
import { useAdvisorChat } from '@/composables/useAdvisorChat'
import { useAdvisorConfigQuery } from '@/composables/queries/useAdvisorQueries'
import { useStickToBottom } from '@/composables/useStickToBottom'
import { ADVISOR_PORT_KEY } from '@/core/injectionKeys'
import AdvisorEmptyState from './AdvisorEmptyState.vue'
import AdvisorTurn from './AdvisorTurn.vue'

const { t } = useI18n()
const { isOpen, close, toggle, restoreFocus } = useAdvisorPanel()

const port = inject(ADVISOR_PORT_KEY)
if (!port) throw new Error('ADVISOR_PORT_KEY not provided')
const { turns, state, send, abort, retry, newConversation } = useAdvisorChat(port)
const isStreaming = computed(() => state.value.kind === 'streaming')

const router = useRouter()
const draft = ref('')

const config = useAdvisorConfigQuery({ enabled: isOpen })

/** What actually answered wins over what is configured: a fallback may have taken over. */
const activeModel = computed<ModelChainEntry | undefined>(() => {
  for (const turn of [...turns.value].reverse()) {
    if (turn.outcome.kind === 'done') {
      return { providerId: turn.outcome.providerId, modelId: turn.outcome.modelId }
    }
  }
  return config.data.value?.chain[0]
})
const profile = computed(() => (activeModel.value === undefined ? undefined : classifyExecutionProfile(activeModel.value)))

const scrollArea = ref<InstanceType<typeof ScrollArea>>()
const viewportElement = computed(() => scrollArea.value?.viewportElement)
const { follow, pin } = useStickToBottom(viewportElement)
watch(turns, () => nextTick(follow), { deep: true, flush: 'post' })

async function ask(message: string): Promise<void> {
  if (isStreaming.value) return
  const pending = send(message)
  await nextTick(pin)
  await pending
}

async function submit(): Promise<void> {
  const message = draft.value.trim()
  if (message === '' || isStreaming.value) return
  draft.value = ''
  await ask(message)
}

function onEnter(event: KeyboardEvent): void {
  if (event.isComposing) return
  event.preventDefault()
  void submit()
}

useEventListener(window, 'keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key !== '/') return
  event.preventDefault()
  const focused = document.activeElement
  toggle(focused instanceof HTMLElement ? focused : undefined)
})

function onOpenChange(next: boolean): void {
  if (!next) close()
}

function onCloseAutoFocus(event: Event): void {
  event.preventDefault()
  restoreFocus()
}
</script>

<template>
  <Sheet :open="isOpen" @update:open="onOpenChange">
    <SheetContent
      side="right"
      hide-close
      class="flex w-full flex-col gap-0 border-border-soft bg-surface p-0 shadow-modal sm:max-w-none md:w-[420px] motion-reduce:transition-none motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none"
      @close-auto-focus="onCloseAutoFocus"
    >
      <header class="flex h-14 shrink-0 items-center justify-between border-b border-border-soft px-4">
        <div class="flex min-w-0 items-center gap-2">
          <SheetTitle class="text-sm font-semibold">{{ t('advisor.title') }}</SheetTitle>
          <template v-if="activeModel !== undefined && profile !== undefined">
            <Badge
              variant="outline"
              data-testid="advisor-model-badge"
              class="max-w-[9rem] truncate border-border font-mono text-xs font-normal text-muted"
            >
              {{ activeModel.modelId }}
            </Badge>
            <Badge
              variant="outline"
              data-testid="advisor-profile-badge"
              :data-profile="profile === 'local' ? 'local' : 'cloud'"
              :title="profile === 'local' ? t('advisor.profile.local_hint') : t('advisor.profile.cloud_hint')"
              :class="[
                'border-transparent font-mono text-xs font-normal',
                profile === 'local' ? 'bg-surface-3 text-muted' : 'bg-warning-soft text-warning',
              ]"
            >
              {{ profile === 'local' ? t('advisor.profile.local') : t('advisor.profile.cloud') }}
            </Badge>
          </template>
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="advisor-new-conversation"
            :disabled="turns.length === 0"
            :aria-label="t('advisor.new_conversation')"
            :title="t('advisor.new_conversation')"
            @click="newConversation"
          >
            <SquarePen />
          </Button>
          <Button variant="ghost" size="icon-sm" :aria-label="t('advisor.close')" @click="close">
            <X />
          </Button>
        </div>
      </header>
      <SheetDescription class="sr-only">{{ t('advisor.description') }}</SheetDescription>

      <ScrollArea ref="scrollArea" class="min-h-0 flex-1">
        <div aria-live="polite" class="flex flex-col gap-6 p-4">
          <AdvisorEmptyState v-if="turns.length === 0" @ask="ask" />
          <AdvisorTurn
            v-for="(turn, index) in turns"
            :key="index"
            :turn="turn"
            :is-last="index === turns.length - 1"
            @retry="retry"
            @rephrase="ask"
            @navigate="(path) => router.push(path)"
            @rendered="follow"
          />
        </div>
      </ScrollArea>

      <form class="flex shrink-0 gap-2 border-t border-border-soft p-4" @submit.prevent="submit">
        <Textarea
          v-model="draft"
          :aria-label="t('advisor.input.label')"
          :placeholder="t('advisor.input.placeholder')"
          rows="2"
          :disabled="isStreaming"
          @keydown.enter.exact="onEnter"
          class="min-h-0 resize-none border-border text-sm"
        />
        <Button
          v-if="isStreaming"
          type="button"
          size="icon"
          variant="outline"
          data-testid="advisor-stop"
          :aria-label="t('advisor.stop')"
          @click="abort"
        >
          <Square />
        </Button>
        <Button v-else type="submit" size="icon" data-testid="advisor-send" :aria-label="t('advisor.send')">
          <Send />
        </Button>
      </form>
    </SheetContent>
  </Sheet>
</template>
