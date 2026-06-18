// SPDX-License-Identifier: BUSL-1.1

export type CheckInPromptCategory = 'money-values' | 'goals' | 'stress' | 'celebration';

export interface CheckInPrompt {
  readonly id: string;
  readonly category: CheckInPromptCategory;
  readonly text: string;
}

export interface CheckInEntry {
  readonly participantId: string;
  readonly text: string;
  readonly private: boolean;
}

export function canStartCheckIn(
  consentByParticipant: Readonly<Record<string, boolean>>,
  lastCheckInDate: string | null,
  today: string,
  cadenceDays: number,
): boolean {
  if (!Object.values(consentByParticipant).every(Boolean)) return false;
  if (lastCheckInDate === null) return true;
  const elapsedDays = Math.floor((Date.parse(today) - Date.parse(lastCheckInDate)) / 86_400_000);
  return elapsedDays >= cadenceDays;
}

export function selectNextPrompt(
  prompts: readonly CheckInPrompt[],
  usedPromptIds: readonly string[],
): CheckInPrompt | null {
  return prompts.find((prompt) => !usedPromptIds.includes(prompt.id)) ?? prompts[0] ?? null;
}

export function buildPrivacySafeCheckInSummary(
  entries: readonly CheckInEntry[],
): readonly string[] {
  return entries.map((entry) =>
    entry.private ? `${entry.participantId}: redacted` : `${entry.participantId}: ${entry.text}`,
  );
}
