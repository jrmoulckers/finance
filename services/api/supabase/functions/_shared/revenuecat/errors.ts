// SPDX-License-Identifier: BUSL-1.1

export class RevenueCatEvidenceError extends Error {
  readonly code: 'invalid_payload' | 'invalid_source' | 'invalid_lifecycle' | 'subject_mismatch';

  constructor(
    code: 'invalid_payload' | 'invalid_source' | 'invalid_lifecycle' | 'subject_mismatch',
  ) {
    super(code);
    this.name = 'RevenueCatEvidenceError';
    this.code = code;
  }
}
