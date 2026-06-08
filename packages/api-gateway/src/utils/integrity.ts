import Big from 'big.js';
import type { HoldingItem } from '../data/mockPortfolio';

type MinimalTransaction = {
  symbol: string;
  type: string;
  amount: number;
};

// Configuration for Transaction Multipliers
// Extracted to avoid hardcoding business rules in mathematical operations
const TRANSACTION_MULTIPLIERS: Record<string, number> = {
  BUY: 1,
  DEPOSIT: 1,
  TRANSFER_IN: 1,
  AIRDROP: 1,
  REWARD: 1,
  SELL: -1,
  WITHDRAWAL: -1,
  TRANSFER_OUT: -1,
  FEE: -1
};

export interface IntegrityDiscrepancy {
  symbol: string;
  txBalance: number;
  holdingBalance: number;
  delta: number;
}

export interface IntegrityReport {
  isValid: boolean;
  discrepancies: IntegrityDiscrepancy[];
}

export function validatePortfolioIntegrity(
  holdings: HoldingItem[],
  transactions: MinimalTransaction[]
): IntegrityReport {
  const balances: Record<string, Big> = {};
  
  // Aggregate transactions by symbol using absolute precision
  for (const tx of transactions) {
    if (!balances[tx.symbol]) {
      balances[tx.symbol] = new Big(0);
    }
    
    const multiplier = TRANSACTION_MULTIPLIERS[tx.type] || 0;
    if (multiplier !== 0) {
      const amount = new Big(tx.amount);
      const val = amount.times(multiplier);
      balances[tx.symbol] = balances[tx.symbol].plus(val);
    }
  }

  const discrepancies: IntegrityDiscrepancy[] = [];
  let isValid = true;

  // Compare with holdings
  for (const holding of holdings) {
    const txBalanceBig = balances[holding.symbol] || new Big(0);
    const holdingBalanceBig = new Big(holding.amount);
    
    // Exact mathematical difference
    const deltaBig = holdingBalanceBig.minus(txBalanceBig);
    
    // Strict comparison (0 delta expected)
    if (!deltaBig.eq(0)) {
      isValid = false;
      discrepancies.push({
        symbol: holding.symbol,
        txBalance: Number(txBalanceBig.toString()),
        holdingBalance: Number(holdingBalanceBig.toString()),
        delta: Number(deltaBig.toString())
      });
    }
  }

  return {
    isValid,
    discrepancies
  };
}
