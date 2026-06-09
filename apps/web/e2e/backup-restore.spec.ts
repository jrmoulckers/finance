// SPDX-License-Identifier: BUSL-1.1

import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

const REQUIRED_ENTITIES = [
  'accounts',
  'transactions',
  'categories',
  'budgets',
  'goals',
  'recurringTemplates',
  'preferences',
  'settings',
  'consentRecords',
] as const;

test.describe('Backup restore round-trip', () => {
  test('exports populated data, wipes local data, restores, and reports matching counts', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/login');
    await page.evaluate(async () => {
      const email = 'test@example.com';
      const data = new TextEncoder().encode('password123');
      const digest = await crypto.subtle.digest('SHA-256', data);
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem('finance_demo_users', JSON.stringify([{ email, passwordHash }]));
      localStorage.setItem('finance_demo_session', email);
    });
    await page.goto('/settings/privacy');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download all data \(json\)/i }).click();
    const download = await downloadPromise;
    const backupPath = testInfo.outputPath('finance-backup.json');
    await download.saveAs(backupPath);

    const backup = JSON.parse(await readFile(backupPath, 'utf8')) as Record<string, unknown[]> & {
      version: number;
    };
    expect(backup.version).toBe(1);
    const expectedCounts = Object.fromEntries(
      REQUIRED_ENTITIES.map((entity) => [
        entity,
        Array.isArray(backup[entity]) ? backup[entity].length : 0,
      ]),
    );
    expect(expectedCounts.accounts).toBeGreaterThan(0);
    expect(expectedCounts.transactions).toBeGreaterThan(0);
    expect(expectedCounts.categories).toBeGreaterThan(0);
    expect(expectedCounts.budgets).toBeGreaterThan(0);
    expect(expectedCounts.goals).toBeGreaterThan(0);

    await page.evaluate(async () => {
      await window.__financeWipeLocalDataForE2E__?.();
      localStorage.setItem('finance_demo_session', 'test@example.com');
      localStorage.setItem(
        'finance-gdpr-consent',
        JSON.stringify({
          categories: { essential: true },
          timestamp: new Date().toISOString(),
          policyVersion: '1.0.0',
          method: 'e2e_restore',
          hasCompletedFirstRun: true,
        }),
      );
    });

    await page.goto('/import/wizard');
    await page.locator('input[type="file"]').setInputFiles(backupPath);
    await expect(page.getByRole('heading', { name: /dry-run restore preview/i })).toBeVisible();

    await page.getByLabel(/wipe local data first/i).check();
    for (const entity of REQUIRED_ENTITIES) {
      const row = page.getByRole('row').filter({ hasText: entity });
      await expect(row).toContainText(String(expectedCounts[entity]));
    }

    await page.getByRole('button', { name: /restore backup/i }).click();
    await expect(page.getByText(/restore complete/i)).toBeVisible();

    for (const entity of REQUIRED_ENTITIES) {
      const row = page.getByRole('row').filter({ hasText: entity });
      await expect(row).toContainText(String(expectedCounts[entity]));
      await expect(row).toContainText('0');
    }
  });
});
