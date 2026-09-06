// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeatureGate } from './FeatureGate';
import { FeatureGateProvider } from './FeatureGateProvider';
import { PENDING_ENTITLEMENT } from '../../entitlements';

describe('FeatureGate', () => {
  it('preserves local-only UX while entitlement status is pending', () => {
    render(
      <FeatureGateProvider principalId={null} initialState={PENDING_ENTITLEMENT}>
        <FeatureGate feature="data_export" fallback={<span>Plan required</span>}>
          <span>Export data</span>
        </FeatureGate>
      </FeatureGateProvider>,
    );

    expect(screen.getByText('Export data')).toBeInTheDocument();
    expect(screen.queryByText('Plan required')).toBeNull();
  });
});
