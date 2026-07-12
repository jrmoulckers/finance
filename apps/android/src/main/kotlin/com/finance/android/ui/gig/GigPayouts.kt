// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents

/**
 * Groups gig payouts by platform so dozens of small deposits become legible (#2133).
 *
 * Multi-app drivers receive many small income deposits across Uber, DoorDash, Instacart,
 * etc. A raw transaction list is noise; drivers want "how much did I make on each platform
 * this week?". This object classifies income transactions into [GigPlatform]s and rolls
 * them up. All logic is pure and deterministic for exhaustive JVM unit testing.
 *
 * Only [TransactionType.INCOME] transactions with a positive amount are considered — an
 * expense that happens to mention "Uber" (e.g. an Uber ride you paid for) is never counted
 * as a payout.
 */
object GigPayouts {

    /**
     * Groups the income [transactions] by the [GigPlatform] each was paid by.
     *
     * Transactions that match no known platform are grouped under [GigPlatform.OTHER] so no
     * income is silently dropped. Groups are returned sorted by total amount descending
     * (biggest earner first), with [GigPlatform.OTHER] always last regardless of size.
     */
    fun group(transactions: List<Transaction>): List<GigPayoutGroup> {
        val income = transactions.filter {
            it.type == TransactionType.INCOME && it.deletedAt == null && it.amount.amount > 0L
        }
        val grouped = income.groupBy { txn ->
            GigPlatform.fromPayee(txn.payee, txn.note) ?: GigPlatform.OTHER
        }
        return grouped.map { (platform, txns) ->
            GigPayoutGroup(
                platform = platform,
                totalCents = Cents(txns.sumOf { it.amount.amount }),
                payoutCount = txns.size,
                transactions = txns.sortedByDescending { it.date },
            )
        }.sortedWith(
            compareBy<GigPayoutGroup> { it.platform == GigPlatform.OTHER }
                .thenByDescending { it.totalCents.amount },
        )
    }

    /** Total gig income across all platforms (income only, positive amounts). */
    fun totalCents(transactions: List<Transaction>): Cents =
        Cents(
            transactions
                .filter { it.type == TransactionType.INCOME && it.deletedAt == null && it.amount.amount > 0L }
                .sumOf { it.amount.amount },
        )
}

/**
 * A roll-up of every payout from one gig platform.
 *
 * @property platform the platform these payouts came from.
 * @property totalCents summed payout amount (always positive).
 * @property payoutCount number of individual deposits grouped here.
 * @property transactions the underlying deposits, newest first.
 */
data class GigPayoutGroup(
    val platform: GigPlatform,
    val totalCents: Cents,
    val payoutCount: Int,
    val transactions: List<Transaction>,
)
