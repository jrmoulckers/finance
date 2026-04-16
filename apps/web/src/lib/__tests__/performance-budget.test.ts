// SPDX-License-Identifier: BUSL-1.1

/**
 * Performance budget enforcement tests.
 *
 * These tests verify that the performance budget configuration is
 * consistent and that the build output stays within defined limits.
 * They do NOT run Lighthouse — they validate the budget definitions
 * and the Vite config alignment.
 *
 * References: issue #770
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Budget file validation
// ---------------------------------------------------------------------------

interface BudgetEntry {
  path: string;
  resourceSizes?: Array<{ resourceType: string; budget: number }>;
  resourceCounts?: Array<{ resourceType: string; budget: number }>;
  timings?: Array<{ metric: string; budget: number }>;
}

function loadBudget(): BudgetEntry[] {
  const budgetPath = resolve(__dirname, '../../../budget.json');
  const raw = readFileSync(budgetPath, 'utf-8');
  return JSON.parse(raw) as BudgetEntry[];
}

describe('Performance Budget Configuration', () => {
  const budget = loadBudget();

  it('should have at least one budget entry', () => {
    expect(budget.length).toBeGreaterThan(0);
  });

  it('should define resource size budgets', () => {
    const entry = budget[0];
    expect(entry.resourceSizes).toBeDefined();
    expect(entry.resourceSizes!.length).toBeGreaterThan(0);
  });

  it('should have script budget under 300KB', () => {
    const entry = budget[0];
    const scriptBudget = entry.resourceSizes!.find((r) => r.resourceType === 'script');
    expect(scriptBudget).toBeDefined();
    expect(scriptBudget!.budget).toBeLessThanOrEqual(300);
  });

  it('should have total budget under 600KB', () => {
    const entry = budget[0];
    const totalBudget = entry.resourceSizes!.find((r) => r.resourceType === 'total');
    expect(totalBudget).toBeDefined();
    expect(totalBudget!.budget).toBeLessThanOrEqual(600);
  });

  it('should define timing budgets', () => {
    const entry = budget[0];
    expect(entry.timings).toBeDefined();
    expect(entry.timings!.length).toBeGreaterThan(0);
  });

  it('should have FCP budget under 2000ms', () => {
    const entry = budget[0];
    const fcp = entry.timings!.find((t) => t.metric === 'first-contentful-paint');
    expect(fcp).toBeDefined();
    expect(fcp!.budget).toBeLessThanOrEqual(2000);
  });

  it('should have LCP budget under 2500ms', () => {
    const entry = budget[0];
    const lcp = entry.timings!.find((t) => t.metric === 'largest-contentful-paint');
    expect(lcp).toBeDefined();
    expect(lcp!.budget).toBeLessThanOrEqual(2500);
  });

  it('should have CLS budget under 0.1', () => {
    const entry = budget[0];
    const cls = entry.timings!.find((t) => t.metric === 'cumulative-layout-shift');
    expect(cls).toBeDefined();
    expect(cls!.budget).toBeLessThanOrEqual(0.1);
  });

  it('should have TBT budget under 300ms', () => {
    const entry = budget[0];
    const tbt = entry.timings!.find((t) => t.metric === 'total-blocking-time');
    expect(tbt).toBeDefined();
    expect(tbt!.budget).toBeLessThanOrEqual(300);
  });

  it('should limit third-party resources to 5', () => {
    const entry = budget[0];
    const thirdParty = entry.resourceCounts!.find((r) => r.resourceType === 'third-party');
    expect(thirdParty).toBeDefined();
    expect(thirdParty!.budget).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Web Vitals module validation
// ---------------------------------------------------------------------------

describe('Web Vitals module', () => {
  it('should export observeWebVitals function', async () => {
    const mod = await import('../../lib/web-vitals');
    expect(typeof mod.observeWebVitals).toBe('function');
  });

  it('should export disconnectWebVitals function', async () => {
    const mod = await import('../../lib/web-vitals');
    expect(typeof mod.disconnectWebVitals).toBe('function');
  });

  it('should export getNavigationTiming function', async () => {
    const mod = await import('../../lib/web-vitals');
    expect(typeof mod.getNavigationTiming).toBe('function');
  });

  it('should export getResourceSummary function', async () => {
    const mod = await import('../../lib/web-vitals');
    expect(typeof mod.getResourceSummary).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Route code splitting validation
// ---------------------------------------------------------------------------

describe('Route Code Splitting', () => {
  it('should lazy-load all page components', async () => {
    const routesPath = resolve(__dirname, '../../../src/routes.tsx');
    const routesContent = readFileSync(routesPath, 'utf-8');

    // Count lazy() imports
    const lazyImports = (routesContent.match(/lazy\(\(\) =>/g) || []).length;
    expect(lazyImports).toBeGreaterThanOrEqual(10);

    // Verify no direct page imports (only lazy imports)
    const directImports = (routesContent.match(/^import .+ from ['"].+Page['"];?$/gm) || []).length;
    expect(directImports).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Vite config validation
// ---------------------------------------------------------------------------

describe('Vite Build Configuration', () => {
  it('should define manual chunks for vendor splitting', async () => {
    const configPath = resolve(__dirname, '../../../vite.config.ts');
    const configContent = readFileSync(configPath, 'utf-8');

    expect(configContent).toContain('manualChunks');
    expect(configContent).toContain('vendor-react');
    expect(configContent).toContain('vendor-charts');
    expect(configContent).toContain('vendor-sqlite');
  });

  it('should target modern browsers', async () => {
    const configPath = resolve(__dirname, '../../../vite.config.ts');
    const configContent = readFileSync(configPath, 'utf-8');

    expect(configContent).toContain('es2022');
  });

  it('should enable sourcemaps', async () => {
    const configPath = resolve(__dirname, '../../../vite.config.ts');
    const configContent = readFileSync(configPath, 'utf-8');

    expect(configContent).toContain('sourcemap: true');
  });
});
