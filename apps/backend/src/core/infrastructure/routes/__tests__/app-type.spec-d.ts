/**
 * The RPC type the frontend consumes: every route module registered in `app.ts`'s fluent chain
 * must survive into `AppType`, because one non-chained `.route()` call silently drops everything
 * after it from inference. Type-level only, so it runs under `tsc` / `vitest --typecheck`.
 */

import { describe, it, expectTypeOf } from 'vitest';
import { hc } from 'hono/client';
import type { ModelChainEntry } from '@kryptofolio/shared-types';
import type { AppType } from '../../../../app.js';

const client = hc<AppType>('http://localhost:3001');

describe('AppType', () => {
  it('still resolves every route module that existed before the advisor', () => {
    expectTypeOf(client.api).toHaveProperty('health');
    expectTypeOf(client.api).toHaveProperty('portfolio');
    expectTypeOf(client.api).toHaveProperty('wallets');
    expectTypeOf(client.api).toHaveProperty('tax');
    expectTypeOf(client.api).toHaveProperty('metrics');
    expectTypeOf(client.api).toHaveProperty('ingestion');
    expectTypeOf(client.api).toHaveProperty('fiscal');
    expectTypeOf(client.api).toHaveProperty('credentials');
    expectTypeOf(client.api).toHaveProperty('settings');
    expectTypeOf(client.api).toHaveProperty('market');
  });

  it('resolves the advisor routes with typed verbs', () => {
    expectTypeOf(client.api.advisor).toHaveProperty('ask');
    expectTypeOf(client.api.advisor).toHaveProperty('stream');
    expectTypeOf(client.api.advisor.config.$get).toBeFunction();
    expectTypeOf(client.api.advisor.config['model-chain'].$put).toBeFunction();
    expectTypeOf(client.api.advisor.config['execution-profiles'].$get).toBeFunction();
    expectTypeOf(client.api.advisor.ask.$post).toBeFunction();
  });

  it('types the advisor config response down to the provider list', async () => {
    const res = await client.api.advisor.config.$get();
    const body = await res.json();
    expectTypeOf(body).toHaveProperty('providers');
  });

  it('types the request bodies from the route validators, with no hand-maintained duplicate', () => {
    type ChainBody = Parameters<typeof client.api.advisor.config['model-chain']['$put']>[0]['json'];
    type AskBody = Parameters<typeof client.api.advisor.ask['$post']>[0]['json'];

    expectTypeOf<ChainBody>().toEqualTypeOf<ModelChainEntry[]>();
    expectTypeOf<AskBody>().toEqualTypeOf<{ message: string; threadId?: string | undefined }>();
    expectTypeOf<AskBody>().not.toHaveProperty('accountId');
  });

  it('does not expose a generic agent surface', () => {
    // @ts-expect-error there is no agents namespace under the advisor
    void client.api.advisor.agents;
  });
});
