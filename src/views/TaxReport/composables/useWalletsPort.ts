import { inject, computed } from 'vue'
import { useQuery, useMutation } from '@pinia/colada'
import { WALLET_REPO_KEY } from '@/core/injectionKeys'
import { toast } from 'vue-sonner'
import { useI18n } from '@/composables/useI18n'

export function useWalletsPort() {
  const { t } = useI18n()
  const walletRepo = inject(WALLET_REPO_KEY)
  if (!walletRepo) throw new Error('WALLET_REPO_KEY not provided')

  const { data: walletsData, isLoading, refetch } = useQuery({
    key: ['wallets', 'list'],
    query: () => walletRepo.getWallets()
  })

  const { mutate: uploadWalletCsv, isLoading: isUploading } = useMutation({
    mutation: (file: File) => walletRepo.uploadWalletCsv(file),
    onSuccess: () => {
      toast.success(t('tax.wallets.upload_success'))
      refetch()
    },
    onError: (error) => {
      console.error(error)
      toast.error(t('tax.wallets.upload_error'))
    }
  })

  // Format for the UI dropdown
  const walletNames = computed(() => {
    const allWalletsLabel = t('tax.wallets.all')
    if (!walletsData.value || walletsData.value.length === 0) {
      return [allWalletsLabel]
    }
    return [allWalletsLabel, ...walletsData.value.map(w => w.name)]
  })

  return {
    wallets: walletsData,
    walletNames,
    isLoading,
    isUploading,
    uploadWalletCsv
  }
}
