// SPDX-License-Identifier: BUSL-1.1

export const MOOD_TAGS = ['😊', '😐', '😟', '😡', '🤩', '😴'] as const;
export type MoodTag = (typeof MOOD_TAGS)[number];

export const MOOD_TAGS_ENABLED_KEY = 'experimental.moodTags.enabled';
export const MOOD_TAGS_SYNC_ENABLED_KEY = 'experimental.moodTags.syncEnabled';
export const MOOD_TAGS_CHANGED_EVENT = 'finance:mood-tags-preferences-changed';

export function isMoodTagsEnabled(): boolean {
  return localStorage.getItem(MOOD_TAGS_ENABLED_KEY) === 'true';
}

export function isMoodTagSyncEnabled(): boolean {
  return isMoodTagsEnabled() && localStorage.getItem(MOOD_TAGS_SYNC_ENABLED_KEY) === 'true';
}

export function setMoodTagPreference(key: string, enabled: boolean): void {
  localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event(MOOD_TAGS_CHANGED_EVENT));
}

export function normalizeMoodTag(value: string | null | undefined): MoodTag | null {
  return MOOD_TAGS.includes(value as MoodTag) ? (value as MoodTag) : null;
}
