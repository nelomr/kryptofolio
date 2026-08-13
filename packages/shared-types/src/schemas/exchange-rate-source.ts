import { z } from 'zod';

/**
 * The provenance of a stored daily FX rate: a rate the ECB published for that date, or the previous
 * publication carried forward onto it.
 *
 * The write-precedence rule is stated entirely in terms of these two — a published fact supersedes a
 * carried-forward approximation, and nothing else is overwritten. A third value has no position in
 * that ordering, so it can neither be stored nor read; every boundary that can introduce one
 * validates against this set rather than against a local copy of it.
 */
export const DAILY_EXCHANGE_RATE_SOURCES = ['ECB', 'ECB_PRIOR_DAY'] as const;

export const dailyExchangeRateSourceSchema = z.enum(DAILY_EXCHANGE_RATE_SOURCES);

export type DailyExchangeRateSource = (typeof DAILY_EXCHANGE_RATE_SOURCES)[number];
