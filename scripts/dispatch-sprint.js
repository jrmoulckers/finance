#!/usr/bin/env node
// dispatch-sprint.js
// Usage: node dispatch-sprint.js 3 "web,backend"
const agentsArg = process.argv[2];
const agentsOpt = process.argv[3] || '';
if (!agentsArg) {
  console.error('Usage: dispatch-sprint.js <N> [comma-separated agents]');
  process.exit(1);
}
const n = parseInt(agentsArg, 10);
const agents = agentsOpt
  ? agentsOpt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [
      'android',
      'ios',
      'web',
      'backend',
      'kmp',
      'devops',
      'security',
      'design',
      'docs',
      'marketing',
      'product',
      'business',
    ];
console.log(`Dispatching ${n} sprint(s) to agents: ${agents.join(', ')}`);
console.log('\nExample Copilot fleet command to paste into `copilot` CLI:');
console.log(
  '/fleet implement the next ' +
    n +
    ' sprints across agents: ' +
    agents.join(', ') +
    '. Follow repo workflow and include the mandatory pre-push sequence.',
);
console.log(
  '\nEach agent should: create worktree, pick labeled issues first, run format+lint before pushing, open PRs with "Closes #N" and monitor CI until green.',
);
