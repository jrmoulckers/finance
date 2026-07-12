// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.debt

import android.content.SharedPreferences
import com.finance.android.ui.couple.Partner
import com.finance.models.types.Cents
import org.json.JSONArray
import org.json.JSONObject
import timber.log.Timber

/**
 * On-device persistence for the couple's tracked debts (#2153).
 *
 * Debts are stored as a JSON array in encrypted [SharedPreferences]. This keeps
 * the joint planner fully functional without requiring changes to the shared
 * [com.finance.models] package (which is read-only for this work).
 */
class CoupleDebtRepository(
    private val prefs: SharedPreferences,
) {

    /** Loads all tracked debts, or an empty list on first run / parse failure. */
    fun load(): List<CoupleDebt> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { i -> decode(array.getJSONObject(i)) }
        }.getOrElse {
            Timber.w(it, "Failed to parse couple debts; starting empty")
            emptyList()
        }
    }

    /** Adds or replaces a debt (matched by id) and persists. */
    fun upsert(debt: CoupleDebt) {
        val updated = load().filterNot { it.id == debt.id } + debt
        save(updated)
    }

    /** Removes a debt by id. */
    fun delete(id: String) {
        save(load().filterNot { it.id == id })
    }

    private fun save(debts: List<CoupleDebt>) {
        val array = JSONArray()
        debts.forEach { array.put(encode(it)) }
        prefs.edit().putString(KEY, array.toString()).apply()
    }

    private fun encode(debt: CoupleDebt): JSONObject = JSONObject().apply {
        put("id", debt.id)
        put("name", debt.name)
        put("balance", debt.balance.amount)
        put("apr", debt.aprBasisPoints)
        put("min", debt.minimumPayment.amount)
        put("ownership", debt.ownership.name)
        put("owner", debt.owner?.name ?: JSONObject.NULL)
    }

    private fun decode(json: JSONObject): CoupleDebt? = runCatching {
        CoupleDebt(
            id = json.getString("id"),
            name = json.getString("name"),
            balance = Cents(json.getLong("balance")),
            aprBasisPoints = json.getInt("apr"),
            minimumPayment = Cents(json.getLong("min")),
            ownership = DebtOwnership.valueOf(json.getString("ownership")),
            owner = json.optString("owner", "").takeIf { it.isNotBlank() }
                ?.let { runCatching { Partner.valueOf(it) }.getOrNull() },
        )
    }.getOrNull()

    private companion object {
        const val KEY = "couple_debts_v1" // gitleaks:allow (prefs key)
    }
}
