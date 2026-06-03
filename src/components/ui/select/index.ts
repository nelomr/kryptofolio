// Select component — reka-ui primitives wrapped with project styles
// Pattern mirrors shadcn-vue: each sub-component delegates to reka-ui via useForwardProps

export { default as Select } from './SelectRoot.vue'
export { default as SelectContent } from './SelectContent.vue'
export { default as SelectItem } from './SelectItem.vue'
export { default as SelectTrigger } from './SelectTrigger.vue'

// Re-export reka-ui primitives that don't need custom styling
export { SelectValue, SelectGroup, SelectLabel, SelectSeparator } from 'reka-ui'
