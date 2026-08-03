/**
 * The four override commands.
 *
 * Every one takes a batch, because the backend rebuilds derived data once per call — submitting
 * corrections one at a time would cost one full recalculation each. Overrides are calculation
 * inputs, so nothing here edits a derived row.
 */

import type {
  ITaxPort,
  ManualPriceOverrideInput,
  TransferDestinationInput,
} from '@/core/domain/ports/ITaxPort'
import type { OverrideOutcomeEntity } from '@/core/domain/models/FiscalEntities'
import type { TransactionIdHash } from '@/core/domain/models/BrandedTypes'

export class SetManualPriceOverrideUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(overrides: ManualPriceOverrideInput[]): Promise<OverrideOutcomeEntity> {
    return await this.taxPort.setManualPriceOverrides(overrides)
  }
}

export class RemoveManualPriceOverrideUseCase {
  private readonly taxPort: ITaxPort

  constructor(taxPort: ITaxPort) {
    this.taxPort = taxPort
  }

  async execute(idHashes: TransactionIdHash[]): Promise<OverrideOutcomeEntity> {
    return await this.taxPort.removeManualPriceOverrides(idHashes)
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
