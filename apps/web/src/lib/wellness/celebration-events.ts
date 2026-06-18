// SPDX-License-Identifier: BUSL-1.1

export type HealthyHabitDomain = 'goals' | 'learning' | 'check-ins' | 'achievements';

export interface HealthyHabitInput {
  readonly domain: HealthyHabitDomain;
  readonly date: string;
  readonly percentComplete: number;
  readonly completed: boolean;
}

export interface CelebrationEvent {
  readonly type: 'streak' | 'near-win' | 'completion';
  readonly domain: HealthyHabitDomain;
  readonly ref: string;
}

export function deriveHabitStreak(dates: readonly string[]): number {
  const sorted = [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  let streak = 0;
  let expected: string | null = null;
  for (const date of sorted) {
    if (expected !== null && date !== expected) break;
    streak += 1;
    const nextDate: Date = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() - 1);
    expected = nextDate.toISOString().slice(0, 10);
  }
  return streak;
}

export function isNearWin(input: HealthyHabitInput): boolean {
  return !input.completed && input.percentComplete >= 80 && input.percentComplete < 100;
}

export function emitCelebrationEvents(
  inputs: readonly HealthyHabitInput[],
): readonly CelebrationEvent[] {
  const events: CelebrationEvent[] = [];
  const streak = deriveHabitStreak(inputs.map((input) => input.date));
  if (streak >= 3)
    events.push({ type: 'streak', domain: inputs[0]?.domain ?? 'goals', ref: `${streak}-day` });
  for (const input of inputs) {
    if (input.completed) events.push({ type: 'completion', domain: input.domain, ref: input.date });
    else if (isNearWin(input))
      events.push({ type: 'near-win', domain: input.domain, ref: `${input.percentComplete}%` });
  }
  return events;
}
