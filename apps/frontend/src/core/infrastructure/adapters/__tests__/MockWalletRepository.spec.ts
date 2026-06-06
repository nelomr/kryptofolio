import { describe, it, expect } from 'vitest'
import { MockWalletRepository } from '../MockWalletRepository'

describe('MockWalletRepository', () => {
  it('should parse valid CSV correctly', async () => {
    const repo = new MockWalletRepository()
    const csvContent = `wallet_name,wallet_type,blockchain,address
Tangem_1,COLD_WALLET,HEDERA,0.0.123
Phantom_1,HOT_WALLET,SOLANA,sol_address_1`
    
    const file = new File([csvContent], 'wallets.csv', { type: 'text/csv' })
    const wallets = await repo.uploadWalletCsv(file)

    expect(wallets).toHaveLength(2)
    expect(wallets[0].name).toBe('Tangem_1')
    expect(wallets[0].type).toBe('COLD_WALLET')
    expect(wallets[0].chainAddresses).toHaveLength(1)
  })

  it('should ignore invalid rows', async () => {
    const repo = new MockWalletRepository()
    const csvContent = `wallet_name,wallet_type,blockchain,address
Tangem_1,INVALID_TYPE,HEDERA,0.0.123
Phantom_1,HOT_WALLET,SOLANA,sol_address_1`
    
    const file = new File([csvContent], 'wallets.csv', { type: 'text/csv' })
    const wallets = await repo.uploadWalletCsv(file)

    // First row should be skipped due to INVALID_TYPE
    expect(wallets).toHaveLength(1)
    expect(wallets[0].name).toBe('Phantom_1')
  })
})
