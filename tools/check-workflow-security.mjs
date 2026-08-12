#!/usr/bin/env node
/**
 * Usage: npm run workflow:security:check
 *        node tools/check-workflow-security.mjs --help
 *
 * Fails when privileged GitHub Actions workflows regress on immutable
 * dependencies, input-to-shell boundaries, secret isolation, integrity checks,
 * least privilege, protected environments, or reviewed local reusable forks.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowDirectory = join(repositoryRoot, '.github', 'workflows');
const canonicalWorkflowSha = '97ff60ec21321563fa0fc7ba80015261e7dcd6fa';
const attestationActionSha = '4d101475d8b20a2381f78447822ac1eab6504dd8';
const productionPowerSyncImage =
  'journeyapps/powersync-service:1.23.3@sha256:b6b22fa7d0d862f04bdff62846e656756d17bcf3dd6eca399a0633671051438b';

const privilegedWorkflows = new Set([
  'changesets.yml',
  'deploy-preview.yml',
  'deploy-production.yml',
  'deploy-progressive.yml',
  'deploy-rollback.yml',
  'nightly.yml',
  'rc-branch-tag.yml',
  'release-platform.yml',
  'release-train.yml',
  'reusable-release-smoke-test.yml',
]);

const localReusableBaselines = {
  'reusable-detect-changes.yml': 'f67ce0e29f90d0d9a73e7db3155ba8ccec3525e2eb8a2730ed9337a3ef614ade',
  'reusable-release-smoke-test.yml':
    '74ff29d0ee4a028db9ceb804eb3b662bfbb3595dc21563438768bc39991b3e6e',
};

const requiredEnvironmentJobs = {
  'changesets.yml': ['version'],
  'deploy-production.yml': ['deploy-web', 'deploy-backend', 'auto-rollback', 'create-release'],
  'deploy-rollback.yml': ['approve'],
  'rc-branch-tag.yml': ['create-rc'],
  'release-platform.yml': ['build-platform', 'publish-release'],
  'release-train.yml': ['version-bump', 'create-tag'],
};

const leastPrivilegeWorkflows = [
  'changesets.yml',
  'deploy-preview.yml',
  'deploy-production.yml',
  'deploy-progressive.yml',
  'deploy-rollback.yml',
  'rc-branch-tag.yml',
  'release-platform.yml',
  'release-train.yml',
  'reusable-release-smoke-test.yml',
];

// Jobs that omit `permissions:` inherit the workflow-level grant, which is necessarily the union
// of what the file's most-privileged job needs. ENG-SEC-004 names *implicit* authority as the
// hazard, so this is a ratchet rather than a rewrite: the jobs below are the ones that already
// inherited when the check was introduced, and the check fails only when a new one appears.
// Shrinking this list is always safe; adding to it requires a deliberate edit and review.
const permissionInheritanceBaseline = {
  'ai-eval.yml': ['evals'],
  'ai-manifest-check.yml': ['manifest'],
  'ai-metrics.yml': ['collect'],
  'ci-android.yml': ['changes', 'detekt', 'build-and-test', 'instrumented-tests'],
  'ci-feature-flags.yml': ['validate-flags'],
  'ci-ios.yml': ['changes', 'build'],
  'ci-lint.yml': [
    'changes',
    'eslint-prettier',
    'pr-title',
    'observability-guardrails',
    'eng-citations',
  ],
  'ci-security.yml': [
    'codeql-java-kotlin',
    'codeql-javascript',
    'dependency-review',
    'secret-scanning',
    'gitleaks',
    'npm-audit',
    'gradle-dependency-check',
    'license-check',
    'summary',
    'gatekeeper',
  ],
  'ci-shared.yml': ['lint-and-test'],
  'ci-web.yml': [
    'changes',
    'build',
    'unit-tests',
    'e2e-pr-smoke',
    'e2e-pr-report',
    'e2e-main-desktop',
    'e2e-main-report',
  ],
  'ci-windows.yml': ['changes', 'build'],
  'deploy-pages.yml': ['build', 'deploy'],
  'deploy-staging.yml': [
    'pre-deploy-checks',
    'deploy-web-vm',
    'deploy-backend',
    'smoke-tests',
    'notify',
  ],
  'housekeeping.yml': ['add-to-project', 'stale', 'uptime', 'prod-uptime'],
  'maintenance-align-jwt-aud.yml': ['align-jwt-aud'],
  'migration-reversal-check.yml': ['reversals'],
  'nightly.yml': [
    'web-build',
    'web-e2e-tests',
    'web-e2e-report',
    'web-visual-regression',
    'web-lighthouse',
    'web-nightly-issue',
    'load-test',
    'zap-baseline',
  ],
  'ops-prod-db-recovery.yml': ['ops'],
  'promote-production.yml': ['promote'],
  'reusable-detect-changes.yml': ['detect'],
  'update-visual-snapshots.yml': ['update'],
};

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

function sha256(text) {
  return createHash('sha256').update(normalize(text)).digest('hex');
}

export function extractJob(workflow, jobName) {
  const lines = normalize(workflow).split('\n');
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

export function findRunExpressionViolations(workflow) {
  const lines = normalize(workflow).split('\n');
  const violations = [];
  let runIndent = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = line.length - line.trimStart().length;
    const runMatch = line.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
    if (runMatch) {
      runIndent = runMatch[1].length;
      if (/\$\{\{\s*(?:inputs|github\.event\.inputs)\./.test(runMatch[2])) {
        violations.push(index + 1);
      }
      continue;
    }

    if (runIndent !== null && line.trim() && indent <= runIndent) {
      runIndent = null;
    }
    if (runIndent !== null && /\$\{\{\s*(?:inputs|github\.event\.inputs)\./.test(line)) {
      violations.push(index + 1);
    }
  }

  return violations;
}

export function findMutableReferenceViolations(workflow) {
  const violations = [];
  const lines = normalize(workflow).split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const uses = line.match(/^\s*(?:-\s*)?uses:\s*([^#\s]+)/);
    if (uses && !uses[1].startsWith('./')) {
      const separator = uses[1].lastIndexOf('@');
      const reference = separator === -1 ? '' : uses[1].slice(separator + 1);
      if (!/^[0-9a-f]{40}$/.test(reference)) {
        violations.push({
          line: index + 1,
          reason: `action is not pinned by full SHA: ${uses[1]}`,
        });
      }
    }

    const mutableTool =
      /\bvercel@(latest|next|beta)\b/.test(line) ||
      /\bnpx(?:\s+--yes)?\s+@lhci\/cli(?:\s|$)/.test(line) ||
      /\bnpx(?:\s+--yes)?\s+license-checker(?:\s|$)/.test(line) ||
      /^\s*image:\s*\S+:(latest|main|master|stable)\b/.test(line) ||
      /\bdocker\s+(?:pull|run)\s+\S+:(latest|main|master|stable)\b/.test(line);
    if (mutableTool) {
      violations.push({ line: index + 1, reason: 'mutable external tool or image reference' });
    }
    if (/\bcurl\b.*\|\s*tar\b/.test(line)) {
      violations.push({
        line: index + 1,
        reason: 'archive is streamed from curl directly into tar',
      });
    }
  }

  return violations;
}

export function findInheritingJobs(workflow) {
  const lines = normalize(workflow).split('\n');
  const topLevel = lines.findIndex((line) => /^permissions:/.test(line));
  if (topLevel === -1) return { base: null, jobs: [] };

  const inlineBase = lines[topLevel].slice('permissions:'.length).trim();
  if (inlineBase === '{}') return { base: '{}', jobs: [] };

  const jobsStart = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsStart === -1) return { base: inlineBase || 'block', jobs: [] };

  const inheriting = [];
  for (let index = jobsStart + 1; index < lines.length; index += 1) {
    const header = lines[index].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (!header) continue;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    const declaresPermissions = lines
      .slice(index + 1, end)
      .some((line) => /^ {4}permissions:/.test(line));
    if (!declaresPermissions) inheriting.push(header[1]);
    index = end - 1;
  }

  return { base: inlineBase || 'block', jobs: inheriting };
}

export function scanWorkflowSecurity(workflows, productionCompose = '') {
  const errors = [];
  const report = (file, message) => errors.push(`${file}: ${message}`);

  for (const [file, workflow] of Object.entries(workflows)) {
    for (const violation of findMutableReferenceViolations(workflow)) {
      report(file, `line ${violation.line}: ${violation.reason}`);
    }
    if (/^\s*secrets:\s*inherit\s*$/m.test(workflow)) {
      report(
        file,
        'secrets: inherit is forbidden; declare the reusable secret contract explicitly',
      );
    }
    if (privilegedWorkflows.has(file)) {
      for (const line of findRunExpressionViolations(workflow)) {
        report(file, `line ${line}: dispatch/workflow input is interpolated directly into shell`);
      }
    }
  }

  for (const file of leastPrivilegeWorkflows) {
    if (!/^permissions:\s*\{\}\s*$/m.test(workflows[file] ?? '')) {
      report(file, 'privileged workflow must default to permissions: {}');
    }
  }

  for (const [file, workflow] of Object.entries(workflows)) {
    const allowed = new Set(permissionInheritanceBaseline[file] ?? []);
    for (const jobName of findInheritingJobs(workflow).jobs) {
      if (allowed.has(jobName)) continue;
      report(
        file,
        `job ${jobName} omits permissions: and inherits the workflow-level grant; declare job-level permissions (ENG-SEC-004)`,
      );
    }
  }

  for (const [file, jobs] of Object.entries(requiredEnvironmentJobs)) {
    for (const jobName of jobs) {
      const job = extractJob(workflows[file] ?? '', jobName);
      if (!job) {
        report(file, `required privileged job is missing: ${jobName}`);
      } else {
        if (
          !/^\s{4}environment:\s*(?:\n\s{6}name:\s*)?(?:production|release|staging)\s*$/m.test(job)
        ) {
          report(
            file,
            `${jobName} must use a protected production, release, or staging environment`,
          );
        }
        if (!/^\s{4}permissions:/m.test(job)) {
          report(file, `${jobName} must declare job-level permissions`);
        }
      }
    }
  }

  const preview = workflows['deploy-preview.yml'] ?? '';
  const previewBuild = extractJob(preview, 'build-preview');
  const previewDeploy = extractJob(preview, 'deploy-preview');
  const previewCleanup = extractJob(preview, 'cleanup');
  if (
    !previewBuild.includes('github.event.pull_request.head.repo.full_name == github.repository')
  ) {
    report('deploy-preview.yml', 'preview build must fail closed for fork pull requests');
  }
  if (/\$\{\{\s*secrets\./.test(previewBuild)) {
    report('deploy-preview.yml', 'PR-controlled build job must not receive secrets');
  }
  if (/actions\/checkout@|\bnpm\s+(?:ci|run)\b/.test(previewDeploy)) {
    report('deploy-preview.yml', 'secret-bearing deploy job must not check out or execute PR code');
  }
  if (
    !previewCleanup.includes('github.event.pull_request.head.repo.full_name == github.repository')
  ) {
    report('deploy-preview.yml', 'preview cleanup must fail closed for fork pull requests');
  }

  const nightly = workflows['nightly.yml'] ?? '';
  if (
    !nightly.includes(
      'K6_LINUX_AMD64_SHA256: c7f03434854f837b6790ee81572e4b0f955241974c79a43cbb9f8d0fef069589',
    ) ||
    !nightly.includes('sha256sum --check --strict')
  ) {
    report('nightly.yml', 'k6 download must use the reviewed v0.54.0 SHA-256 checksum');
  }

  const attestPattern = new RegExp(
    `actions/attest-build-provenance@${attestationActionSha}\\b`,
    'g',
  );
  const attestationCount = Object.values(workflows).reduce(
    (count, workflow) => count + [...workflow.matchAll(attestPattern)].length,
    0,
  );
  if (attestationCount !== 3) {
    report(
      'workflows',
      `expected 3 verified attest-build-provenance pins, found ${attestationCount}`,
    );
  }

  if (!productionCompose.includes(`image: ${productionPowerSyncImage}`)) {
    report(
      'deploy/docker-compose.yml',
      'production PowerSync image must retain its reviewed v1.23.3 multi-arch digest',
    );
  }
  if (/^\s*image:\s*\S+:latest\s*$/m.test(productionCompose)) {
    report('deploy/docker-compose.yml', 'production container images must not use latest tags');
  }

  for (const [file, expectedHash] of Object.entries(localReusableBaselines)) {
    const workflow = workflows[file] ?? '';
    if (!workflow.includes(`Canonical comparison: jrmoulckers/.github@${canonicalWorkflowSha}`)) {
      report(file, `must document canonical comparison at ${canonicalWorkflowSha}`);
    }
    const actualHash = sha256(workflow);
    if (actualHash !== expectedHash) {
      report(
        file,
        `reviewed local reusable drifted (expected ${expectedHash}, found ${actualHash})`,
      );
    }
  }

  return errors;
}

function loadWorkflows() {
  return Object.fromEntries(
    readdirSync(workflowDirectory)
      .filter((file) => /\.ya?ml$/.test(file))
      .sort()
      .map((file) => [file, readFileSync(join(workflowDirectory, file), 'utf8')]),
  );
}

function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node tools/check-workflow-security.mjs');
    console.log('Checks .github/workflows for privileged workflow security regressions.');
    return;
  }
  if (process.argv.length > 2) {
    console.error(`Unknown option: ${process.argv.slice(2).join(' ')}`);
    process.exitCode = 2;
    return;
  }

  const productionCompose = readFileSync(
    join(repositoryRoot, 'deploy', 'docker-compose.yml'),
    'utf8',
  );
  const errors = scanWorkflowSecurity(loadWorkflows(), productionCompose);
  if (errors.length > 0) {
    console.error('Workflow security regression check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Workflow security regression check passed (${relative(repositoryRoot, workflowDirectory)}).`,
  );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
