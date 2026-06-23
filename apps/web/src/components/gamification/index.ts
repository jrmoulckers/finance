// SPDX-License-Identifier: BUSL-1.1

export {
  computeGamification,
  getUnlockedCount,
  getAchievementsByCategory,
} from './achievements-engine';
export type {
  Achievement,
  AchievementCategory,
  AchievementStatus,
  AchievementNearWin,
  NearWinFormat,
  StreakData,
  GoalMilestone,
  GamificationInput,
  GamificationState,
} from './achievements-engine';
export {
  computeNearWinCues,
  streakKeepAliveCue,
  goalNearWinCue,
  badgeNearWinCue,
  selectNewlyUnlocked,
  formatRemainingCurrency,
  pluralizeUnit,
} from './near-win-engine';
export type { NearWinCue, NearWinKind, NearWinOptions, UnlockCelebration } from './near-win-engine';
