#!/usr/bin/env node
// dispatch-issue.js
// Usage: node dispatch-issue.js 123
const issue = process.argv[2];
if (!issue) {
  console.error('Usage: dispatch-issue.js <issue-number>');
  process.exit(1);
}
console.log(`Preparing local branch name and worktree commands for issue #${issue}...`);
const branch = `feat/issue-${issue}`;
console.log('\nSuggested commands:');
console.log(`git fetch origin main && git checkout -b ${branch}`);
console.log(`$env:HUSKY = "0" ; git push --no-verify origin ${branch}`);
console.log('\nOr to create a worktree (recommended):');
console.log(`git worktree add ..\\wt-issue-${issue} -b ${branch}`);
console.log(
  '\nAfter creating the branch/worktree, run the mandatory pre-push sequence:\n1) npm run format\n2) npx eslint . --fix\n3) npm run format:check && npx eslint . --max-warnings 0\n4) git add -A && git commit --amend --no-edit\n5) $env:HUSKY = "0" ; git push --no-verify origin <branch>\n6) gh pr create --base main --fill --body "Closes #' +
    issue +
    '"\n7) gh pr view <branch> --json number  (verify the PR exists; if not, re-run step 6)\n8) gh pr checks <number>  (poll until green; fix failures, push again)\n9) gh pr merge <number> --squash  (self-merge your own PR once CI is green AND it is MERGEABLE)',
);
