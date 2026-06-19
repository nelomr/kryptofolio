import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Get list of changed files to only include packages bumped in this release
const changedFiles = execSync('git status --porcelain', { encoding: 'utf8' });

// We use the frontend version as the global release version
const frontendPkgPath = path.join(rootDir, 'apps/frontend/package.json');
const frontendPkg = JSON.parse(fs.readFileSync(frontendPkgPath, 'utf8'));
const currentVersion = frontendPkg.version;
const dateStr = new Date().toISOString().split('T')[0];

const rootChangelogPath = path.join(rootDir, 'CHANGELOG.md');
let rootChangelog = fs.readFileSync(rootChangelogPath, 'utf8');

// Define packages to check
const packages = [
  { name: 'Frontend', path: 'apps/frontend/CHANGELOG.md', pkgName: '@kryptofolio/frontend', icon: '🖥️' },
  { name: 'Backend', path: 'apps/backend/CHANGELOG.md', pkgName: '@kryptofolio/backend', icon: '⚙️' },
  { name: 'Core Domain', path: 'packages/core-domain/CHANGELOG.md', pkgName: '@kryptofolio/core-domain', icon: '🧠' },
  { name: 'Database', path: 'packages/database/CHANGELOG.md', pkgName: '@kryptofolio/database', icon: '🗄️' },
  { name: 'Shared Types', path: 'packages/shared-types/CHANGELOG.md', pkgName: '@kryptofolio/shared-types', icon: '📦' },
];

let newChangelogEntry = `\n## [${currentVersion}](https://github.com/nelomr/kryptofolio/releases/tag/v${currentVersion}) (${dateStr})\n\n`;
let hasChanges = false;

for (const pkg of packages) {
  // Only process if this package's CHANGELOG was modified by Changesets in this run
  if (!changedFiles.includes(pkg.path)) {
    continue;
  }

  const fullPath = path.join(rootDir, pkg.path);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Read the package.json to get the package's current bumped version
    const pkgJsonPath = fullPath.replace('CHANGELOG.md', 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const pkgVersion = pkgJson.version;
    
    // Match the exact version block for this package's current version
    // Changesets format: ## 1.15.12\n\n### Patch Changes\n\n- [commit]...
    const regex = new RegExp(`## ${pkgVersion.replace(/\\./g, '\\\\.')}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = content.match(regex);
    
    if (match && match[1].trim()) {
      hasChanges = true;
      let changes = match[1].trim();
      
      // Clean up headers to make them standard markdown lists instead of H3s
      changes = changes.replace(/### (Patch|Minor|Major) Changes/g, '**$1 Changes**');
      
      newChangelogEntry += `### ${pkg.icon} ${pkg.name} (\`${pkg.pkgName}\` @ ${pkgVersion})\n\n${changes}\n\n`;
    }
  }
}

if (hasChanges) {
  // Inject after the standard preamble
  const marker = "Format follows [Conventional Commits](https://www.conventionalcommits.org) and [Semantic Versioning](https://semver.org).\n";
  if (rootChangelog.includes(marker)) {
    rootChangelog = rootChangelog.replace(marker, marker + newChangelogEntry);
    fs.writeFileSync(rootChangelogPath, rootChangelog);
    console.log('✅ Synchronized root CHANGELOG.md');
  } else {
    console.error('⚠️ Could not find injection marker in CHANGELOG.md');
    process.exit(1);
  }
} else {
  console.log('ℹ️ No changelog entries found to synchronize.');
}
