<script setup lang="ts">
import type { SelectRootProps, SelectRootEmits } from 'reka-ui'
import { useForwardPropsEmits } from 'reka-ui'
import { SelectRoot } from 'reka-ui'

const props = defineProps<SelectRootProps>()
const emits = defineEmits<SelectRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SelectRoot v-bind="forwarded">
    <slot />
  </SelectRoot>
</template>
