import { z } from 'zod';

export const WalletCsvRowSchema = z.object({
  wallet_name: z.string(),
  wallet_type: z.enum(['COLD_WALLET', 'HOT_WALLET']),
  blockchain: z.string(),
  address: z.string()
});
