import type { NormalizerHandler } from "./types";
import { handleBuy, handleSell, handleTrade } from "./trade";
import { handleDeposit, handleWithdrawal, handleTransfer } from "./transfer";
import { handleCryptoIncome, handleCryptoExpense } from "./crypto";

export const transactionHandlers: Record<string, NormalizerHandler> = {
  // Trade
  buy: handleBuy,
  compra: handleBuy,
  sell: handleSell,
  venta: handleSell,
  // A bare `trade` carries no direction of its own; the sign of its amount does.
  trade: handleTrade,
  
  // Transfer
  deposit: handleDeposit,
  deposito: handleDeposit,
  withdrawal: handleWithdrawal,
  withdraw: handleWithdrawal,
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
  // Both arrive as a single credited amount in the generic columns, like every other income label.
  // What they receive is fiat in one case and crypto in the other, which changes nothing here: the
  // in-side is where an acquisition is read from either way.
  wallet_activation: handleCryptoIncome,
  campaign_new_user_incentive: handleCryptoIncome,

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
