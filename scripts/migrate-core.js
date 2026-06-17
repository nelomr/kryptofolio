import fs from 'fs';
import path from 'path';

const sourceBase = './apps/frontend/src/modules/data-ingestion/utils';
const destDomain = './packages/core-domain/src/domain/services';
const destApp = './packages/core-domain/src/application/use-cases';

// Ensure directories exist
fs.mkdirSync(destDomain, { recursive: true });
fs.mkdirSync(path.join(destDomain, 'normalizer', 'handlers'), { recursive: true });
fs.mkdirSync(destApp, { recursive: true });

function copyAndTransform(src, dest) {
  let content = fs.readFileSync(src, 'utf-8');
  // Replace relative imports to types with @kryptofolio/shared-types
  content = content.replace(/from\s+['"]\.\.\/types['"]/g, "from '@kryptofolio/shared-types'");
  content = content.replace(/from\s+['"]\.\.\/\.\.\/types['"]/g, "from '@kryptofolio/shared-types'");
  fs.writeFileSync(dest, content);
}

// 3.1 Hash
copyAndTransform(`${sourceBase}/hash.ts`, `${destDomain}/TransactionHashService.ts`);

// 3.2 Normalizer & deps
copyAndTransform(`${sourceBase}/transactionNormalizer.ts`, `${destDomain}/TransactionNormalizer.ts`);
copyAndTransform(`${sourceBase}/normalizer/metadataNormalizer.ts`, `${destDomain}/normalizer/metadataNormalizer.ts`);
copyAndTransform(`${sourceBase}/normalizer/rowAggregator.ts`, `${destDomain}/normalizer/rowAggregator.ts`);

const handlers = fs.readdirSync(`${sourceBase}/normalizer/handlers`);
for (const file of handlers) {
  if (file.endsWith('.ts')) {
    copyAndTransform(`${sourceBase}/normalizer/handlers/${file}`, `${destDomain}/normalizer/handlers/${file}`);
  }
}

// 3.3 Column Auto Mapper
copyAndTransform(`${sourceBase}/columnAutoMapper.ts`, `${destApp}/AutoMapColumnsUseCase.ts`);

// Copy tests if they exist
if (fs.existsSync(`${sourceBase}/__tests__`)) {
  const destTests = './packages/core-domain/src/__tests__';
  fs.mkdirSync(destTests, { recursive: true });
  const testFiles = fs.readdirSync(`${sourceBase}/__tests__`);
  for (const file of testFiles) {
    if (file.endsWith('.ts')) {
      let content = fs.readFileSync(`${sourceBase}/__tests__/${file}`, 'utf-8');
      content = content.replace(/from\s+['"]\.\.\/\.\.\/types['"]/g, "from '@kryptofolio/shared-types'");
      content = content.replace(/from\s+['"]\.\.\/types['"]/g, "from '@kryptofolio/shared-types'");
      // Update relative imports to utilities
      content = content.replace(/from\s+['"]\.\.\/hash['"]/g, "from '../domain/services/TransactionHashService'");
      content = content.replace(/from\s+['"]\.\.\/transactionNormalizer['"]/g, "from '../domain/services/TransactionNormalizer'");
      content = content.replace(/from\s+['"]\.\.\/columnAutoMapper['"]/g, "from '../application/use-cases/AutoMapColumnsUseCase'");
      
      fs.writeFileSync(`${destTests}/${file}`, content);
    }
  }
}

console.log('Migration completed successfully.');
