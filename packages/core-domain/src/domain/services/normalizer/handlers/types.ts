import type { TransactionMappedData } from "@kryptofolio/shared-types";

export type NormalizerHandler = (
  normalized: TransactionMappedData
) => void;
