// SPDX-License-Identifier: BUSL-1.1

export type ReflowMode = 'standard' | 'stacked' | 'card-alternative';

export interface ReflowInput {
  viewportWidth: number;
  browserZoomPercent: number;
  inAppScale?: number;
  hasDenseData?: boolean;
}

export interface ReflowDecision {
  effectiveScale: number;
  mode: ReflowMode;
  allowSingleAxisTableScroll: boolean;
  reasons: string[];
}

export interface LargeTextAuditCase {
  name: string;
  browserZoomPercent: number;
  inAppScale: number;
  expectedMode: ReflowMode;
}

export function estimateEffectiveTextScale(browserZoomPercent: number, inAppScale = 1): number {
  const zoom =
    Number.isFinite(browserZoomPercent) && browserZoomPercent > 0 ? browserZoomPercent / 100 : 1;
  const appScale = Number.isFinite(inAppScale) && inAppScale > 0 ? inAppScale : 1;
  return Number((zoom * appScale).toFixed(2));
}

export function chooseLargeTextReflow(input: ReflowInput): ReflowDecision {
  const effectiveScale = estimateEffectiveTextScale(input.browserZoomPercent, input.inAppScale);
  const reasons: string[] = [];
  const narrowAtScale = input.viewportWidth / effectiveScale < 640;

  if (effectiveScale >= 3) {
    reasons.push('effective text scale is at least 300 percent');
  }
  if (narrowAtScale) {
    reasons.push('available width after text scaling is below tablet layout width');
  }
  if (input.hasDenseData) {
    reasons.push('dense financial data needs a non-grid reading path');
  }

  if (input.hasDenseData && (effectiveScale >= 2 || narrowAtScale)) {
    return {
      effectiveScale,
      mode: 'card-alternative',
      allowSingleAxisTableScroll: true,
      reasons,
    };
  }

  if (effectiveScale >= 2 || narrowAtScale) {
    return {
      effectiveScale,
      mode: 'stacked',
      allowSingleAxisTableScroll: false,
      reasons,
    };
  }

  return {
    effectiveScale,
    mode: 'standard',
    allowSingleAxisTableScroll: false,
    reasons,
  };
}

export function buildLargeTextAuditMatrix(): LargeTextAuditCase[] {
  return [
    {
      name: '200 percent browser zoom with default app scale',
      browserZoomPercent: 200,
      inAppScale: 1,
      expectedMode: 'stacked',
    },
    {
      name: '300 percent browser zoom with large app scale',
      browserZoomPercent: 300,
      inAppScale: 1.25,
      expectedMode: 'stacked',
    },
    {
      name: '400 percent browser zoom with huge app scale',
      browserZoomPercent: 400,
      inAppScale: 2,
      expectedMode: 'stacked',
    },
    {
      name: 'dense table at 200 percent text scale',
      browserZoomPercent: 200,
      inAppScale: 1,
      expectedMode: 'card-alternative',
    },
  ];
}
