import { z } from 'zod';

export interface SchemaNode {
  readonly path: string;
  readonly schema: z.ZodTypeAny;
}

function childrenOf(schema: z.ZodTypeAny, path: string): SchemaNode[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodTypeAny>).map(([key, child]) => ({
      path: path === '' ? key : `${path}.${key}`,
      schema: child,
    }));
  }
  if (schema instanceof z.ZodArray) return [{ path: `${path}[]`, schema: schema.element }];
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return [{ path, schema: schema.unwrap() }];
  if (schema instanceof z.ZodDefault) return [{ path, schema: schema.removeDefault() }];
  if (schema instanceof z.ZodEffects) return [{ path, schema: schema.innerType() }];
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    return (schema.options as z.ZodTypeAny[]).map((option) => ({ path, schema: option }));
  }
  if (schema instanceof z.ZodRecord) return [{ path: `${path}{}`, schema: schema.valueSchema }];
  const leaf =
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodLiteral ||
    schema instanceof z.ZodEnum ||
    schema instanceof z.ZodNull;
  if (!leaf) throw new Error(`zodSchemaWalk cannot descend into ${schema.constructor.name} at "${path}"`);
  return [];
}

/** Throws on an unrecognised wrapper, so a new schema kind can never be skipped silently. */
export function walkSchema(schema: z.ZodTypeAny, path = ''): SchemaNode[] {
  return [{ path, schema }, ...childrenOf(schema, path).flatMap((child) => walkSchema(child.schema, child.path))];
}

export function numberFields(schema: z.ZodTypeAny): Array<{ path: string; isInt: boolean }> {
  return walkSchema(schema).flatMap((node) =>
    node.schema instanceof z.ZodNumber ? [{ path: node.path, isInt: node.schema.isInt }] : [],
  );
}

export function declaredFieldNames(schema: z.ZodTypeAny): string[] {
  return walkSchema(schema).flatMap((node) => {
    const leafName = node.path.split('.').at(-1);
    return node.schema instanceof z.ZodObject || leafName === undefined || leafName === '' ? [] : [leafName.replace(/\[\]|\{\}/g, '')];
  });
}
