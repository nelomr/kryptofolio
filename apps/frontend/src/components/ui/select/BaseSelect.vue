<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SelectRootEmits, SelectRootProps } from "reka-ui"
import { useForwardPropsEmits } from "reka-ui"

export interface SelectOption {
  value: string;
  label: string;
}

const props = defineProps<SelectRootProps & {
  options: SelectOption[];
  label?: string;
  placeholder?: string;
}>()

const emits = defineEmits<SelectRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="block text-sm font-medium text-fg mb-2">
      {{ label }}
    </label>
    <Select v-bind="forwarded">
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="placeholder ?? 'Select an option'" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem
            v-for="opt in options"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
</template>
