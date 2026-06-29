// SPDX-License-Identifier: BUSL-1.1

import { EMOTION_TAGS, type EmotionTag, type MoodJournalEntry } from '../../lib/mood';

/** Visual treatment for a single "what's behind it?" reason (emotion tag). */
export interface EmotionVisual {
  readonly tag: EmotionTag;
  readonly label: string;
  readonly className: string;
}

const EMOTION_LABELS: Record<EmotionTag, string> = {
  stressed: 'Stressed',
  anxious: 'Anxious',
  happy: 'Happy',
  sad: 'Sad',
  bored: 'Bored',
  excited: 'Excited',
  frustrated: 'Frustrated',
  content: 'Content',
  overwhelmed: 'Overwhelmed',
  celebratory: 'Celebratory',
};

/** Human-readable label shown when a check-in recorded no reason. */
export const UNSPECIFIED_REASON_LABEL = 'Unspecified';

/** CSS class for the neutral swatch used when no reason was recorded. */
export const UNSPECIFIED_REASON_CLASS = 'mood-reason--unspecified';

/**
 * Resolve the color + label treatment for a single reason tag. The class name
 * matches a `.mood-reason--<tag>` rule in `mood.css`, so the same color is used
 * for both calendar cells and the legend swatch that documents it.
 */
export function emotionVisual(tag: EmotionTag): EmotionVisual {
  return {
    tag,
    label: EMOTION_LABELS[tag],
    className: `mood-reason--${tag}`,
  };
}

/** All reason visuals in canonical order, for building a stable legend. */
export const EMOTION_VISUALS: readonly EmotionVisual[] = EMOTION_TAGS.map(emotionVisual);

/**
 * The reason that drives a day's color: the first emotion captured for the
 * entry. Returns `null` when the entry recorded no reason.
 */
export function primaryReason(entry: Pick<MoodJournalEntry, 'emotions'>): EmotionTag | null {
  return entry.emotions[0] ?? null;
}
