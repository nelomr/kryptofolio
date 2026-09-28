/**
 * Structural single-pass invariant (design.md Risks, corrected — see git history: an earlier
 * version of that section wrongly assumed a wall-clock rebuild-timing test existed to extend;
 * none does, and a wall-clock assertion would be flaky and environment-dependent anyway).
 *
 * The real risk: reading 8 consumers through `v_effective_spot_transactions` could regress
 * rebuild time if any of them re-scans it per row instead of once per rebuild. The mitigation is
 * structural, not timed — a CTE that is itself referenced more than once downstream (and whose
 * own body reads `v_effective_spot_transactions`) MUST be declared `AS MATERIALIZED`, or DuckDB
 * inlines and re-evaluates it at every reference. A CTE referenced exactly once, or a direct
 * top-level `FROM`/`JOIN` with no wrapping CTE at all, carries no such risk — materialization
 * would be decoration, not a fix — so this test does not require it there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ADAPTER_PATH = path.resolve(
  import.meta.dirname,
  '../../src/adapters/DuckDbAdapter.ts',
);

const VIEW_MARKER = /CREATE (?:OR REPLACE )?VIEW/;

/** Splits the file into one chunk per `CREATE (OR REPLACE) VIEW ...` statement. */
function splitIntoViewBlocks(source: string): string[] {
  const lines = source.split('\n');
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (VIEW_MARKER.test(line)) starts.push(i);
  });
  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : lines.length;
    blocks.push(lines.slice(from, to).join('\n'));
  }
  return blocks;
}

interface CteDef {
  name: string;
  materialized: boolean;
  /** The CTE's own body text, up to its balancing close paren. */
  body: string;
  /** Index range in the block, for excluding self-references when counting downstream uses. */
  start: number;
  end: number;
}

/** Extracts every top-level `name AS [MATERIALIZED] ( ... )` CTE in a block, bracket-balanced. */
function extractCtes(block: string): CteDef[] {
  const ctes: CteDef[] = [];
  const defRe = /(\w+)\s+AS\s+(MATERIALIZED\s+)?\(/g;
  let match: RegExpExecArray | null;
  while ((match = defRe.exec(block)) !== null) {
    const name = match[1];
    // Skip the VIEW's own name (e.g. "CREATE OR REPLACE VIEW foo AS (" has no such paren
    // immediately, so this only ever matches real CTE definitions in this codebase's style) and
    // skip obvious non-CTE keywords the regex could coincidentally hit.
    if (['VIEW', 'TABLE', 'SELECT', 'WHEN', 'THEN', 'CASE'].includes(name)) continue;
    const materialized = Boolean(match[2]);
    const openParenIndex = match.index + match[0].length - 1;
    let depth = 1;
    let i = openParenIndex + 1;
    while (i < block.length && depth > 0) {
      if (block[i] === '(') depth++;
      else if (block[i] === ')') depth--;
      i++;
    }
    const body = block.slice(openParenIndex + 1, i - 1);
    ctes.push({ name, materialized, body, start: match.index, end: i });
  }
  return ctes;
}

/** Counts standalone-word occurrences of `name` in `text`, outside the given [start,end) range. */
function countReferencesOutside(block: string, name: string, start: number, end: number): number {
  const re = new RegExp(`\\b${name}\\b`, 'g');
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    if (match.index >= start && match.index < end) continue; // the CTE's own definition
    count++;
  }
  return count;
}

describe('v_effective_spot_transactions: single-pass structural invariant', () => {
  it('every CTE that reads v_effective_spot_transactions AND is referenced more than once downstream is MATERIALIZED', () => {
    const source = fs.readFileSync(ADAPTER_PATH, 'utf-8');
    const blocks = splitIntoViewBlocks(source);
    const violations: string[] = [];

    for (const block of blocks) {
      const ctes = extractCtes(block);
      for (const cte of ctes) {
        if (!cte.body.includes('v_effective_spot_transactions')) continue;
        const downstreamRefs = countReferencesOutside(block, cte.name, cte.start, cte.end);
        if (downstreamRefs >= 2 && !cte.materialized) {
          const viewNameMatch = block.match(/VIEW\s+(\w+)/);
          violations.push(
            `CTE "${cte.name}" in view "${viewNameMatch?.[1] ?? '?'}" reads v_effective_spot_transactions, ` +
              `is referenced ${downstreamRefs} times downstream, and is NOT MATERIALIZED`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('the two known multi-referenced consumers (tx_context, custody_tx) are both MATERIALIZED — a positive control', () => {
    const source = fs.readFileSync(ADAPTER_PATH, 'utf-8');
    const blocks = splitIntoViewBlocks(source);

    const txContextBlock = blocks.find((b) => b.includes('tx_context AS'));
    const custodyTxBlock = blocks.find((b) => b.includes('custody_tx AS'));
    expect(txContextBlock).toBeDefined();
    expect(custodyTxBlock).toBeDefined();

    const txContext = extractCtes(txContextBlock!).find((c) => c.name === 'tx_context');
    const custodyTx = extractCtes(custodyTxBlock!).find((c) => c.name === 'custody_tx');
    expect(txContext?.materialized).toBe(true);
    expect(custodyTx?.materialized).toBe(true);
    // Both genuinely read the effective view and are referenced 2+ times downstream — otherwise
    // this "positive control" would be vacuous.
    expect(txContext?.body).toContain('v_effective_spot_transactions');
    expect(custodyTx?.body).toContain('v_effective_spot_transactions');
  });
});
