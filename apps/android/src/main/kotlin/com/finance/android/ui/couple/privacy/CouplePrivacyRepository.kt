// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.privacy

import android.content.SharedPreferences
import com.finance.android.ui.couple.Partner
import org.json.JSONObject
import timber.log.Timber

/**
 * The "yours, mine, ours" sharing classification for a financial item (#2142).
 *
 * - [MINE] / [YOURS] — owned privately by one partner. Only summary totals are
 *   shared with the other partner by default; line items stay private.
 * - [OURS] — jointly owned and fully visible to both partners.
 *
 * The classification is descriptive metadata layered on top of existing
 * household-scoped data; it never deletes or hides the owner's own records.
 */
enum class PrivacyVisibility(val label: String, val shortLabel: String) {
    MINE("Mine", "Mine"),
    YOURS("Yours", "Yours"),
    OURS("Ours", "Ours"),
    ;

    /** True when the item is jointly owned and fully visible to both partners. */
    val isShared: Boolean get() = this == OURS

    companion object {
        /** Parses a persisted name, defaulting to [OURS] for unknown values. */
        fun fromName(name: String?): PrivacyVisibility =
            entries.firstOrNull { it.name == name } ?: OURS

        /** Maps an owning [Partner] to their private visibility. */
        fun privateFor(partner: Partner): PrivacyVisibility =
            if (partner == Partner.A) MINE else YOURS
    }
}

/** The kind of record a [PrivacyVisibility] applies to. */
enum class PrivacyEntityType { ACCOUNT, BUDGET, GOAL, DEBT }

/**
 * Persists per-item [PrivacyVisibility] classifications plus the household-wide
 * "include private items in combined net worth" preference.
 *
 * Backed by encrypted [SharedPreferences] via a single JSON blob so the map can
 * grow without a schema migration. Privacy metadata stays on-device.
 */
class CouplePrivacyRepository(
    private val prefs: SharedPreferences,
) {

    /** Returns the visibility for [type]/[id], defaulting to [PrivacyVisibility.OURS]. */
    fun visibilityFor(type: PrivacyEntityType, id: String): PrivacyVisibility {
        val map = readMap()
        return PrivacyVisibility.fromName(map[key(type, id)])
    }

    /** Returns every stored classification keyed by "TYPE:id". */
    fun allClassifications(): Map<String, PrivacyVisibility> =
        readMap().mapValues { PrivacyVisibility.fromName(it.value) }

    /** Persists the [visibility] for a specific [type]/[id]. */
    fun setVisibility(type: PrivacyEntityType, id: String, visibility: PrivacyVisibility) {
        val map = readMap().toMutableMap()
        map[key(type, id)] = visibility.name
        writeMap(map)
    }

    /** Whether privately-owned items are folded into the combined net-worth view. */
    fun includePrivateInNetWorth(): Boolean =
        prefs.getBoolean(KEY_INCLUDE_PRIVATE, true)

    /** Updates the combined net-worth inclusion preference. */
    fun setIncludePrivateInNetWorth(include: Boolean) {
        prefs.edit().putBoolean(KEY_INCLUDE_PRIVATE, include).apply()
    }

    /** Whether partners share category/budget summaries rather than line items. */
    fun summaryOnlySharing(): Boolean =
        prefs.getBoolean(KEY_SUMMARY_ONLY, true)

    /** Updates the summary-only sharing default. */
    fun setSummaryOnlySharing(summaryOnly: Boolean) {
        prefs.edit().putBoolean(KEY_SUMMARY_ONLY, summaryOnly).apply()
    }

    private fun key(type: PrivacyEntityType, id: String) = "${type.name}:$id"

    private fun readMap(): Map<String, String> {
        val raw = prefs.getString(KEY_MAP, null) ?: return emptyMap()
        return runCatching {
            val json = JSONObject(raw)
            buildMap {
                json.keys().forEach { k -> put(k, json.getString(k)) }
            }
        }.getOrElse {
            Timber.w(it, "Failed to parse privacy map; starting empty")
            emptyMap()
        }
    }

    private fun writeMap(map: Map<String, String>) {
        val json = JSONObject()
        map.forEach { (k, v) -> json.put(k, v) }
        prefs.edit().putString(KEY_MAP, json.toString()).apply()
    }

    private companion object {
        const val KEY_MAP = "couple_privacy_map_v1"
        const val KEY_INCLUDE_PRIVATE = "couple_privacy_include_private_networth"
        const val KEY_SUMMARY_ONLY = "couple_privacy_summary_only"
    }
}
