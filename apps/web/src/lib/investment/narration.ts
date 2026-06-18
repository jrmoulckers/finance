// SPDX-License-Identifier: BUSL-1.1

/** Local finance narration summary engine contract. References: issue #2706 */
export type NarrationMode = 'concise' | 'detailed';
export type TrendDirection = 'up' | 'down' | 'flat' | 'volatile';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ChartTrendInput {
  readonly label: string;
  readonly direction: TrendDirection;
  readonly changePercent?: number;
}

export interface SpendingChangeInput {
  readonly category: string;
  readonly changeCents: number;
  readonly direction: 'higher' | 'lower' | 'flat';
}

export interface FinanceAlertInput {
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
}

export interface NarrationInput {
  readonly trends: readonly ChartTrendInput[];
  readonly spendingChanges: readonly SpendingChangeInput[];
  readonly alerts: readonly FinanceAlertInput[];
  readonly confidence: ConfidenceLevel;
  readonly uncertainty?: string;
}

export interface NarrationSummary {
  readonly mode: NarrationMode;
  readonly headline: string;
  readonly details: readonly string[];
  readonly confidencePhrase: string;
}

function confidencePhrase(confidence: ConfidenceLevel, uncertainty?: string): string {
  const base =
    confidence === 'high'
      ? 'High confidence'
      : confidence === 'medium'
        ? 'Moderate confidence'
        : 'Low confidence';
  return uncertainty ? `${base}; ${uncertainty}.` : `${base}.`;
}

function trendPhrase(trend: ChartTrendInput): string {
  const change =
    trend.changePercent === undefined ? '' : ` ${Math.abs(trend.changePercent).toFixed(1)}%`;
  if (trend.direction === 'volatile')
    return `${trend.label} is moving around more than usual${change}.`;
  if (trend.direction === 'down') return `${trend.label} is lower${change}.`;
  if (trend.direction === 'up') return `${trend.label} is higher${change}.`;
  return `${trend.label} is mostly unchanged.`;
}

function spendingPhrase(change: SpendingChangeInput): string {
  if (change.direction === 'flat') return `${change.category} spending is about the same.`;
  return `${change.category} spending is ${change.direction}.`;
}

export function narrateFinanceState(
  input: NarrationInput,
  mode: NarrationMode = 'concise',
): NarrationSummary {
  const details = [
    ...input.trends.map(trendPhrase),
    ...input.spendingChanges.map(spendingPhrase),
    ...input.alerts.map((alert) =>
      alert.severity === 'critical' ? `Needs attention: ${alert.message}` : alert.message,
    ),
  ];
  const headline = details[0] ?? 'No finance activity to summarize yet.';
  return {
    mode,
    headline,
    details: mode === 'concise' ? details.slice(0, 3) : details,
    confidencePhrase: confidencePhrase(input.confidence, input.uncertainty),
  };
}
