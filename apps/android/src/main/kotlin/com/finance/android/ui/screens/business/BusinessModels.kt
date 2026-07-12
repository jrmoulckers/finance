// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business

import com.finance.android.ui.screens.business.pnl.PnlBucket
import com.finance.models.types.Cents

/**
 * A first-class small-business expense bucket used across the P&L (#2184),
 * cash forecast (#2185), and receipt workflow (#2183).
 *
 * These map spending into the categories a food-truck owner actually reasons
 * about instead of generic personal-finance buckets.
 */
enum class BusinessCategory(
    val id: String,
    val label: String,
    /** Which side of a gross/net margin calculation this bucket contributes to. */
    val pnlBucket: PnlBucket,
    val defaultScope: MoneyScope,
) {
    COGS("cogs", "Ingredients / COGS", PnlBucket.COGS, MoneyScope.BUSINESS),
    INVENTORY("inventory", "Inventory / stock", PnlBucket.COGS, MoneyScope.BUSINESS),
    SUPPLIES("supplies", "Paper goods & supplies", PnlBucket.COGS, MoneyScope.BUSINESS),
    LABOR("labor", "Labor / payroll", PnlBucket.LABOR, MoneyScope.BUSINESS),
    PAYROLL_TAX("payroll_tax", "Payroll taxes", PnlBucket.LABOR, MoneyScope.BUSINESS),
    FUEL("fuel", "Fuel & propane", PnlBucket.OVERHEAD, MoneyScope.BUSINESS),
    COMMISSARY_RENT("commissary_rent", "Commissary rent", PnlBucket.OVERHEAD, MoneyScope.BUSINESS),
    PERMITS("permits", "Permits & licenses", PnlBucket.OVERHEAD, MoneyScope.BUSINESS),
    TRUCK_MAINTENANCE("truck_maintenance", "Truck maintenance", PnlBucket.OVERHEAD, MoneyScope.BUSINESS),
    SALES("sales", "Sales revenue", PnlBucket.REVENUE, MoneyScope.BUSINESS),
    OTHER_INCOME("other_income", "Other income", PnlBucket.REVENUE, MoneyScope.BUSINESS),
    ;

    companion object {
        /** The default business categories seeded for a new food-truck user (#2182). */
        fun defaults(): List<BusinessCategory> = entries.toList()

        fun fromId(id: String): BusinessCategory? = entries.firstOrNull { it.id == id }
    }
}

/**
 * A transaction annotated with its [MoneyScope] and, when it is a business
 * expense, the [BusinessCategory] bucket it rolls up into.
 *
 * @property needsReview `true` when the app could not confidently classify the
 *   scope (e.g. a card shared between home and truck), so it is flagged for
 *   later cleanup (#2182).
 */
data class ScopedTransaction(
    val id: String,
    val payee: String,
    val amount: Cents,
    /** `true` for money coming in, `false` for an expense. */
    val isIncome: Boolean,
    val scope: MoneyScope,
    val businessCategory: BusinessCategory? = null,
    val dayOffset: Int = 0,
    val needsReview: Boolean = false,
)
