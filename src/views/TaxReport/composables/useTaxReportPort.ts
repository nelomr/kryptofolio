import { ref } from 'vue'

export interface IntegrityWarning {
  id: string
  title: string
  description: string
  severity: 'warning' | 'critical'
}

export function useTaxReportPort() {
  const isLoading = ref(false)
  const metrics = ref({
    capitalGains: 12500.50,
    yields: 340.20,
    totalLosses: 1500.00,
    estimatedIrpf: 2450.75
  })
  const warnings = ref<IntegrityWarning[]>([
    { id: '1', title: 'Missing Data', description: 'Some trades are missing cost basis.', severity: 'warning' }
  ])

  function syncWeb3() {
    console.log('Syncing Web3... (backend integration pending)')
  }

  function uploadCsv() {
    console.log('Uploading CSV... (backend integration pending)')
  }

  function clearData() {
    console.log('Clearing data...')
  }

  return {
    isLoading,
    metrics,
    warnings,
    syncWeb3,
    uploadCsv,
    clearData
  }
}
