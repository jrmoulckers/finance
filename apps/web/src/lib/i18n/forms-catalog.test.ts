// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { FORM_COPY_IDS, getFormCopy, getToastAriaLabel } from './forms-catalog';

describe('forms-catalog', () => {
  it('defines stable IDs for form validation and toast copy', () => {
    expect(FORM_COPY_IDS.accountNameRequired).toBe('forms.account.name.required');
    expect(getFormCopy('accountNameRequired', 'en-US')).toBe('Account name is required.');
  });

  it('supports localized validation and pluralized counts', () => {
    expect(getFormCopy('accountInitialBalanceInvalid', 'es-ES')).toBe('El saldo inicial debe ser un número válido.');
    expect(getFormCopy('validationErrorCount', 'en-US', { count: 2 })).toBe('2 fields need attention');
  });

  it('builds localized toast aria labels', () => {
    expect(getToastAriaLabel('success', 'Cuenta creada', 'es-ES')).toBe('Correcto: Cuenta creada');
  });
});
