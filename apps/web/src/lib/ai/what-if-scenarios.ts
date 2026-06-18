// SPDX-License-Identifier: BUSL-1.1

export type ScenarioChangeType = 'expense' | 'income' | 'transfer' | 'goal-contribution';
export type ScenarioFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly';

export interface ScenarioChange {
  readonly id: string;
  readonly description: string;
  readonly type: ScenarioChangeType;
  readonly amountCents: number;
  readonly startDate: string;
  readonly endDate?: string;
  readonly frequency: ScenarioFrequency;
}

export interface ScenarioDraft {
  readonly id: string;
  readonly name: string;
  readonly changes: readonly ScenarioChange[];
  readonly updatedAt: string;
}

export interface WhatIfScenarioInput {
  readonly currentBalanceCents: number;
  readonly baselineDailyNetCents: number;
  readonly dailyVarianceCents: number;
  readonly horizonDays: number;
  readonly asOfDate?: string;
  readonly safetyBufferCents?: number;
  readonly changes: readonly ScenarioChange[];
}

export interface ScenarioForecastBand {
  readonly expectedBalanceCents: number;
  readonly lowBalanceCents: number;
  readonly highBalanceCents: number;
}

export interface WhatIfScenarioResult {
  readonly baseline: ScenarioForecastBand;
  readonly scenario: ScenarioForecastBand;
  readonly deltaCents: number;
  readonly confidenceRangeCents: number;
  readonly riskFlags: readonly string[];
  readonly assumptions: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function addDays(date: string, days: number): string {
  return new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function impactSign(type: ScenarioChangeType): number {
  return type === 'income' ? 1 : -1;
}

function frequencyStepDays(frequency: ScenarioFrequency): number | null {
  if (frequency === 'once') return null;
  if (frequency === 'weekly') return 7;
  if (frequency === 'biweekly') return 14;
  return 30;
}

function changeImpactThrough(
  change: ScenarioChange,
  asOfDate: string,
  horizonDays: number,
): number {
  const startMs = parseDate(asOfDate);
  const endMs = parseDate(addDays(asOfDate, horizonDays));
  const changeStart = Math.max(parseDate(change.startDate), startMs + DAY_MS);
  const changeEnd = Math.min(parseDate(change.endDate ?? addDays(asOfDate, horizonDays)), endMs);
  if (changeStart > changeEnd) return 0;

  const signedAmount = impactSign(change.type) * Math.abs(change.amountCents);
  const stepDays = frequencyStepDays(change.frequency);
  if (stepDays === null) return signedAmount;

  let total = 0;
  for (let dueMs = changeStart; dueMs <= changeEnd; dueMs += stepDays * DAY_MS) {
    total += signedAmount;
  }
  return total;
}

function bandFor(
  currentBalanceCents: number,
  baselineDailyNetCents: number,
  dailyVarianceCents: number,
  horizonDays: number,
  extraImpactCents: number,
): ScenarioForecastBand {
  const expectedBalanceCents = Math.round(
    currentBalanceCents + baselineDailyNetCents * horizonDays + extraImpactCents,
  );
  const band = Math.round(1.64 * dailyVarianceCents * Math.sqrt(horizonDays));
  return {
    expectedBalanceCents,
    lowBalanceCents: expectedBalanceCents - band,
    highBalanceCents: expectedBalanceCents + band,
  };
}

export function predictWhatIfScenario(input: WhatIfScenarioInput): WhatIfScenarioResult {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const safetyBuffer = input.safetyBufferCents ?? 0;
  const scenarioImpact = input.changes.reduce(
    (sum, change) => sum + changeImpactThrough(change, asOfDate, input.horizonDays),
    0,
  );
  const baseline = bandFor(
    input.currentBalanceCents,
    input.baselineDailyNetCents,
    input.dailyVarianceCents,
    input.horizonDays,
    0,
  );
  const scenario = bandFor(
    input.currentBalanceCents,
    input.baselineDailyNetCents,
    input.dailyVarianceCents,
    input.horizonDays,
    scenarioImpact,
  );
  const riskFlags: string[] = [];
  if (scenario.lowBalanceCents < 0) riskFlags.push('overdraft-risk');
  if (safetyBuffer > 0 && scenario.lowBalanceCents < safetyBuffer)
    riskFlags.push('safety-buffer-breach');
  if (
    input.changes.some((change) => change.type === 'goal-contribution') &&
    scenario.lowBalanceCents < safetyBuffer
  ) {
    riskFlags.push('goal-contribution-at-risk');
  }

  return {
    baseline,
    scenario,
    deltaCents: scenario.expectedBalanceCents - baseline.expectedBalanceCents,
    confidenceRangeCents: scenario.highBalanceCents - scenario.lowBalanceCents,
    riskFlags,
    assumptions: [
      'Scenario changes are synthetic and do not modify real transactions.',
      'Recurring changes repeat on fixed day intervals for local planning.',
      'Confidence bands reuse the supplied baseline daily variance.',
    ],
  };
}

export function saveScenarioDraft(
  drafts: readonly ScenarioDraft[],
  draft: Omit<ScenarioDraft, 'updatedAt'>,
  updatedAt = new Date().toISOString(),
): readonly ScenarioDraft[] {
  const next: ScenarioDraft = { ...draft, updatedAt };
  const existingIndex = drafts.findIndex((item) => item.id === draft.id);
  if (existingIndex === -1) return [...drafts, next];
  return drafts.map((item, index) => (index === existingIndex ? next : item));
}

export function deleteScenarioDraft(
  drafts: readonly ScenarioDraft[],
  draftId: string,
): readonly ScenarioDraft[] {
  return drafts.filter((draft) => draft.id !== draftId);
}
