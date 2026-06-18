// SPDX-License-Identifier: BUSL-1.1

/** Credential-free watch-only wallet and exchange manual intake workflow model. References: issue #2657 */
export type ManualIntakeSourceKind = 'watch-wallet' | 'exchange-csv' | 'manual-balance';
export type IntakeValidationStatus = 'valid' | 'invalid' | 'duplicate-risk';

export interface ManualIntakeSource {
  readonly id: string;
  readonly kind: ManualIntakeSourceKind;
  readonly label: string;
  readonly chain?: string;
  readonly address?: string;
  readonly exchange?: 'coinbase' | 'kraken' | 'other';
  readonly fingerprint: string;
}

export interface IntakeValidationResult {
  readonly status: IntakeValidationStatus;
  readonly fingerprint: string;
  readonly reason: string;
}

const ADDRESS_PATTERNS: Readonly<Record<string, RegExp>> = {
  ethereum: /^0x[a-fA-F0-9]{40}$/,
  polygon: /^0x[a-fA-F0-9]{40}$/,
  bitcoin: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export function fingerprintSource(source: Omit<ManualIntakeSource, 'fingerprint'>): string {
  if (source.kind === 'watch-wallet')
    return `wallet:${source.chain?.toLowerCase() ?? 'unknown'}:${source.address?.toLowerCase() ?? ''}`;
  if (source.kind === 'exchange-csv')
    return `exchange:${source.exchange ?? 'other'}:${source.label.toLowerCase()}`;
  return `manual:${source.label.toLowerCase()}`;
}

export function validateManualIntakeSource(
  source: Omit<ManualIntakeSource, 'fingerprint'>,
  existing: readonly ManualIntakeSource[] = [],
): IntakeValidationResult {
  const fingerprint = fingerprintSource(source);
  if (existing.some((item) => item.fingerprint === fingerprint))
    return {
      status: 'duplicate-risk',
      fingerprint,
      reason: 'A source with the same exchange/wallet fingerprint already exists.',
    };
  if (source.kind === 'watch-wallet') {
    const chain = source.chain?.toLowerCase() ?? '';
    const pattern = ADDRESS_PATTERNS[chain];
    if (!pattern || !source.address || !pattern.test(source.address))
      return {
        status: 'invalid',
        fingerprint,
        reason: 'Address does not match supported chain format.',
      };
  }
  if (source.kind === 'exchange-csv' && !source.exchange)
    return {
      status: 'invalid',
      fingerprint,
      reason: 'Exchange CSV intake requires an exchange label.',
    };
  return { status: 'valid', fingerprint, reason: 'Source can be added without live credentials.' };
}

export function createManualIntakeSource(
  source: Omit<ManualIntakeSource, 'fingerprint'>,
  existing: readonly ManualIntakeSource[] = [],
): ManualIntakeSource {
  const validation = validateManualIntakeSource(source, existing);
  if (validation.status === 'invalid') throw new Error(validation.reason);
  return { ...source, fingerprint: validation.fingerprint };
}
