// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

/**
 * IRS **Schedule C** expense presets for gig / self-employed workers (#2141).
 *
 * A parked driver logging a deductible expense one-handed does not want to think about
 * which Schedule C line an item belongs on. These presets encode the common gig
 * deductions and the Schedule C part/line they map to, so a single tap pre-fills the
 * quick-add note with an audit-friendly, IRS-aligned label.
 *
 * This is deterministic, framework-free data + logic so it is fully unit-testable on the
 * JVM. It intentionally does *not* provide tax advice or compute a deduction amount — it
 * only labels an expense and tags it for later export to a tax professional.
 */
object ScheduleCPresets {

    /** Tag applied to any transaction created through a Schedule C preset, for export. */
    const val SCHEDULE_C_TAG = "schedule-c"

    /**
     * The ordered set of gig-relevant Schedule C presets. Order is the display order in
     * the quick-add sheet (most common gig deductions first).
     */
    val presets: List<ScheduleCPreset> = listOf(
        ScheduleCPreset(
            key = "car_gas",
            label = "Gas / fuel",
            scheduleCLine = "Part II, Line 9 — Car and truck expenses",
            note = "Fuel (Schedule C L9)",
        ),
        ScheduleCPreset(
            key = "car_maintenance",
            label = "Car maintenance",
            scheduleCLine = "Part II, Line 9 — Car and truck expenses",
            note = "Vehicle maintenance/repair (Schedule C L9)",
        ),
        ScheduleCPreset(
            key = "tolls_parking",
            label = "Tolls & parking",
            scheduleCLine = "Part II, Line 27a — Other expenses",
            note = "Tolls/parking (Schedule C L27a)",
        ),
        ScheduleCPreset(
            key = "phone",
            label = "Phone & data",
            scheduleCLine = "Part V — Other expenses (business-use %)",
            note = "Phone/data business use (Schedule C Part V)",
        ),
        ScheduleCPreset(
            key = "supplies",
            label = "Supplies",
            scheduleCLine = "Part II, Line 22 — Supplies",
            note = "Supplies e.g. hot bags, chargers (Schedule C L22)",
        ),
        ScheduleCPreset(
            key = "commissions_fees",
            label = "Platform fees",
            scheduleCLine = "Part II, Line 10 — Commissions and fees",
            note = "Platform commission/fees (Schedule C L10)",
        ),
        ScheduleCPreset(
            key = "insurance",
            label = "Insurance",
            scheduleCLine = "Part II, Line 15 — Insurance (other than health)",
            note = "Business insurance (Schedule C L15)",
        ),
        ScheduleCPreset(
            key = "health_snacks",
            label = "Snacks/water for shift",
            scheduleCLine = "Part V — Other expenses (verify deductibility)",
            note = "Shift snacks/water — verify deductibility (Schedule C Part V)",
        ),
    )

    /** Look up a preset by its stable [ScheduleCPreset.key]. */
    fun byKey(key: String?): ScheduleCPreset? =
        presets.firstOrNull { it.key == key }

    /**
     * Builds the note text a preset contributes to a quick-add entry, optionally appending
     * a [platform] name so the deduction is tied to the gig that generated it.
     *
     * @return e.g. `"Fuel (Schedule C L9) · Uber"`.
     */
    fun noteFor(preset: ScheduleCPreset, platform: GigPlatform? = null): String {
        val base = preset.note
        return if (platform != null && platform != GigPlatform.OTHER) {
            "$base · ${platform.displayName}"
        } else {
            base
        }
    }
}

/**
 * A single Schedule C quick-add preset.
 *
 * @property key stable identifier used for persistence/telemetry (never localized).
 * @property label short button label shown in the quick-add sheet.
 * @property scheduleCLine the IRS Schedule C part/line this maps to (shown as a hint).
 * @property note the note text pre-filled onto the transaction.
 */
data class ScheduleCPreset(
    val key: String,
    val label: String,
    val scheduleCLine: String,
    val note: String,
)
