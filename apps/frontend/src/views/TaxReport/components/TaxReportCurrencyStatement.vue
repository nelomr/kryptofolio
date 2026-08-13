<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/composables/useI18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * What a filer needs to know before trusting the numbers above: which currency they are in, whether
 * they were derived, and whether anything is missing from them.
 *
 * The three facts are rendered together because they qualify each other — a converted total that is
 * also incomplete is a different document from either alone.
 */
interface UnconvertibleEvent {
  id: string;
  occurredOn: string;
  nativeAmount: string;
  nativeCurrency: string;
}

const props = defineProps<{
  currency: string;
  conversion: { kind: 'NATIVE' | 'CONVERTED' };
  unconvertibleEvents: readonly UnconvertibleEvent[];
}>();

const { t } = useI18n();

const wasConverted = computed(() => props.conversion.kind === 'CONVERTED');
const isIncomplete = computed(() => props.unconvertibleEvents.length > 0);
</script>

<template>
  <section class="mb-4 space-y-3">
    <p class="text-sm text-muted">
      {{ t('tax.currency.figures_in') }}
      <span class="num font-semibold text-foreground">{{ currency }}</span>
      <span v-if="wasConverted"> — {{ t('tax.currency.converted_at_event_date') }}</span>
    </p>

    <Alert v-if="isIncomplete" class="border-warning/40 bg-warning-soft">
      <AlertTitle class="text-warning">{{ t('tax.currency.incomplete') }}</AlertTitle>
      <AlertDescription>
        <ul class="space-y-0.5 text-muted-2">
          <li v-for="event in unconvertibleEvents" :key="event.id">
            <span class="num">{{ event.id }}</span> ·
            <span class="num">{{ event.occurredOn }}</span> ·
            <span class="num">{{ event.nativeAmount }} {{ event.nativeCurrency }}</span>
          </li>
        </ul>
      </AlertDescription>
    </Alert>
  </section>
</template>
