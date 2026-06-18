// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { getRouteChunkName, normalizeModuleId } from '../route-chunks';

describe('route chunk mapping', () => {
  it('normalizes Windows module paths', () => {
    expect(
      normalizeModuleId('G:\\personal\\finance\\apps\\web\\src\\pages\\DashboardPage.tsx'),
    ).toContain('/src/pages/DashboardPage.tsx');
  });

  it('groups dashboard, import, reports, and settings routes into named chunks', () => {
    expect(getRouteChunkName('G:/personal/finance/apps/web/src/pages/DashboardPage.tsx')).toBe(
      'route-dashboard',
    );
    expect(
      getRouteChunkName('G:/personal/finance/apps/web/src/pages/DataImportWizardPage.tsx'),
    ).toBe('route-import');
    expect(getRouteChunkName('G:/personal/finance/apps/web/src/pages/ReportBuilderPage.tsx')).toBe(
      'route-reports',
    );
    expect(
      getRouteChunkName('G:/personal/finance/apps/web/src/pages/settings/SettingsSyncPage.tsx'),
    ).toBe('route-settings');
  });

  it('keeps OCR dependencies out of initial route chunks', () => {
    expect(getRouteChunkName('G:/personal/finance/node_modules/tesseract.js/src/index.js')).toBe(
      'vendor-ocr',
    );
  });
});
