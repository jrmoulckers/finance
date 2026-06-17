// SPDX-License-Identifier: BUSL-1.1

/** Bridge, wrap, and self-transfer provenance resolver for crypto tax evidence. References: issue #2674 */
export type ProvenanceClassification = 'self-transfer' | 'bridge' | 'wrap' | 'taxable-swap' | 'ambiguous';

export interface AssetIdentity {
  readonly canonicalAsset: string;
  readonly chain: string;
  readonly symbol: string;
  readonly contract?: string;
}

export interface CryptoMovement {
  readonly id: string;
  readonly walletOwnerId: string;
  readonly chain: string;
  readonly asset: string;
  readonly quantity: number;
  readonly direction: 'in' | 'out';
  readonly timestamp: string;
  readonly txHash?: string;
  readonly counterpartyAddress?: string;
}

export interface ProvenanceResolution {
  readonly classification: ProvenanceClassification;
  readonly movementIds: readonly string[];
  readonly canonicalAsset?: string;
  readonly confidence: number;
  readonly taxable: boolean;
  readonly explanation: string;
  readonly requiresReview: boolean;
}

function canonical(asset: string, chain: string, map: readonly AssetIdentity[]): string {
  const found = map.find((identity) => identity.symbol.toUpperCase() === asset.toUpperCase() && identity.chain.toLowerCase() === chain.toLowerCase());
  return found?.canonicalAsset ?? `${chain.toLowerCase()}:${asset.toUpperCase()}`;
}

function minutesApart(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

export function resolveCryptoProvenance(movements: readonly CryptoMovement[], assetMap: readonly AssetIdentity[], tolerancePercent = 0.005): readonly ProvenanceResolution[] {
  const resolutions: ProvenanceResolution[] = [];
  const used = new Set<string>();
  const outs = movements.filter((movement) => movement.direction === 'out');
  const ins = movements.filter((movement) => movement.direction === 'in');

  for (const out of outs) {
    if (used.has(out.id)) continue;
    const outCanonical = canonical(out.asset, out.chain, assetMap);
    const match = ins.find((incoming) => {
      if (used.has(incoming.id) || incoming.walletOwnerId !== out.walletOwnerId) return false;
      const inCanonical = canonical(incoming.asset, incoming.chain, assetMap);
      const quantityClose = Math.abs(Math.abs(out.quantity) - Math.abs(incoming.quantity)) <= Math.abs(out.quantity) * tolerancePercent;
      return inCanonical === outCanonical && quantityClose && minutesApart(out.timestamp, incoming.timestamp) <= 240;
    });
    if (!match) continue;
    const sameChain = out.chain.toLowerCase() === match.chain.toLowerCase();
    const sameAsset = out.asset.toUpperCase() === match.asset.toUpperCase();
    const classification: ProvenanceClassification = sameChain && sameAsset ? 'self-transfer' : sameChain ? 'wrap' : 'bridge';
    resolutions.push({ classification, movementIds: [out.id, match.id], canonicalAsset: outCanonical, confidence: classification === 'self-transfer' ? 0.95 : 0.85, taxable: false, explanation: `${classification} inferred from same owner, matching canonical asset, quantity, and timestamp proximity.`, requiresReview: classification !== 'self-transfer' });
    used.add(out.id);
    used.add(match.id);
  }

  for (const movement of movements) {
    if (used.has(movement.id)) continue;
    resolutions.push({ classification: movement.direction === 'out' ? 'taxable-swap' : 'ambiguous', movementIds: [movement.id], canonicalAsset: canonical(movement.asset, movement.chain, assetMap), confidence: 0.45, taxable: movement.direction === 'out', explanation: 'No same-owner bridge/wrap/self-transfer evidence found.', requiresReview: true });
  }

  return resolutions;
}
