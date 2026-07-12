// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple

import android.content.SharedPreferences

/**
 * Identifies which partner in an engaged couple an item belongs to.
 *
 * The couple-money features intentionally avoid pulling real names from the
 * auth layer — partners name themselves locally so nothing personally
 * identifying is required to use the workspace. [Partner.A] / [Partner.B] are
 * stable keys; the display labels live in [CoupleProfile].
 */
enum class Partner { A, B }

/**
 * Locally-configured display names for the two partners plus a shared label.
 *
 * Stored on-device only (never synced) so the couple features can show
 * friendly names ("Sam", "Alex", "Ours") without touching account PII.
 *
 * @property partnerAName Display name for [Partner.A]. Defaults to "You".
 * @property partnerBName Display name for [Partner.B]. Defaults to "Partner".
 * @property sharedLabel Label for jointly owned items. Defaults to "Ours".
 */
data class CoupleProfile(
    val partnerAName: String = DEFAULT_A,
    val partnerBName: String = DEFAULT_B,
    val sharedLabel: String = DEFAULT_SHARED,
) {
    /** Resolves the display name for a specific [partner]. */
    fun nameFor(partner: Partner): String = when (partner) {
        Partner.A -> partnerAName.ifBlank { DEFAULT_A }
        Partner.B -> partnerBName.ifBlank { DEFAULT_B }
    }

    companion object {
        const val DEFAULT_A = "You"
        const val DEFAULT_B = "Partner"
        const val DEFAULT_SHARED = "Ours"
    }
}

/**
 * Persists the [CoupleProfile] in the app's encrypted [SharedPreferences].
 *
 * Names are lightly non-sensitive personalization; they are kept on-device
 * and never included in sync payloads.
 */
class CoupleProfileRepository(
    private val prefs: SharedPreferences,
) {

    /** Loads the persisted profile, falling back to friendly defaults. */
    fun load(): CoupleProfile = CoupleProfile(
        partnerAName = prefs.getString(KEY_A, CoupleProfile.DEFAULT_A).orEmpty()
            .ifBlank { CoupleProfile.DEFAULT_A },
        partnerBName = prefs.getString(KEY_B, CoupleProfile.DEFAULT_B).orEmpty()
            .ifBlank { CoupleProfile.DEFAULT_B },
        sharedLabel = prefs.getString(KEY_SHARED, CoupleProfile.DEFAULT_SHARED).orEmpty()
            .ifBlank { CoupleProfile.DEFAULT_SHARED },
    )

    /** Saves [profile], trimming blank names back to defaults. */
    fun save(profile: CoupleProfile) {
        prefs.edit()
            .putString(KEY_A, profile.partnerAName.trim().ifBlank { CoupleProfile.DEFAULT_A })
            .putString(KEY_B, profile.partnerBName.trim().ifBlank { CoupleProfile.DEFAULT_B })
            .putString(KEY_SHARED, profile.sharedLabel.trim().ifBlank { CoupleProfile.DEFAULT_SHARED })
            .apply()
    }

    private companion object {
        const val KEY_A = "couple_partner_a_name"
        const val KEY_B = "couple_partner_b_name"
        const val KEY_SHARED = "couple_shared_label"
    }
}
