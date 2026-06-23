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
      'accessibility-reviewer',
      'ai-ops-engineer',
      'android-engineer',
      'architect',
      'backend-engineer',
      'business-analyst',
      'compliance-specialist',
      'data-engineer',
      'design-engineer',
      'devops-engineer',
      'docs-writer',
      'experimentation-engineer',
      'finance-domain',
      'ios-engineer',
      'kmp-engineer',
      'localization-engineer',
      'marketing-strategist',
      'performance-engineer',
      'product-manager',
      'qa-tester',
      'release-manager',
      'security-reviewer',
      'web-engineer',
      'windows-engineer',
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
