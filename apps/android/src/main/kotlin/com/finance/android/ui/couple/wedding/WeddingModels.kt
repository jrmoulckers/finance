// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.wedding

import android.content.SharedPreferences
import com.finance.models.types.Cents
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber

/** Wedding spending categories (#2145). */
enum class WeddingCategory(val displayName: String) {
    VENUE("Venue"),
    CATERING("Catering"),
    PHOTOGRAPHY("Photography"),
    ATTIRE("Attire"),
    FLOWERS("Flowers"),
    MUSIC("Music & entertainment"),
    RENTALS("Rentals"),
    INVITATIONS("Invitations"),
    OTHER("Other"),
}

/**
 * A single wedding vendor / line item with deposit tracking (#2145).
 *
 * @property id Stable identifier.
 * @property name Vendor or item name.
 * @property category Spending category.
 * @property flatBudget Fixed budgeted amount (used when [perGuestCost] is zero).
 * @property perGuestCost Per-guest cost; when > 0 the effective budget scales
 *   with the workspace guest count (e.g. catering, rentals, invitations).
 * @property paid Amount already paid via deposits / installments.
 * @property dueDateEpochDay Epoch day of the next payment due date, or null.
 */
data class WeddingVendor(
    val id: String,
    val name: String,
    val category: WeddingCategory,
    val flatBudget: Cents,
    val perGuestCost: Cents,
    val paid: Cents,
    val dueDateEpochDay: Long?,
) {
    init {
        require(name.isNotBlank()) { "Vendor name cannot be blank" }
        require(paid.amount >= 0L) { "Paid amount cannot be negative" }
    }

    /** Effective budget given a [guestCount] — scales per-guest items. */
    fun effectiveBudget(guestCount: Int): Cents =
        if (perGuestCost.amount > 0L) Cents(perGuestCost.amount * guestCount) else flatBudget

    /** Remaining balance to pay for a given [guestCount]. */
    fun remaining(guestCount: Int): Cents =
        Cents((effectiveBudget(guestCount).amount - paid.amount).coerceAtLeast(0L))

    /** Whether this item scales with guest count. */
    val isPerGuest: Boolean get() = perGuestCost.amount > 0L
}

/**
 * The full wedding workspace: overall target, guest count, and vendors.
 */
data class WeddingWorkspace(
    val targetBudget: Cents,
    val guestCount: Int,
    val vendors: List<WeddingVendor>,
) {
    companion object {
        /** Sensible starting point for the persona ($35k, 100 guests). */
        val DEFAULT = WeddingWorkspace(
            targetBudget = Cents(3_500_000L),
            guestCount = 100,
            vendors = emptyList(),
        )
    }
}

/**
 * On-device persistence for the [WeddingWorkspace] (#2145).
 *
 * Stored as JSON in encrypted [SharedPreferences]; no changes to the read-only
 * shared model package are required.
 */
class WeddingRepository(
    private val prefs: SharedPreferences,
) {

    /** Loads the workspace, falling back to the persona default on first run. */
    fun load(): WeddingWorkspace {
        val raw = prefs.getString(KEY, null) ?: return WeddingWorkspace.DEFAULT
        return runCatching {
            val json = JSONObject(raw)
            val vendorsArray = json.optJSONArray("vendors") ?: JSONArray()
            WeddingWorkspace(
                targetBudget = Cents(json.getLong("target")),
                guestCount = json.getInt("guests"),
                vendors = (0 until vendorsArray.length())
                    .mapNotNull { decodeVendor(vendorsArray.getJSONObject(it)) },
            )
        }.getOrElse {
            Timber.w(it, "Failed to parse wedding workspace; using default")
            WeddingWorkspace.DEFAULT
        }
    }

    /** Persists the whole [workspace]. */
    fun save(workspace: WeddingWorkspace) {
        val vendorsArray = JSONArray()
        workspace.vendors.forEach { vendorsArray.put(encodeVendor(it)) }
        val json = JSONObject().apply {
            put("target", workspace.targetBudget.amount)
            put("guests", workspace.guestCount)
            put("vendors", vendorsArray)
        }
        prefs.edit().putString(KEY, json.toString()).apply()
    }

    private fun encodeVendor(v: WeddingVendor): JSONObject = JSONObject().apply {
        put("id", v.id)
        put("name", v.name)
        put("category", v.category.name)
        put("flat", v.flatBudget.amount)
        put("perGuest", v.perGuestCost.amount)
        put("paid", v.paid.amount)
        put("due", v.dueDateEpochDay ?: JSONObject.NULL)
    }

    private fun decodeVendor(json: JSONObject): WeddingVendor? = runCatching {
        WeddingVendor(
            id = json.getString("id"),
            name = json.getString("name"),
            category = runCatching { WeddingCategory.valueOf(json.getString("category")) }
                .getOrDefault(WeddingCategory.OTHER),
            flatBudget = Cents(json.getLong("flat")),
            perGuestCost = Cents(json.getLong("perGuest")),
            paid = Cents(json.getLong("paid")),
            dueDateEpochDay = if (json.isNull("due")) null else json.getLong("due"),
        )
    }.getOrNull()

    private companion object {
        const val KEY = "couple_wedding_workspace_v1"
    }
}
