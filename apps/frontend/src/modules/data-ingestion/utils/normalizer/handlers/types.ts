import type { TransactionMappedData } from "../../../types";

export type NormalizerHandler = (
  normalized: TransactionMappedData
) => void;
