import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Technical Documentation Scaffold', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  
  it('Documentation verification: docs/ folder exists with architecture, api-integration, and extensibility placeholders', () => {
    const docsDir = path.join(rootDir, 'docs');
    expect(fs.existsSync(docsDir)).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'architecture.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'api-integration.md'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'extensibility.md'))).toBe(true);
  });
});

describe('Root README Updates', () => {
  const rootDir = path.resolve(__dirname, '../../../../');
  
  it('Discoverability: root READMEs reference api-gateway and docs structure', () => {
    const readmeEs = fs.readFileSync(path.join(rootDir, 'README.es.md'), 'utf-8');
    const readmeEn = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf-8');
    
    expect(readmeEs).toContain('packages/api-gateway/');
    expect(readmeEs).toContain('docs/');
    
    expect(readmeEn).toContain('packages/api-gateway/');
    expect(readmeEn).toContain('docs/');
  });
});
