#!/usr/bin/env node
// dispatch-feature.js
// Usage: node dispatch-feature.js "Short feature description"
const { execSync } = require('child_process');
const desc = process.argv.slice(2).join(' ');
if (!desc) {
  console.error('Usage: dispatch-feature.js "Feature description"');
  process.exit(1);
}
const title = `Feature: ${desc}`;
const body = `Auto-generated issue from slash-command prototype.\n\nDescription:\n${desc}`;
try {
  console.log('Attempting to create GitHub issue via `gh`...');
  const out = execSync(
    `gh issue create --title "${title.replace(/"/g, '\\\"')}" --body "${body.replace(/"/g, '\\\"')}" --label automation`,
    { stdio: 'pipe' },
  ).toString();
  console.log(out);
} catch (err) {
  console.warn('`gh` not available or failed.');
  console.log('Fallback: Please run the following command to create the issue:');
  console.log(`gh issue create --title "${title}" --body "${body}" --label automation`);
}
console.log(
  '\nNext steps:\n1. Create a worktree or branch for the issue\n2. Implement changes\n3. Run the mandatory pre-push sequence before pushing',
);
