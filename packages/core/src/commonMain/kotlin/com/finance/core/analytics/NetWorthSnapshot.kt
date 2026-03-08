// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate

/**
 * Point-in-time snapshot of net worth, broken down into assets and liabilities.
 *
 * [netWorth] is always `totalAssets - totalLiabilities`.
 */
data class NetWorthSnapshot(
    val date: LocalDate,
    val totalAssets: Cents,
    val totalLiabilities: Cents,
    val netWorth: Cents,
) {
    init {
        require(totalAssets.amount >= 0) { "Total assets cannot be negative" }
        require(totalLiabilities.amount >= 0) { "Total liabilities cannot be negative" }
    }
}
