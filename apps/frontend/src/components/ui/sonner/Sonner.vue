<script lang="ts" setup>
import type { ToasterProps } from "vue-sonner"
import { reactiveOmit } from "@vueuse/core"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, CircleXIcon } from "lucide-vue-next"
import { Toaster as Sonner } from "vue-sonner"

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, "toastOptions")
</script>

<template>
  <Sonner
    class="toaster group"
    :toast-options="{
      classes: {
        toast: 'group toast flex items-start text-left group-[.toaster]:bg-surface group-[.toaster]:text-fg group-[.toaster]:border group-[.toaster]:border-border-soft group-[.toaster]:shadow-modal group-[.toaster]:rounded-xl font-sans !p-4 !pr-12 gap-3 !w-max !max-w-[60vw]',
        content: 'flex flex-col gap-1',
        title: 'font-semibold text-sm text-fg text-left leading-5',
        description: 'group-[.toast]:text-muted text-sm text-left',
        closeButton: '!absolute !right-4 !top-4 !left-auto !translate-x-0 !translate-y-0 !bg-transparent !border-none !text-muted hover:!text-fg transition-colors flex items-center justify-center cursor-pointer',
        actionButton:
          'group-[.toast]:bg-brand group-[.toast]:text-white hover:group-[.toast]:bg-brand-hover transition-colors px-3 py-1.5 rounded-md text-xs font-medium mt-2',
        cancelButton:
          'group-[.toast]:bg-surface-3 group-[.toast]:text-muted hover:group-[.toast]:bg-border-soft transition-colors px-3 py-1.5 rounded-md text-xs font-medium mt-2',
      },
    }"
    v-bind="delegatedProps"
  >
    <template #success-icon>
      <CircleCheckIcon class="size-5 text-profit" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-5 text-brand" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-5 text-warning" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-5 text-loss" />
    </template>
    <template #loading-icon>
      <div>
        <Loader2Icon class="size-5 animate-spin text-muted" />
      </div>
    </template>
    <template #close-icon>
      <CircleXIcon class="size-5 text-muted hover:text-fg transition-colors" />
    </template>
  </Sonner>
</template>
