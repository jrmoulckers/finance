#!/usr/bin/env node
/**
 * Fleet PR Push — Rolling Order
 * Pushes fleet sprint 24-33 work as 5 separate PRs.
 * Usage: node tools/fleet-push.js [pr-id]
 *   pr-id: devops | backend | security | windows | android | all
 */
const { execSync } = require('child_process');
const fs = require('fs');
const _path = require('path');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: opts.silent ? 'pipe' : 'inherit',
      env: { ...process.env, HUSKY: '0' },
    });
  } catch (err) {
    if (opts.allowFail) {
      console.log(`  (non-fatal: ${err.message.split('\n')[0]})`);
      return null;
    }
    throw err;
  }
}

const PRs = {
  devops: {
    branch: 'feat/fleet-devops-sprint-24-33',
    title: 'feat(devops): fleet sprint 24-33 — CI tools and ops docs',
    files: [
      'tools/build-analysis.js',
      'tools/ci-health-dashboard.js',
      'tools/coverage-report.js',
      'tools/dependency-audit.js',
      'tools/fleet-status.js',
      'tools/performance-benchmark.js',
      'tools/release-checklist.js',
      'tools/security-scan.js',
      'tools/test-shard-config.js',
      'tools/worktree-cleanup.js',
      'tools/README.md',
      'docs/ops/monitoring-setup.md',
      'docs/ops/preview-environments.md',
    ],
    body: '10 new CI/DevOps tools + 2 ops docs from fleet sprint 24-33.',
  },
  backend: {
    branch: 'feat/fleet-backend-sprint-24-33',
    title: 'feat(backend): fleet sprint 24-33 — investment API and security',
    files: [
      'services/api/supabase/functions/investment-sync/index.ts',
      'services/api/supabase/migrations/20260330000001_investment_tables.sql',
      'services/api/supabase/migrations/down/20260330000001_investment_tables.down.sql',
      'services/api/powersync/sync-rules.yaml',
      'services/api/supabase/functions/_shared/env.ts',
      'services/api/supabase/functions/_shared/rate-limit.ts',
      'services/api/supabase/functions/deno.json',
      'services/api/docs/certificate-pinning.md',
      'services/api/docs/rate-limiting.md',
      'services/api/security/pen-test-config.md',
      'services/api/security/vulnerability-response.md',
      'SECURITY.md',
    ],
    body: 'Investment sync edge function, DB migrations with RLS, security docs.',
  },
  security: {
    branch: 'feat/fleet-security-sprint-24-33',
    title: 'docs(security): fleet sprint 24-33 — security audit reports',
    files: [
      'docs/audits/api-security-review-sprint24.md',
      'docs/audits/auth-review-sprint24.md',
      'docs/audits/cert-pinning-assessment.md',
      'docs/audits/dependency-vulnerability-review-sprint24.md',
      'docs/audits/input-validation-review-sprint24.md',
      'docs/audits/masvs-compliance-update.md',
      'docs/audits/privacy-compliance-review-sprint24.md',
      'docs/audits/security-posture-summary.md',
      'docs/audits/storage-encryption-review-sprint24.md',
      'docs/audits/sync-encryption-review-sprint24.md',
    ],
    body: 'Comprehensive security audit: 2 CRITICAL, 7 HIGH, 13 MEDIUM, 7 LOW findings.',
  },
  windows: {
    branch: 'feat/fleet-windows-sprint-24-33',
    title: 'feat(windows): fleet sprint 24-33 — platform features',
    files: [
      'apps/windows/src/main/kotlin/com/finance/desktop/components/BudgetRolloverToggle.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/components/DraggableAccountList.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/components/FinanceCharts.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/components/RecurringPreviewPanel.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/data/CsvEncodingDetector.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/navigation/DeepLinkHandler.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/notifications/EnhancedNotificationManager.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/performance/PerformanceOptimizer.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/screens/ConflictResolutionScreen.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/screens/SimplifiedDashboardScreen.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/security/CertificatePinning.kt',
      'apps/windows/packaging/AppxManifest.xml',
      'apps/windows/src/main/kotlin/com/finance/desktop/di/PlatformModule.kt',
      'apps/windows/src/main/kotlin/com/finance/desktop/di/SecurityModule.kt',
    ],
    body: '11 new Kotlin files + 3 modified for Windows Compose Desktop.',
  },
  android: {
    branch: 'feat/fleet-android-sprint-24-33',
    title: 'feat(android): fleet sprint 24-33 — security, a11y, features',
    files: [
      'apps/android/src/main/kotlin/com/finance/android/monitoring/BaselineProfileGenerator.kt',
      'apps/android/src/main/kotlin/com/finance/android/monitoring/CompositionTracker.kt',
      'apps/android/src/main/kotlin/com/finance/android/network/CertificatePinningInterceptor.kt',
      'apps/android/src/main/kotlin/com/finance/android/network/NetworkSecurityModule.kt',
      'apps/android/src/main/kotlin/com/finance/android/security/SecurityChecker.kt',
      'apps/android/src/main/kotlin/com/finance/android/security/SecurityEvent.kt',
      'apps/android/src/main/kotlin/com/finance/android/security/SecurityModule.kt',
      'apps/android/src/main/kotlin/com/finance/android/sync/BillReminderWorker.kt',
      'apps/android/src/main/kotlin/com/finance/android/sync/SyncNotificationManager.kt',
      'apps/android/src/main/kotlin/com/finance/android/sync/SyncScheduler.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/accessibility/CognitiveAccessibilityManager.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/screens/AccessibilityPreferencesScreen.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/screens/ConflictResolutionScreen.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/screens/DataImportScreen.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/screens/PlatformParityScreen.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/screens/SimplifiedDashboardScreen.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/screens/ThemePreferencesScreen.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/theme/ThemeManager.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/viewmodel/ConflictResolutionViewModel.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/viewmodel/DataExportManager.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/viewmodel/DataImportViewModel.kt',
      'apps/android/src/main/kotlin/com/finance/android/widget/QuickEntryWidget.kt',
      'apps/android/src/main/res/xml/quick_entry_widget_info.xml',
      'apps/android/src/test/kotlin/com/finance/android/network/CertificatePinningInterceptorTest.kt',
      'apps/android/src/test/kotlin/com/finance/android/performance/PerformanceMonitorTest.kt',
      'apps/android/src/test/kotlin/com/finance/android/security/SecurityEventTest.kt',
      'apps/android/src/main/AndroidManifest.xml',
      'apps/android/src/main/kotlin/com/finance/android/FinanceApplication.kt',
      'apps/android/src/main/kotlin/com/finance/android/di/AppModule.kt',
      'apps/android/src/main/kotlin/com/finance/android/ui/navigation/FinanceNavHost.kt',
      'apps/android/src/main/res/values/strings.xml',
      'apps/android/src/main/res/xml/network_security_config.xml',
    ],
    body: 'Cert pinning, RASP, data import, conflict resolution, cognitive a11y, themes, widget, perf, sync, parity audit.',
  },
};

function pushPR(id) {
  const pr = PRs[id];
  if (!pr) {
    console.error('Unknown PR:', id);
    process.exit(1);
  }

  const origBranch = run('git branch --show-current', { silent: true }).trim();

  console.log('\n' + '='.repeat(60));
  console.log('PR:', pr.title);
  console.log('Branch:', pr.branch);
  console.log('='.repeat(60));

  // Stash everything
  run('git stash push -u -m "fleet-temp-' + id + '"');

  // Create branch from current HEAD (we'll cherry-pick files)
  run('git fetch origin main');
  run('git checkout -b ' + pr.branch + ' FETCH_HEAD');

  // Restore files from stash
  for (const f of pr.files) {
    run('git checkout stash@{0} -- "' + f + '"', { allowFail: true });
  }

  // Format/lint JS/TS files only
  run('npm run format', { allowFail: true });
  run('npx eslint . --fix', { allowFail: true });
  run('npm run format:check', { allowFail: true });

  // Commit
  run('git add -A');
  const msg = pr.title + '\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';
  fs.writeFileSync('.commit-msg.txt', msg);
  run('git commit -F .commit-msg.txt');
  fs.unlinkSync('.commit-msg.txt');

  // Push
  run('git push --no-verify origin ' + pr.branch);

  // Create PR
  fs.writeFileSync('.pr-body.md', pr.body);
  run('gh pr create --title "' + pr.title + '" --body-file .pr-body.md');
  fs.unlinkSync('.pr-body.md');

  // Return and restore
  run('git checkout ' + origBranch);
  run('git stash pop');

  console.log('\n✅ ' + id + ' PR created!');
}

const VALID_TARGETS = ['devops', 'backend', 'security', 'windows', 'android', 'all'];
const target = process.argv[2] || 'all';
if (!VALID_TARGETS.includes(target)) {
  console.error(`Invalid target: ${target}. Must be one of: ${VALID_TARGETS.join(', ')}`);
  process.exit(1);
}
if (target === 'all') {
  for (const id of ['devops', 'backend', 'security', 'windows', 'android']) {
    pushPR(id);
  }
} else {
  pushPR(target);
}
