// SPDX-License-Identifier: BUSL-1.1

/**
 * Financial education feed engine.
 *
 * Pure functions for age-appropriate lesson management, completion tracking,
 * quiz scoring, lesson sequencing, and progress badge computation.
 *
 * References: #1729
 */

import type { EducationLesson, LessonProgress, ProgressBadge, AgeBracket } from './types';
import { safeDivide, bankersRound } from './utils';

// ---------------------------------------------------------------------------
// Age bracket resolution
// ---------------------------------------------------------------------------

/**
 * Determines the age bracket for a given age.
 *
 * @param age - Member's age in years
 * @returns The appropriate age bracket
 */
export function getAgeBracket(age: number): AgeBracket {
  if (age < 8) return 'under-8';
  if (age <= 12) return '8-12';
  return '13-17';
}

// ---------------------------------------------------------------------------
// Lesson filtering & sequencing
// ---------------------------------------------------------------------------

/**
 * Filters lessons appropriate for a given age.
 *
 * @param lessons - All available lessons
 * @param age - Member's age in years
 * @returns Lessons matching the member's age bracket
 */
export function getLessonsForAge(
  lessons: readonly EducationLesson[],
  age: number,
): readonly EducationLesson[] {
  const bracket = getAgeBracket(age);
  return lessons.filter((l) => l.ageBracket === bracket);
}

/**
 * Returns lessons for a specific topic, ordered by sequence.
 *
 * @param lessons - All lessons
 * @param topic - Topic to filter
 * @returns Lessons for the topic, sorted by sequenceOrder
 */
export function getLessonsByTopic(
  lessons: readonly EducationLesson[],
  topic: string,
): readonly EducationLesson[] {
  return lessons
    .filter((l) => l.topic === topic)
    .slice()
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

/**
 * Gets all unique topics from a set of lessons.
 *
 * @param lessons - All lessons
 * @returns Sorted array of unique topic names
 */
export function getTopics(lessons: readonly EducationLesson[]): readonly string[] {
  return [...new Set(lessons.map((l) => l.topic))].sort();
}

/**
 * Returns the next lesson in a topic sequence for a member.
 *
 * @param lessons - All lessons
 * @param progress - Member's lesson progress records
 * @param topic - Topic to advance in
 * @param memberId - Member ID
 * @returns The next incomplete lesson, or null if all are done
 */
export function getNextLesson(
  lessons: readonly EducationLesson[],
  progress: readonly LessonProgress[],
  topic: string,
  memberId: string,
): EducationLesson | null {
  const topicLessons = getLessonsByTopic(lessons, topic);
  const completedIds = new Set(
    progress.filter((p) => p.memberId === memberId && p.completed).map((p) => p.lessonId),
  );

  return topicLessons.find((l) => !completedIds.has(l.id)) ?? null;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

/**
 * Records completion of a lesson.
 *
 * @param lessonId - Lesson ID completed
 * @param memberId - Member who completed it
 * @param quizScore - Quiz score (0-100, -1 if no quiz)
 * @param now - Current ISO-8601 timestamp
 * @returns A new LessonProgress record
 */
export function completeLesson(
  lessonId: string,
  memberId: string,
  quizScore: number,
  now: string,
): LessonProgress {
  return {
    lessonId,
    memberId,
    completed: true,
    quizScore,
    completedAt: now,
  };
}

/**
 * Calculates the completion percentage for a topic.
 *
 * @param lessons - All lessons for the topic
 * @param progress - Member's progress records
 * @param memberId - Member ID
 * @returns Completion percentage (0-100)
 */
export function getTopicCompletionPercent(
  lessons: readonly EducationLesson[],
  progress: readonly LessonProgress[],
  memberId: string,
): number {
  if (lessons.length === 0) return 0;
  const completedCount = lessons.filter((l) =>
    progress.some((p) => p.lessonId === l.id && p.memberId === memberId && p.completed),
  ).length;
  return bankersRound(safeDivide(completedCount * 100, lessons.length));
}

/**
 * Calculates the average quiz score across completed lessons.
 *
 * @param progress - Member's progress records
 * @param memberId - Member ID
 * @returns Average quiz score (0-100), or -1 if no quizzes taken
 */
export function getAverageQuizScore(progress: readonly LessonProgress[], memberId: string): number {
  const quizzes = progress.filter(
    (p) => p.memberId === memberId && p.completed && p.quizScore >= 0,
  );
  if (quizzes.length === 0) return -1;
  const total = quizzes.reduce((sum, p) => sum + p.quizScore, 0);
  return bankersRound(safeDivide(total, quizzes.length));
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

/**
 * Checks which badges a member has earned based on their progress.
 *
 * @param badges - All available badges
 * @param lessons - All lessons
 * @param progress - Member's progress records
 * @param memberId - Member ID
 * @returns Array of earned badge IDs
 */
export function getEarnedBadges(
  badges: readonly ProgressBadge[],
  lessons: readonly EducationLesson[],
  progress: readonly LessonProgress[],
  memberId: string,
): readonly string[] {
  return badges
    .filter((badge) => {
      const topicLessons = lessons.filter((l) => l.topic === badge.topic);
      const completed = topicLessons.filter((l) =>
        progress.some((p) => p.lessonId === l.id && p.memberId === memberId && p.completed),
      ).length;
      return completed >= badge.requiredLessons;
    })
    .map((b) => b.id);
}

/**
 * Creates a progress badge definition.
 *
 * @param params - Badge parameters
 * @returns A new ProgressBadge
 */
export function createBadge(params: {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly topic: string;
  readonly requiredLessons: number;
}): ProgressBadge {
  return { ...params };
}

/**
 * Computes an overall education progress summary for a member.
 *
 * @param lessons - All age-appropriate lessons
 * @param progress - Member's progress records
 * @param memberId - Member ID
 * @returns Summary object
 */
export function getEducationSummary(
  lessons: readonly EducationLesson[],
  progress: readonly LessonProgress[],
  memberId: string,
): {
  readonly totalLessons: number;
  readonly completedLessons: number;
  readonly completionPercent: number;
  readonly averageQuizScore: number;
  readonly topicsStarted: number;
  readonly topicsCompleted: number;
} {
  const completedIds = new Set(
    progress.filter((p) => p.memberId === memberId && p.completed).map((p) => p.lessonId),
  );
  const completedLessons = lessons.filter((l) => completedIds.has(l.id)).length;
  const topics = getTopics(lessons);

  let topicsStarted = 0;
  let topicsCompleted = 0;
  for (const topic of topics) {
    const topicLessons = lessons.filter((l) => l.topic === topic);
    const topicCompleted = topicLessons.filter((l) => completedIds.has(l.id)).length;
    if (topicCompleted > 0) topicsStarted++;
    if (topicCompleted === topicLessons.length && topicLessons.length > 0) {
      topicsCompleted++;
    }
  }

  return {
    totalLessons: lessons.length,
    completedLessons,
    completionPercent: bankersRound(safeDivide(completedLessons * 100, lessons.length)),
    averageQuizScore: getAverageQuizScore(progress, memberId),
    topicsStarted,
    topicsCompleted,
  };
}
