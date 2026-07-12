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

// ---------------------------------------------------------------------------
// 300%/400% large-text surface QA matrix (#2487, follow-up to #2274)
//
// Responsive QA at 300% and 400% browser zoom plus in-app large/huge text for
// the surfaces named in the follow-up: navigation, modals, forms, command
// palette, chart summaries, bottom navigation, and focus indicators. Each case
// derives its expected reflow via chooseLargeTextReflow so the run sheet stays
// consistent with the shared reflow logic, and lists the concrete checks a
// tester (or assertion) must confirm at that zoom level.
// ---------------------------------------------------------------------------

export type LargeTextSurface =
  | 'navigation'
  | 'modal'
  | 'form'
  | 'command-palette'
  | 'chart-summary'
  | 'bottom-navigation'
  | 'focus-indicator';

export interface LargeTextSurfaceQaCase {
  surface: LargeTextSurface;
  browserZoomPercent: 300 | 400;
  inAppTextSize: 'large' | 'huge';
  viewportWidth: number;
  effectiveScale: number;
  expectedMode: ReflowMode;
  checks: readonly string[];
}

const LARGE_TEXT_SURFACES: Record<LargeTextSurface, { hasDenseData: boolean; checks: string[] }> = {
  navigation: {
    hasDenseData: false,
    checks: [
      'primary nav collapses to a single-column menu without clipping labels',
      'all nav targets stay reachable by keyboard and pointer',
    ],
  },
  modal: {
    hasDenseData: false,
    checks: [
      'dialog stays within the viewport and scrolls on a single axis',
      'title, body, and actions remain visible without horizontal scroll',
    ],
  },
  form: {
    hasDenseData: false,
    checks: [
      'labels stay associated and above their fields when stacked',
      'no field or helper text is truncated or overlapped',
    ],
  },
  'command-palette': {
    hasDenseData: true,
    checks: [
      'result rows wrap to a readable card layout',
      'active-item highlight and shortcut hints remain legible',
    ],
  },
  'chart-summary': {
    hasDenseData: true,
    checks: [
      'plain-language summary is shown before the chart',
      'data table alternative allows single-axis scroll',
    ],
  },
  'bottom-navigation': {
    hasDenseData: false,
    checks: [
      'bottom bar does not overlap content or the on-screen keyboard',
      'tab labels and icons remain tappable at 44px minimum targets',
    ],
  },
  'focus-indicator': {
    hasDenseData: false,
    checks: [
      'focus ring stays fully visible and unclipped after reflow',
      'focus order matches the reflowed visual order',
    ],
  },
};

export function buildLargeTextSurfaceQaMatrix(): LargeTextSurfaceQaCase[] {
  const zooms: Array<{ browserZoomPercent: 300 | 400; inAppTextSize: 'large' | 'huge' }> = [
    { browserZoomPercent: 300, inAppTextSize: 'large' },
    { browserZoomPercent: 400, inAppTextSize: 'huge' },
  ];
  const viewportWidth = 1280;

  return (Object.keys(LARGE_TEXT_SURFACES) as LargeTextSurface[]).flatMap((surface) =>
    zooms.map(({ browserZoomPercent, inAppTextSize }) => {
      const decision = chooseLargeTextReflow({
        viewportWidth,
        browserZoomPercent,
        hasDenseData: LARGE_TEXT_SURFACES[surface].hasDenseData,
      });
      return {
        surface,
        browserZoomPercent,
        inAppTextSize,
        viewportWidth,
        effectiveScale: decision.effectiveScale,
        expectedMode: decision.mode,
        checks: LARGE_TEXT_SURFACES[surface].checks,
      };
    }),
  );
}
