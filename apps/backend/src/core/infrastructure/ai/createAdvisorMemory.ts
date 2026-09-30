import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

const IN_MEMORY = ':memory:';

/**
 * The advisor's conversation store, on its own libsql file and never the ledger's. Semantic recall,
 * working memory and observational memory are all off at construction: the first would pull in an
 * embedder and a vector store, and `observationalMemory` has no per-call override, so this is the
 * only place it can be switched off. Deleting the file is a supported action — Mastra recreates
 * its tables on the next open.
 */
export function createAdvisorMemory(advisorDbPath: string): Memory {
  const url = advisorDbPath === IN_MEMORY ? IN_MEMORY : `file:${advisorDbPath}`;
  return new Memory({
    storage: new LibSQLStore({ id: 'ai-advisor', url }),
    options: {
      semanticRecall: false,
      workingMemory: { enabled: false },
      observationalMemory: false,
    },
  });
}
