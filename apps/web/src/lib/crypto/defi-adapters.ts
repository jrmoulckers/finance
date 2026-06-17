// SPDX-License-Identifier: BUSL-1.1

/** DeFi protocol adapter and pricing abstraction with manual/stub provider. References: issue #2691 */
import type { DeFiPosition, RewardBalance } from './defi-positions';

export type ProviderState = 'fresh' | 'stale' | 'failed';

export interface ValuationSourceMetadata {
  readonly source: string;
  readonly asOf: string;
  readonly state: ProviderState;
  readonly message?: string;
}

export interface ProtocolPositionFixture {
  readonly position: DeFiPosition;
  readonly valuation: ValuationSourceMetadata;
}

export interface DeFiProtocolProvider {
  readonly id: string;
  readonly supportedProtocols: readonly string[];
  listPositions(accountId: string): Promise<readonly DeFiPosition[]>;
  getRewardBalances(positionId: string): Promise<readonly RewardBalance[]>;
  getValuationMetadata(positionId: string): Promise<ValuationSourceMetadata>;
}

export class FixtureDeFiProtocolProvider implements DeFiProtocolProvider {
  readonly id = 'fixture-defi';
  readonly supportedProtocols: readonly string[];
  private readonly fixtures: readonly ProtocolPositionFixture[];

  constructor(fixtures: readonly ProtocolPositionFixture[]) {
    this.fixtures = fixtures;
    this.supportedProtocols = [...new Set(fixtures.map((fixture) => fixture.position.protocol))].sort();
  }

  async listPositions(_accountId: string): Promise<readonly DeFiPosition[]> {
    return this.fixtures.map((fixture) => fixture.position);
  }

  async getRewardBalances(positionId: string): Promise<readonly RewardBalance[]> {
    return this.fixtures.find((fixture) => fixture.position.id === positionId)?.position.rewardTokens ?? [];
  }

  async getValuationMetadata(positionId: string): Promise<ValuationSourceMetadata> {
    return this.fixtures.find((fixture) => fixture.position.id === positionId)?.valuation ?? { source: this.id, asOf: new Date(0).toISOString(), state: 'failed', message: 'Position not found.' };
  }
}

export function evaluateProviderState(metadata: ValuationSourceMetadata, now: string, staleAfterMs: number): ProviderState {
  if (metadata.state === 'failed') return 'failed';
  const age = new Date(now).getTime() - new Date(metadata.asOf).getTime();
  return age > staleAfterMs ? 'stale' : metadata.state;
}
