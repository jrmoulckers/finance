// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { createManualIntakeSource, validateManualIntakeSource } from './manual-intake';

describe('manual crypto intake workflow', () => {
  it('validates watch-only wallet addresses by chain', () => {
    const valid = validateManualIntakeSource({
      id: 'w',
      kind: 'watch-wallet',
      label: 'Main',
      chain: 'ethereum',
      address: '0x0000000000000000000000000000000000000001',
    });
    const invalid = validateManualIntakeSource({
      id: 'bad',
      kind: 'watch-wallet',
      label: 'Bad',
      chain: 'ethereum',
      address: 'bc1bad',
    });

    expect(valid.status).toBe('valid');
    expect(invalid.status).toBe('invalid');
  });

  it('creates Coinbase/Kraken CSV source fingerprints and flags duplicates', () => {
    const existing = [
      createManualIntakeSource({
        id: 'coinbase',
        kind: 'exchange-csv',
        label: 'Main Export',
        exchange: 'coinbase',
      }),
    ];
    const duplicate = validateManualIntakeSource(
      { id: 'coinbase-2', kind: 'exchange-csv', label: 'Main Export', exchange: 'coinbase' },
      existing,
    );

    expect(existing[0]?.fingerprint).toBe('exchange:coinbase:main export');
    expect(duplicate.status).toBe('duplicate-risk');
  });
});
