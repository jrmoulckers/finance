package com.finance.core.insights

import kotlinx.datetime.Instant

/**
 * A gamification achievement the user can unlock.
 *
 * @property id Unique, stable identifier for this achievement kind (e.g., "first_budget").
 * @property title Short human-readable title (e.g., "Budget Beginner").
 * @property description Longer explanation of how to earn the achievement.
 * @property icon Platform-agnostic icon key (e.g., "trophy", "streak_fire").
 * @property unlockedAt Non-null once the user has earned the achievement.
 */
data class Achievement(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val unlockedAt: Instant? = null,
) {
    /** `true` when the user has earned this achievement. */
    val isUnlocked: Boolean get() = unlockedAt != null
}
