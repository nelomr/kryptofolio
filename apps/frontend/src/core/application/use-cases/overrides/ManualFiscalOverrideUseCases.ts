/**
 * The four override commands.
 *
 * Every one takes a batch, because the backend rebuilds derived data once per call — submitting
 * corrections one at a time would cost one full recalculation each. Overrides are calculation
 * inputs, so nothing here edits a derived row.
 */

import type { ITaxPort, TransferDestinationInput } from '@/core/domain/ports/ITaxPort'
import type { OverrideOutcomeEntity, SpotOverrideOutcomeEntity } from '@/core/domain/models/FiscalEntities'
import type { TransactionIdHash } from '@/core/domain/models/BrandedTypes'
import type { SpotTransactionEditInput } from '@kryptofolio/shared-types'

// `SetManualPriceOverrideUseCase`/`RemoveManualPriceOverrideUseCase` were removed here
// (design.md D3): manual_price_overrides was unified into spot_transaction_overrides. The
// replacement is `SetSpotTransactionOverrideUseCase`/`RemoveSpotTransactionOverrideUseCase` below.

export class SetSpotTransactionOverrideUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(idHash: TransactionIdHash, payload: SpotTransactionEditInput): Promise<SpotOverrideOutcomeEntity> {
    return await this.taxPort.setSpotTransactionOverride(idHash, payload)
  }
}

export class RemoveSpotTransactionOverrideUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(idHash: TransactionIdHash): Promise<SpotOverrideOutcomeEntity> {
    return await this.taxPort.removeSpotTransactionOverride(idHash)
  }
}

export class SetTransferDestinationUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(overrides: TransferDestinationInput[]): Promise<OverrideOutcomeEntity> {
    return await this.taxPort.setTransferDestinations(overrides)
  }
}

export class RemoveTransferDestinationUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(idHashes: TransactionIdHash[]): Promise<OverrideOutcomeEntity> {
    return await this.taxPort.removeTransferDestinations(idHashes)
  }
}
