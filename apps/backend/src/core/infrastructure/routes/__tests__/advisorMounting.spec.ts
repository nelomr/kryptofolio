import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../../../../app.js';

const BACKEND_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ROUTES_DIR = path.resolve(import.meta.dirname, '..');

const ADVISOR_ROUTES = [
  'GET /api/advisor/config',
  'GET /api/advisor/config/execution-profiles',
  'POST /api/advisor/ask',
  'POST /api/advisor/stream',
  'PUT /api/advisor/config/execution-profiles',
  'PUT /api/advisor/config/model-chain',
];

function registered(): string[] {
  return app.routes.map((route) => `${route.method} ${route.path}`);
}

describe('advisor route mounting', () => {
  it('mounts exactly the six advisor endpoints under /api/advisor', () => {
    const advisor = registered().filter((r) => r.split(' ')[1]?.startsWith('/api/advisor'));
    expect([...new Set(advisor)].sort()).toEqual(ADVISOR_ROUTES);
  });
});

describe('no generic agent surface', () => {
  it('registers no wildcard or catch-all route other than the global CORS middleware', () => {
    const wildcards = registered().filter((r) => r.includes('*'));
    expect(wildcards).toEqual(['ALL /*']);
  });

  it('never registers a method-agnostic handler under the advisor prefix', () => {
    const catchAll = app.routes.filter((r) => r.method === 'ALL' && r.path.startsWith('/api/advisor'));
    expect(catchAll).toEqual([]);
  });

  it('depends on no third-party agent HTTP server package', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(declared.filter((name) => name === '@mastra/hono' || name === '@mastra/server')).toEqual([]);
  });

  it('has no route module or application entry that mounts an agent handler or a Mastra server adapter', () => {
    const sources = [
      path.join(BACKEND_ROOT, 'src/app.ts'),
      ...fs
        .readdirSync(ROUTES_DIR)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(ROUTES_DIR, f)),
    ];
    const offenders = sources.filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return /@mastra\/(hono|server)|registerApiRoute|MastraServer|\.mount\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
