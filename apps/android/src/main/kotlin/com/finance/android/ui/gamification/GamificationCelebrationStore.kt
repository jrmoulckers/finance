// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

import android.content.SharedPreferences

/**
 * Remembers which achievements have already been celebrated so the
 * celebration moment (#2211) fires exactly once per genuine unlock,
 * never on every screen visit.
 */
class GamificationCelebrationStore(
    private val prefs: SharedPreferences,
) {

    /** The set of achievement IDs the user has already seen celebrated. */
    fun seenIds(): Set<String> =
        prefs.getStringSet(KEY_SEEN, emptySet())?.toSet() ?: emptySet()

    /** Records [ids] as celebrated, so they won't celebrate again. */
    fun markSeen(ids: Set<String>) {
        val merged = seenIds() + ids
        prefs.edit().putStringSet(KEY_SEEN, merged).apply()
    }

    private companion object {
        const val KEY_SEEN = "gamification_celebrated_ids_v1" // gitleaks:allow (prefs key)
    }
}
