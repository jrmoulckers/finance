// SPDX-License-Identifier: BUSL-1.1

export interface LearningProgressState {
  readonly pathId: string;
  readonly currentModuleId: string;
  readonly completedModuleIds: readonly string[];
  readonly quizScores: Readonly<Record<string, number>>;
  readonly sessionDates: readonly string[];
}

export interface LearningRewardEvent {
  readonly type: 'module-complete' | 'quiz-mastery' | 'return-streak';
  readonly refId: string;
  readonly points: number;
}

export function serializeLearningProgress(state: LearningProgressState): string {
  return JSON.stringify(state);
}

export function deserializeLearningProgress(serialized: string): LearningProgressState {
  return JSON.parse(serialized) as LearningProgressState;
}

function calculateStreak(dates: readonly string[]): number {
  const unique = [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  let streak = 0;
  let expected: string | null = null;
  for (const date of unique) {
    if (expected !== null && date !== expected) break;
    streak += 1;
    const nextDate: Date = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() - 1);
    expected = nextDate.toISOString().slice(0, 10);
  }
  return streak;
}

export function generateLearningRewardEvents(
  state: LearningProgressState,
): readonly LearningRewardEvent[] {
  const events: LearningRewardEvent[] = state.completedModuleIds.map((moduleId) => ({
    type: 'module-complete',
    refId: moduleId,
    points: 50,
  }));
  for (const [quizId, score] of Object.entries(state.quizScores)) {
    if (score >= 0.9) events.push({ type: 'quiz-mastery', refId: quizId, points: 100 });
  }
  const streak = calculateStreak(state.sessionDates);
  if (streak >= 3)
    events.push({ type: 'return-streak', refId: `${streak}-day`, points: streak * 10 });
  return events;
}
