import { z } from "zod";
import Decimal from "decimal.js";

export const preciseAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "Must be a valid decimal string")
  .refine((val) => {
    try {
      new Decimal(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid financial number");
