import { ref, computed } from 'vue'
import { useSpotTransactionsQuery, useTaxReportQuery } from '@/composables/queries/useTaxQueries'
import { 
  useSyncWeb3Mutation, 
  useUploadTaxFileMutation, 
  useDeleteTransactionsMutation 
} from '@/composables/queries/useTaxMutations'
import { useSmartYearLogic } from './useTaxCalculations'
import { toast } from 'vue-sonner'
import { useI18n } from '@/composables/useI18n'

export interface IntegrityWarning {
  id: string
  title: string
  description: string
  severity: 'warning' | 'critical'
}

// Shared singleton state across all component invocations
const selectedYear = ref<number | null>(null)
const method = ref('FIFO')

export function useTaxReportPort() {
  // Query spot transactions to determine smart year and available years
  const { data: spotData } = useSpotTransactionsQuery()
  const { smartYear } = useSmartYearLogic(spotData)
  const { t } = useI18n()

  const availableYears = computed<number[]>(() => {
    const txs = spotData.value ?? []
    if (txs.length === 0) return [new Date().getFullYear()]
    return [...new Set(txs.map((tx) => new Date(tx.timestamp).getFullYear()))].sort(
      (a, b) => b - a,
    )
  })

  const effectiveYear = computed(() => {
    if (selectedYear.value && selectedYear.value > 0) {
      return selectedYear.value
    }
    if (spotData.value === undefined) {
      return 0
    }
    return smartYear.value || availableYears.value[0] || new Date().getFullYear()
  })
  
  // Global report query
  const { data: report, isLoading, refresh: refetchReport } = useTaxReportQuery(effectiveYear, method)

  // Compute metrics from the actual report data
  const metrics = computed(() => {
    if (!report.value) {
      return {
        capitalGains: '0',
        yields: '0',
        totalLosses: '0',
        estimatedIrpf: '0',
        excludedFlaggedEvents: 0,
        excludedUnresolvedIncomeCount: 0,
      }
    }
    const summary = report.value.summary
    return {
      capitalGains: summary.capitalGains,
      yields: summary.savingsBaseYields,
      totalLosses: summary.capitalLosses,
      estimatedIrpf: summary.estimatedIrpf,
      excludedFlaggedEvents: report.value.excludedFlaggedEvents,
      excludedUnresolvedIncomeCount: report.value.excludedUnresolvedIncomeCount,
    }
  })

  const warnings = ref<IntegrityWarning[]>([
    { id: '1', title: 'Missing Data', description: 'Some trades are missing cost basis.', severity: 'warning' }
  ])

  // Map to the real Pinia Colada mutations that talk to ITaxPort
  const { mutateAsync: syncWeb3Mutate } = useSyncWeb3Mutation()
  const { mutateAsync: uploadCsvMutate } = useUploadTaxFileMutation()
  const { mutateAsync: deleteTxsMutate } = useDeleteTransactionsMutation()

  async function syncWeb3() {
    await syncWeb3Mutate()
  }

  async function uploadCsv(file?: File, market: 'spot' | 'futures' = 'spot') {
    if (!file) {
      toast.info(t('errors.validation.csv_required'))
      return
    }
    await uploadCsvMutate({ file, market })
  }

  async function clearData(market: 'spot' | 'futures' = 'spot') {
    await deleteTxsMutate(market)
  }

  return {
    availableYears,
    selectedYear,
    effectiveYear,
    method,
    report,
    isLoading,
    refetchReport,
    metrics,
    warnings,
    syncWeb3,
    uploadCsv,
    clearData
  }
}
