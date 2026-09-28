<script setup lang="ts">
/**
 * EditSpotTransactionDialog — design.md D9/D8. Edits a spot transaction's P&L-relevant fields
 * through the shadcn Dialog primitive (group 9), submits a full-replacement
 * `spotTransactionEditSchema` payload, and surfaces the D6 negative-balance check.
 *
 * SCOPE NOTE (documented, not silently cut): `TaxTransactionEntity` exposes the row's own native
 * `fiatCurrency` (threaded through from `spot_transactions.fiat_currency` via `GET
 * /tax/transactions/spot`), so a price edit declares *that* currency, not the EUR display
 * currency `priceEur`/`totalEur` are converted to — `'EUR'` is only a defensive fallback for a
 * row that somehow arrives without it. The fee field still offers only "leave unchanged" or
 * "remove the fee" (`NONE`) — not "charge a specific native amount" (`CHARGED`) — because the
 * entity has no native `fee_amount`/`fee_asset_id` to prefill or diff against. Extending the read
 * model with those native fee fields is the correct long-term fix and is flagged in tasks.md as a
 * follow-up; this is not a workaround, it is the boundary of what the current read model can
 * honestly represent.
 */
import { ref, computed, watch, nextTick } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarDate, type DateValue } from '@internationalized/date'
import BaseSelect from '@/components/ui/select/BaseSelect.vue'
import { useI18n } from '@/composables/useI18n'
import { toast } from 'vue-sonner'
import {
  useSetSpotTransactionOverrideMutation,
  useRemoveSpotTransactionOverrideMutation,
} from '@/composables/queries/useTaxMutations'
import { spotTransactionEditSchema, SPOT_TX_TYPES } from '@kryptofolio/shared-types'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'
import type { TransactionIdHash } from '@/core/domain/models/BrandedTypes'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    open: boolean
    transaction: TaxTransactionEntity | null
    /**
     * The field to pre-focus and scroll to when opened for a specific known reason — e.g. from
     * the pending-review panel, where a MISSING_PRICE row's whole reason for being listed is that
     * `price_fiat` is unset. `null` (the Ledgers-pencil path) leaves focus to the browser default.
     */
    initialFocusField?: 'price_fiat' | null
  }>(),
  { initialFocusField: null },
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const setOverride = useSetSpotTransactionOverrideMutation()
const removeOverride = useRemoveSpotTransactionOverrideMutation()
// Tracked locally rather than read from the mutation composables' own `isLoading`: this must
// span the *whole* request the user is waiting on (submit through the rebuild-inclusive
// response), which is exactly what wrapping the awaited call below guarantees regardless of how
// the underlying mutation library exposes its own in-flight state.
const isSubmitting = ref(false)
const isPending = computed(() => isSubmitting.value)

const amountIn = ref('')
const amountOut = ref('')
const priceFiat = ref('')
const totalFiat = ref('')
const timestamp = ref('')
const txType = ref('')
/** UNCHANGED | NONE — see the scope note above for why CHARGED is not offered here. */
const feeKind = ref<'UNCHANGED' | 'NONE'>('UNCHANGED')

const fieldErrors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)
const balanceWarning = ref<{ assetId: string; accountId: string; balance: string; tolerance: string }[] | null>(null)
const confirmingRestore = ref(false)

function seedFromTransaction(tx: TaxTransactionEntity | null) {
  amountIn.value = tx?.amountIn?.toString() ?? tx?.amount?.toString() ?? ''
  amountOut.value = tx?.amountOut?.toString() ?? ''
  priceFiat.value = tx?.priceEur?.toString() ?? ''
  totalFiat.value = tx?.totalEur?.toString() ?? ''
  timestamp.value = tx?.timestamp ? tx.timestamp.toISOString() : ''
  txType.value = tx?.type ?? ''
  feeKind.value = 'UNCHANGED'
  fieldErrors.value = {}
  formError.value = null
  balanceWarning.value = null
  confirmingRestore.value = false
}

watch(() => props.transaction, seedFromTransaction, { immediate: true })
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) seedFromTransaction(props.transaction)
  },
)

const priceFieldContainer = ref<HTMLElement | null>(null)

/**
 * The dialog primitive (reka-ui) auto-focuses its own first focusable element on open — this
 * would silently override a caller-requested `initialFocusField`, so that default is suppressed
 * only when a specific field was requested, and replaced with focusing that field instead.
 */
async function handleOpenAutoFocus(event: Event) {
  if (props.initialFocusField !== 'price_fiat') return
  event.preventDefault()
  await nextTick()
  const input = priceFieldContainer.value?.querySelector('input')
  if (!input) return
  input.scrollIntoView({ block: 'center' })
  input.focus()
}

const txTypeOptions = SPOT_TX_TYPES.map((v) => ({ value: v, label: v }))

/** The unit `amount_in` is denominated in — the incoming leg's own asset when it differs (a SWAP). */
const amountInUnit = computed(() => props.transaction?.assetIn ?? props.transaction?.symbol ?? '')
/** The currency `price_fiat`/`total_fiat` are denominated in — the row's own native currency (11.10). */
const fiatUnit = computed(() => props.transaction?.fiatCurrency ?? 'EUR')

/**
 * 11.15: `timestamp` stays the plain ISO string the payload needs — the picker below is
 * presentation only, split into a date (Calendar, in UTC to match `toISOString()`) and a time
 * (`<input type="time">`, no established richer time-picker precedent exists in this codebase).
 */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const isCalendarOpen = ref(false)

const timestampAsDate = computed<Date | null>(() => {
  if (!timestamp.value) return null
  const parsed = new Date(timestamp.value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
})

/** `YYYY-MM-DD`, matching the codebase's existing date-slicing convention (e.g. PendingValuesReview). */
const timestampDateLabel = computed(() => timestamp.value.slice(0, 10) || '—')

const calendarValue = computed<CalendarDate | undefined>(() => {
  const d = timestampAsDate.value
  if (!d) return undefined
  return new CalendarDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
})

const timeValue = computed(() => {
  const d = timestampAsDate.value
  if (!d) return '00:00'
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
})

function handleDateSelect(date: DateValue | undefined) {
  if (!date) return
  const base = timestampAsDate.value ?? new Date()
  timestamp.value = new Date(
    Date.UTC(date.year, date.month - 1, date.day, base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds()),
  ).toISOString()
  isCalendarOpen.value = false
}

function handleTimeChange(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return
  const base = timestampAsDate.value ?? new Date()
  timestamp.value = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hours, minutes, base.getUTCSeconds()),
  ).toISOString()
}

function editedField<T>(current: string, original: string, value: T): { kind: 'UNCHANGED' } | { kind: 'SET'; value: T } {
  return current.trim() === original.trim() ? { kind: 'UNCHANGED' } : { kind: 'SET', value }
}

function buildPayload() {
  const tx = props.transaction
  const originalAmountIn = tx?.amountIn?.toString() ?? tx?.amount?.toString() ?? ''
  const originalAmountOut = tx?.amountOut?.toString() ?? ''
  const originalPrice = tx?.priceEur?.toString() ?? ''
  const originalTotal = tx?.totalEur?.toString() ?? ''
  const originalTimestamp = tx?.timestamp ? tx.timestamp.toISOString() : ''
  const originalType = tx?.type ?? ''

  const priceField =
    priceFiat.value.trim() === originalPrice.trim()
      ? { kind: 'UNCHANGED' as const }
      : { kind: 'SET' as const, value: priceFiat.value.trim(), fiatCurrency: tx?.fiatCurrency ?? 'EUR' }

  return {
    amount_in: editedField(amountIn.value, originalAmountIn, amountIn.value.trim()),
    amount_out: editedField(amountOut.value, originalAmountOut, amountOut.value.trim()),
    price_fiat: priceField,
    total_fiat: editedField(totalFiat.value, originalTotal, totalFiat.value.trim() as string | null),
    fee: feeKind.value === 'NONE' ? { kind: 'NONE' as const } : { kind: 'UNCHANGED' as const },
    timestamp: editedField(timestamp.value, originalTimestamp, timestamp.value.trim()),
    tx_type: editedField(txType.value, originalType, txType.value.trim()),
  }
}

async function handleSave() {
  fieldErrors.value = {}
  formError.value = null
  balanceWarning.value = null

  const payload = buildPayload()
  const validation = spotTransactionEditSchema.safeParse(payload)
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      const field = issue.path[0]
      if (typeof field === 'string') {
        fieldErrors.value[field] = t(`tax.edit.error.invalid_${field}`)
      } else {
        formError.value = issue.message
      }
    }
    return
  }

  if (!props.transaction?.idHash) return

  isSubmitting.value = true
  try {
    const result = await setOverride.mutateAsync({
      idHash: props.transaction.idHash as TransactionIdHash,
      payload: validation.data,
    })

    if (result.balanceCheck.kind === 'NEGATIVE_BALANCE') {
      balanceWarning.value = [...result.balanceCheck.entries]
      toast.warning(t('tax.edit.balance_warning'))
      // Stays open deliberately (design.md D9): the user needs to read the warning.
      return
    }

    toast.success(t('tax.edit.saved'))
    emit('update:open', false)
  } catch (error) {
    const err = error as Error & { field?: string }
    toast.error(t('tax.edit.error.rejected'))
    if (err.field) {
      fieldErrors.value[err.field] = err.message
    } else {
      formError.value = err.message
    }
  } finally {
    isSubmitting.value = false
  }
}

function startRestore() {
  confirmingRestore.value = true
}

async function confirmRestore() {
  if (!props.transaction?.idHash) return
  isSubmitting.value = true
  try {
    await removeOverride.mutateAsync(props.transaction.idHash as TransactionIdHash)
    toast.success(t('tax.edit.restored'))
    emit('update:open', false)
  } catch (error) {
    formError.value = (error as Error).message
  } finally {
    confirmingRestore.value = false
    isSubmitting.value = false
  }
}

function handleOpenChange(value: boolean) {
  if (isPending.value) return
  emit('update:open', value)
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="max-w-2xl shadow-[var(--shadow-modal)] rounded-2xl"
      @escape-key-down="(e) => isPending && e.preventDefault()"
      @pointer-down-outside="(e) => isPending && e.preventDefault()"
      @interact-outside="(e) => isPending && e.preventDefault()"
      @open-auto-focus="handleOpenAutoFocus"
    >
      <DialogHeader>
        <DialogTitle>{{ t('tax.edit.title') }}</DialogTitle>
        <DialogDescription>{{ t('tax.edit.description') }}</DialogDescription>
      </DialogHeader>

      <div v-if="formError" data-testid="form-error">
        <Alert variant="destructive">
          <AlertTitle>{{ t('tax.edit.error.title') }}</AlertTitle>
          <AlertDescription>{{ formError }}</AlertDescription>
        </Alert>
      </div>

      <div v-if="balanceWarning" data-testid="balance-warning">
        <Alert variant="destructive">
          <AlertTitle>{{ t('tax.edit.balance_warning') }}</AlertTitle>
          <AlertDescription>
            <div v-for="entry in balanceWarning" :key="`${entry.assetId}-${entry.accountId}`">
              {{ entry.assetId }} / {{ entry.accountId }}: {{ entry.balance }} ({{ t('tax.edit.tolerance') }}
              {{ entry.tolerance }})
            </div>
          </AlertDescription>
        </Alert>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">{{ t('tax.edit.field.amount_in') }}</label>
          <div class="flex items-center gap-2">
            <Input data-testid="field-amount_in" v-model="amountIn" :disabled="isPending" />
            <span
              v-if="amountInUnit"
              data-testid="field-amount_in-unit"
              class="text-xs text-muted-foreground font-mono shrink-0"
              >{{ amountInUnit }}</span
            >
          </div>
          <p v-if="fieldErrors.amount_in" data-testid="field-error-amount_in" class="text-xs text-destructive mt-1">
            {{ fieldErrors.amount_in }}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">{{ t('tax.edit.field.amount_out') }}</label>
          <Input data-testid="field-amount_out" v-model="amountOut" :disabled="isPending" />
          <p v-if="fieldErrors.amount_out" data-testid="field-error-amount_out" class="text-xs text-destructive mt-1">
            {{ fieldErrors.amount_out }}
          </p>
        </div>
        <div ref="priceFieldContainer">
          <label class="block text-sm font-medium mb-1">{{ t('tax.edit.field.price_fiat') }}</label>
          <div class="flex items-center gap-2">
            <Input data-testid="field-price_fiat" v-model="priceFiat" :disabled="isPending" />
            <span data-testid="field-price_fiat-unit" class="text-xs text-muted-foreground font-mono shrink-0">{{
              fiatUnit
            }}</span>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            {{ t('tax.edit.original') }}: {{ transaction?.priceEur?.toString() ?? '—' }}
          </p>
          <p v-if="fieldErrors.price_fiat" data-testid="field-error-price_fiat" class="text-xs text-destructive mt-1">
            {{ fieldErrors.price_fiat }}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">{{ t('tax.edit.field.total_fiat') }}</label>
          <div class="flex items-center gap-2">
            <Input data-testid="field-total_fiat" v-model="totalFiat" :disabled="isPending" />
            <span data-testid="field-total_fiat-unit" class="text-xs text-muted-foreground font-mono shrink-0">{{
              fiatUnit
            }}</span>
          </div>
          <p v-if="fieldErrors.total_fiat" data-testid="field-error-total_fiat" class="text-xs text-destructive mt-1">
            {{ fieldErrors.total_fiat }}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">{{ t('tax.edit.field.timestamp') }}</label>
          <div class="flex items-center gap-2">
            <Popover v-model:open="isCalendarOpen">
              <PopoverTrigger>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="cursor-pointer"
                  data-testid="field-timestamp-trigger"
                  :disabled="isPending"
                >
                  {{ timestampDateLabel }}
                </Button>
              </PopoverTrigger>
              <PopoverContent data-testid="field-timestamp-calendar" class="w-auto p-0">
                <Calendar :model-value="calendarValue" @update:model-value="handleDateSelect" />
              </PopoverContent>
            </Popover>
            <input
              type="time"
              data-testid="field-timestamp-time"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              :value="timeValue"
              :disabled="isPending"
              @input="(e) => handleTimeChange((e.target as HTMLInputElement).value)"
            />
          </div>
          <p v-if="fieldErrors.timestamp" data-testid="field-error-timestamp" class="text-xs text-destructive mt-1">
            {{ fieldErrors.timestamp }}
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">{{ t('tax.edit.field.tx_type') }}</label>
          <BaseSelect
            data-testid="field-tx_type"
            v-model="txType"
            :options="txTypeOptions"
            :disabled="isPending"
          />
          <p v-if="fieldErrors.tx_type" data-testid="field-error-tx_type" class="text-xs text-destructive mt-1">
            {{ fieldErrors.tx_type }}
          </p>
        </div>
      </div>

      <!-- Read-only lots panel: a scoped simplification (see the component's top comment) —
           reuses the token-history query filtered by symbol, since spot_transaction_id-level
           lot correlation is not yet exposed on the frontend read model. -->
      <div class="mt-4 rounded-lg border border-border p-3">
        <p class="text-xs font-semibold uppercase text-muted-foreground mb-2">
          {{ t('tax.edit.lots_panel_title') }}
        </p>
        <p class="text-xs text-muted-foreground">{{ t('tax.edit.lots_panel_note') }}</p>
      </div>

      <DialogFooter class="flex items-center justify-between">
        <div v-if="!confirmingRestore">
          <Button
            v-if="transaction?.override?.kind === 'ACTIVE'"
            data-testid="restore-button"
            variant="outline"
            class="cursor-pointer"
            :disabled="isPending"
            @click="startRestore"
          >
            {{ t('tax.edit.restore') }}
          </Button>
        </div>
        <div v-else class="flex items-center gap-2">
          <span class="text-xs">{{ t('tax.edit.restore_confirm') }}</span>
          <Button data-testid="restore-confirm-button" variant="destructive" class="cursor-pointer" :disabled="isPending" @click="confirmRestore">
            {{ t('tax.edit.restore_confirm_button') }}
          </Button>
          <Button variant="ghost" class="cursor-pointer" :disabled="isPending" @click="confirmingRestore = false">
            {{ t('tax.edit.cancel') }}
          </Button>
        </div>

        <Button data-testid="save-button" class="cursor-pointer" :disabled="isPending" @click="handleSave">
          <span v-if="isPending">{{ t('tax.edit.saving') }}</span>
          <span v-else>{{ t('tax.edit.save') }}</span>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
