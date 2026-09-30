import { describe, it, expect } from 'vitest';
import {
  modelChainSchema,
  classifyExecutionProfile,
  isOllamaCloudModelId,
  executionProfilesSchema,
  defaultExecutionProfiles,
  type ModelChainEntry,
} from '../../src/advisor-stream';

describe('modelChainSchema', () => {
  it('rejects an empty array', () => {
    expect(() => modelChainSchema.parse([])).toThrow();
  });

  it('rejects an unknown providerId', () => {
    expect(() =>
      modelChainSchema.parse([{ providerId: 'not-a-provider', modelId: 'x' }]),
    ).toThrow();
  });

  it('accepts a modelId unknown at ship time', () => {
    const chain = modelChainSchema.parse([{ providerId: 'openai', modelId: 'gpt-99-future' }]);
    expect(chain).toHaveLength(1);
  });

  it('rejects a local ollama entry with no contextWindow', () => {
    expect(() => modelChainSchema.parse([{ providerId: 'ollama', modelId: 'llama3' }])).toThrow();
  });

  it('rejects a metered entry carrying contextWindow', () => {
    expect(() =>
      modelChainSchema.parse([{ providerId: 'openai', modelId: 'gpt-5', contextWindow: 128000 }]),
    ).toThrow();
  });

  it('validates an ollama entry whose modelId ends :cloud as metered (no contextWindow allowed)', () => {
    const chain = modelChainSchema.parse([{ providerId: 'ollama', modelId: 'qwen3:cloud' }]);
    expect(chain).toHaveLength(1);
    expect(() =>
      modelChainSchema.parse([
        { providerId: 'ollama', modelId: 'qwen3:cloud', contextWindow: 4096 },
      ]),
    ).toThrow();
  });

  it('validates an ollama entry whose modelId ends -cloud as metered (no contextWindow allowed)', () => {
    expect(modelChainSchema.parse([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' }])).toHaveLength(1);
    expect(() =>
      modelChainSchema.parse([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud', contextWindow: 4096 }]),
    ).toThrow();
  });

  it('accepts a valid local ollama entry with contextWindow', () => {
    const chain = modelChainSchema.parse([
      { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 },
    ]);
    expect(chain).toHaveLength(1);
  });
});

describe('isOllamaCloudModelId', () => {
  it.each([
    ['x:cloud', true],
    ['x-cloud', true],
    ['qwen3:cloud', true],
    ['gpt-oss:120b-cloud', true],
    ['minimax-m2:cloud', true],
    ['llama3', false],
    ['llama3.2:3b', false],
    ['cloudy:7b', false],
    ['cloud', false],
    ['cloud:7b', false],
    ['my-cloud-model:7b', false],
    ['cloud-model', false],
    ['x:cloud:latest', false],
  ])('%s -> %s', (modelId, expected) => {
    expect(isOllamaCloudModelId(modelId)).toBe(expected);
  });
});

describe('classifyExecutionProfile', () => {
  it('classifies a non-:cloud ollama entry as local', () => {
    const entry: ModelChainEntry = { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 };
    expect(classifyExecutionProfile(entry)).toBe('local');
  });

  it('classifies an ollama entry with a -cloud suffixed id as metered', () => {
    expect(classifyExecutionProfile({ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' })).toBe('metered');
  });

  it('classifies every other case as metered, including ollama with a :cloud id', () => {
    const cloud: ModelChainEntry = { providerId: 'ollama', modelId: 'qwen3:cloud' };
    const openai: ModelChainEntry = { providerId: 'openai', modelId: 'gpt-5' };
    expect(classifyExecutionProfile(cloud)).toBe('metered');
    expect(classifyExecutionProfile(openai)).toBe('metered');
  });
});

describe('executionProfilesSchema', () => {
  it('validates { metered, local } execution profile settings', () => {
    const parsed = executionProfilesSchema.parse(defaultExecutionProfiles());
    expect(parsed.metered.maxSteps).toBe(5);
    expect(parsed.local.maxSteps).toBe(15);
  });

  it('rejects maxSteps > 30 for either profile', () => {
    const defaults = defaultExecutionProfiles();
    const badMetered = { ...defaults, metered: { ...defaults.metered, maxSteps: 31 } };
    const badLocal = { ...defaults, local: { ...defaults.local, maxSteps: 31 } };
    expect(() => executionProfilesSchema.parse(badMetered)).toThrow();
    expect(() => executionProfilesSchema.parse(badLocal)).toThrow();
  });

  it('rejects lastMessages > 200 for either profile', () => {
    const defaults = defaultExecutionProfiles();
    const badMetered = { ...defaults, metered: { ...defaults.metered, lastMessages: 201 } };
    const badLocal = { ...defaults, local: { ...defaults.local, lastMessages: 201 } };
    expect(() => executionProfilesSchema.parse(badMetered)).toThrow();
    expect(() => executionProfilesSchema.parse(badLocal)).toThrow();
  });

  it('yields the code defaults when ai_advisor_execution_profiles is unset', () => {
    const defaults = defaultExecutionProfiles();
    expect(defaults.metered).toEqual({
      maxSteps: 5,
      lastMessages: 20,
      topNHoldings: 15,
      lotsPageSize: 20,
      rowsPageSize: 25,
      toolBudgets: {
        portfolio_summary: 4000,
        fiscal_integrity: 6000,
        token_history: 6000,
        asset_allocation: 3000,
        risk_metrics: 1500,
        drawdown_curve: 4000,
        performance_history: 4000,
        kpis: 3000,
        volatility_heatmap: 4000,
        spanish_tax_report: 5000,
        live_prices: 2000,
        fiscal_integrity_rows: 4000,
        token_lots: 4000,
      },
    });
    expect(defaults.local).toEqual({
      maxSteps: 15,
      lastMessages: 50,
      topNHoldings: 50,
      lotsPageSize: 100,
      rowsPageSize: 100,
    });
  });
});
