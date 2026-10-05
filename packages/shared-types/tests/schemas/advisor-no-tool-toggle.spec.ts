import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ADVISOR_TOOL_NAMES, executionProfilesSchema, modelChainSchema } from '../../src/advisor-stream';

const TOGGLE = /enabled?|disabled?|toggle|exposed|hidden|visible|active|allow|deny|include|exclude/i;

/** Every key declared anywhere in a schema, so a toggle nested in a profile or an entry is found too. */
function keysOf(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodTypeAny>).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  if (schema instanceof z.ZodArray) return keysOf(schema.element);
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return keysOf(schema.unwrap());
  if (schema instanceof z.ZodDefault) return keysOf(schema.removeDefault());
  if (schema instanceof z.ZodEffects) return keysOf(schema.innerType());
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    return (schema.options as z.ZodTypeAny[]).flatMap(keysOf);
  }
  return [];
}

const offenders = (schema: z.ZodTypeAny) =>
  keysOf(schema).filter((key) => !(ADVISOR_TOOL_NAMES as readonly string[]).includes(key) && TOGGLE.test(key));

describe('no persisted setting enables or disables an individual advisor tool', () => {
  it('the execution-profile schema has no toggle-like field; per-tool keys are budgets only', () => {
    expect(offenders(executionProfilesSchema)).toEqual([]);
    for (const value of Object.values(executionProfilesSchema.shape.metered.shape.toolBudgets.shape)) {
      expect(value).toBeInstanceOf(z.ZodNumber);
    }
  });

  it('the model-chain schema has no toggle-like field', () => {
    expect(offenders(modelChainSchema)).toEqual([]);
  });

  it('the scan sees a toggle at any depth', () => {
    const nested = z.object({ metered: z.object({ toolBudgets: z.object({ kpis: z.number() }), enabled: z.boolean() }) });

    expect(offenders(nested)).toEqual(['enabled']);
  });
});
