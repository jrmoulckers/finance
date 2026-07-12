// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.goals

import android.content.SharedPreferences
import com.finance.android.ui.couple.Partner
import com.finance.models.types.Cents
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber

/**
 * A single partner contribution toward a shared goal (#2147).
 *
 * @property id Stable identifier.
 * @property goalId The goal this contribution counts toward (a real [com.finance.models.Goal] id).
 * @property partner Which partner contributed.
 * @property amount Amount contributed.
 * @property epochDay Day of the contribution (epoch day) for ordering / history.
 * @property note Optional freeform note.
 */
data class GoalContribution(
    val id: String,
    val goalId: String,
    val partner: Partner,
    val amount: Cents,
    val epochDay: Long,
    val note: String = "",
) {
    init {
        require(amount.amount > 0L) { "Contribution amount must be positive" }
    }
}

/** A home-purchase milestone within the down-payment plan. */
data class HomeMilestone(
    val label: String,
    val target: Cents,
) {
    /** Whether [saved] has reached this milestone's [target]. */
    fun isReached(saved: Cents): Boolean = saved.amount >= target.amount
}

/**
 * On-device persistence for per-goal partner contributions (#2147).
 *
 * Contributions layer partner-specific effort on top of the shared
 * [com.finance.models.Goal] without modifying the read-only model package.
 */
class SharedContributionRepository(
    private val prefs: SharedPreferences,
) {

    /** All contributions across every goal. */
    fun all(): List<GoalContribution> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { decode(array.getJSONObject(it)) }
        }.getOrElse {
            Timber.w(it, "Failed to parse contributions; starting empty")
            emptyList()
        }
    }

    /** Contributions for a specific goal, newest first. */
    fun forGoal(goalId: String): List<GoalContribution> =
        all().filter { it.goalId == goalId }.sortedByDescending { it.epochDay }

    /** Adds a contribution and persists. */
    fun add(contribution: GoalContribution) {
        save(all() + contribution)
    }

    /** Removes a contribution by id. */
    fun delete(id: String) {
        save(all().filterNot { it.id == id })
    }

    private fun save(contributions: List<GoalContribution>) {
        val array = JSONArray()
        contributions.forEach { array.put(encode(it)) }
        prefs.edit().putString(KEY, array.toString()).apply()
    }

    private fun encode(c: GoalContribution): JSONObject = JSONObject().apply {
        put("id", c.id)
        put("goalId", c.goalId)
        put("partner", c.partner.name)
        put("amount", c.amount.amount)
        put("epochDay", c.epochDay)
        put("note", c.note)
    }

    private fun decode(json: JSONObject): GoalContribution? = runCatching {
        GoalContribution(
            id = json.getString("id"),
            goalId = json.getString("goalId"),
            partner = Partner.valueOf(json.getString("partner")),
            amount = Cents(json.getLong("amount")),
            epochDay = json.getLong("epochDay"),
            note = json.optString("note", ""),
        )
    }.getOrNull()

    private companion object {
        const val KEY = "couple_goal_contributions_v1"
    }
}
