import type { NormalizerHandler } from "./types";
import { handleBuy, handleSell } from "./trade";
import { handleDeposit, handleWithdrawal, handleTransfer } from "./transfer";
import { handleCryptoIncome, handleCryptoExpense } from "./crypto";

export const transactionHandlers: Record<string, NormalizerHandler> = {
  // Trade
  buy: handleBuy,
  compra: handleBuy,
  sell: handleSell,
  venta: handleSell,
  trade: handleBuy, // Fallback if positive amount implies buy, though aggregator splits it
  
  // Transfer
  deposit: handleDeposit,
  deposito: handleDeposit,
  withdrawal: handleWithdrawal,
  retiro: handleWithdrawal,
  transfer: handleTransfer,
  transferencia: handleTransfer,
  
  // Crypto Native Income
  staking: handleCryptoIncome,
  airdrop: handleCryptoIncome,
  reward: handleCryptoIncome,
  recompensa: handleCryptoIncome,
  dividend: handleCryptoIncome,
  dividendo: handleCryptoIncome,
  mining: handleCryptoIncome,
  mineria: handleCryptoIncome,
  earn: handleCryptoIncome,
  cashback: handleCryptoIncome,
  gift: handleCryptoIncome,
  regalo: handleCryptoIncome,
  present: handleCryptoIncome,

  // Crypto Native Expenses
  fee: handleCryptoExpense,
  comision: handleCryptoExpense,
  payment: handleCryptoExpense,
  pago: handleCryptoExpense,
  donation: handleCryptoExpense,
  donacion: handleCryptoExpense,
  burn: handleCryptoExpense,
  quema: handleCryptoExpense,
};
