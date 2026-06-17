// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  findHardCodedUserFacingStrings,
  formatHardCodedStringReport,
  I18N_AUTHORING_GUIDELINES,
} from './i18n-authoring';

describe('i18n-authoring', () => {
  it('documents catalog authoring guardrails', () => {
    expect(I18N_AUTHORING_GUIDELINES.map((entry) => entry.topic)).toContain('Pluralization');
    expect(I18N_AUTHORING_GUIDELINES.map((entry) => entry.guidance).join(' ')).toContain('IVA');
  });

  it('detects hard-coded user-facing JSX text and accessibility attributes', () => {
    const findings = findHardCodedUserFacingStrings(
      'src/components/forms/Example.tsx',
      '<button aria-label="Save account">Save account</button><span>{dynamic}</span>',
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Save account', reason: 'jsx-text' }),
        expect.objectContaining({ text: 'Save account', reason: 'user-facing-attribute' }),
      ]),
    );
    expect(formatHardCodedStringReport(findings)).toContain('Save account');
  });
});
