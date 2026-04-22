// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.tips

import com.finance.models.*
import com.finance.models.types.*

/**
 * Snapshot of the user's financial state consumed by the tips engine.
 *
 * By collecting all inputs into a single immutable data class, the engine
 * remains a pure function: same input → same tips. This makes it trivially
 * testable and eliminates hidden dependencies.
 */
data class FinancialContext(
    /** All active (non-deleted) transactions, most-recent first. */
    val transactions: List<Transaction>,
    /** All active budgets. */
    val budgets: List<Budget>,
    /** All active goals. */
    val goals: List<Goal>,
    /** All active accounts. */
    val accounts: List<Account>,
    /** All categories (used for name lookups in tip text). */
    val categories: List<Category>,
)
