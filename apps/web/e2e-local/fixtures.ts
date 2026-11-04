// SPDX-License-Identifier: BUSL-1.1

import { test as base, expect } from '@playwright/test';

/**
 * Use real SQLite and the built service worker, with only persisted user
 * preferences preselected. Never inject an auth session or database stub.
 */
export const test = base.extend({
  page: async ({ context, page }, use) => {
    const errors: string[] = [];
    context.on('page', (newPage) => newPage.on('pageerror', (error) => errors.push(error.message)));
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1:25973' || url.pathname.startsWith('/api/')) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await context.addInitScript(() => {
      if (location.origin !== 'http://127.0.0.1:25973') return;
      localStorage.setItem('finance-local-only-mode', 'true');
      localStorage.setItem('finance-onboarding-complete', 'true');
      localStorage.setItem('finance.sqliteAtRestEncryption.enabled', 'true');
      localStorage.setItem(
        'finance-gdpr-consent',
        JSON.stringify({
          categories: {
            essential: true,
            analytics: false,
            error_reporting: false,
            sync: false,
            marketing: false,
          },
          timestamp: new Date().toISOString(),
          policyVersion: '1.0.0',
          method: 'first_run',
          hasCompletedFirstRun: true,
        }),
      );
    });
    await use(page);
    expect(errors, 'No uncaught errors on the real local-only path').toEqual([]);
  },
});

export { expect };
