// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.debt

import com.finance.android.ui.couple.Partner
import com.finance.models.types.Cents

/** How a debt is owned within the couple (#2153). */
enum class DebtOwnership { PERSONAL, SHARED, JOINTLY_FUNDED }

/** The two payoff strategies the planner can compare. */
enum class PayoffStrategy(val displayName: String, val rationale: String) {
    AVALANCHE("Avalanche", "Pay highest interest first — saves the most money"),
    SNOWBALL("Snowball", "Pay smallest balance first — quick wins for momentum"),
}

/**
 * A single debt owned by one or both partners.
 *
 * @property id Stable identifier.
 * @property name Display name (e.g. "Sam's student loan").
 * @property balance Current outstanding balance.
 * @property aprBasisPoints Annual percentage rate in basis points (e.g. 1999 = 19.99%).
 * @property minimumPayment Required monthly minimum payment.
 * @property ownership Personal / shared / jointly-funded classification.
 * @property owner The owning partner when [ownership] is [DebtOwnership.PERSONAL]; else null.
 */
data class CoupleDebt(
    val id: String,
    val name: String,
    val balance: Cents,
    val aprBasisPoints: Int,
    val minimumPayment: Cents,
    val ownership: DebtOwnership,
    val owner: Partner? = null,
) {
    init {
        require(name.isNotBlank()) { "Debt name cannot be blank" }
        require(balance.amount >= 0L) { "Debt balance cannot be negative" }
        require(aprBasisPoints >= 0) { "APR cannot be negative" }
        require(minimumPayment.amount >= 0L) { "Minimum payment cannot be negative" }
    }
}

/** Per-debt result within a computed [PayoffPlan]. */
data class DebtPayoffResult(
    val debtId: String,
    val name: String,
    val payoffMonth: Int,
    val interestPaid: Cents,
)

/**
 * The outcome of simulating one [PayoffStrategy].
 *
 * @property strategy The strategy simulated.
 * @property monthsToDebtFree Total months until every debt is cleared.
 * @property totalInterest Total interest paid across all debts.
 * @property totalPaid Principal + interest paid.
 * @property order Debts in the order they are paid off.
 * @property completed False when the plan could not clear debts within the horizon.
 */
data class PayoffPlan(
    val strategy: PayoffStrategy,
    val monthsToDebtFree: Int,
    val totalInterest: Cents,
    val totalPaid: Cents,
    val order: List<DebtPayoffResult>,
    val completed: Boolean,
)

/**
 * A comparison of both strategies plus a couple-friendly recommendation (#2153).
 */
data class PayoffComparison(
    val avalanche: PayoffPlan,
    val snowball: PayoffPlan,
    val recommended: PayoffStrategy,
    val interestSavedWithAvalanche: Cents,
    val monthsSavedWithAvalanche: Int,
) {
    /** Plain-language recommendation for the "simpler decision aid" mode. */
    val recommendationSummary: String
        get() = when (recommended) {
            PayoffStrategy.AVALANCHE ->
                "Avalanche clears your debt for the least money — a solid default " +
                    "while you balance the wedding and house savings."
            PayoffStrategy.SNOWBALL ->
                "Snowball costs about the same here but pays off a debt sooner, " +
                    "which can keep you both motivated."
        }
}

/**
 * Pure, deterministic joint debt payoff simulator (#2153).
 *
 * No Android or clock dependencies — every calculation uses [Cents] (Long) so
 * there is no floating-point drift on money, and it is straightforward to unit
 * test. Interest accrues monthly; extra payments cascade to the strategy's
 * priority debt once every minimum is covered.
 */
object DebtPayoffPlanner {

    /** Safety horizon so a mis-configured plan can't loop forever. */
    const val MAX_MONTHS = 600

    /**
     * Simulates paying off [debts] with a fixed [extraMonthlyPayment] on top of
     * all minimums, using the given [strategy].
     */
    fun simulate(
        debts: List<CoupleDebt>,
        extraMonthlyPayment: Cents,
        strategy: PayoffStrategy,
    ): PayoffPlan {
        val active = debts.filter { it.balance.amount > 0L }
        if (active.isEmpty()) {
            return PayoffPlan(strategy, 0, Cents.ZERO, Cents.ZERO, emptyList(), completed = true)
        }

        // Mutable simulation state keyed by debt id.
        val balances = active.associate { it.id to it.balance.amount }.toMutableMap()
        val interestByDebt = active.associate { it.id to 0L }.toMutableMap()
        val principalByDebt = active.associate { it.id to it.balance.amount }.toMutableMap()
        val payoffMonth = mutableMapOf<String, Int>()

        val priority = orderFor(active, strategy)
        var month = 0

        while (balances.values.any { it > 0L } && month < MAX_MONTHS) {
            month++

            // 1) Accrue interest on every outstanding debt.
            for (debt in active) {
                val bal = balances.getValue(debt.id)
                if (bal <= 0L) continue
                val interest = monthlyInterest(bal, debt.aprBasisPoints)
                balances[debt.id] = bal + interest
                interestByDebt[debt.id] = interestByDebt.getValue(debt.id) + interest
            }

            // 2) Budget = sum of minimums (for still-open debts) + extra.
            var pool = extraMonthlyPayment.amount
            for (debt in active) {
                if (balances.getValue(debt.id) <= 0L) continue
                val bal = balances.getValue(debt.id)
                val pay = minOf(debt.minimumPayment.amount, bal)
                balances[debt.id] = bal - pay
                pool += debt.minimumPayment.amount - pay // return unused minimum to the pool
                if (balances.getValue(debt.id) <= 0L) recordPayoff(payoffMonth, debt.id, month)
            }

            // 3) Cascade the remaining pool onto the priority debt(s).
            for (debt in priority) {
                if (pool <= 0L) break
                val bal = balances.getValue(debt.id)
                if (bal <= 0L) continue
                val pay = minOf(pool, bal)
                balances[debt.id] = bal - pay
                pool -= pay
                if (balances.getValue(debt.id) <= 0L) recordPayoff(payoffMonth, debt.id, month)
            }
        }

        val completed = balances.values.all { it <= 0L }
        val results = active
            .map {
                DebtPayoffResult(
                    debtId = it.id,
                    name = it.name,
                    payoffMonth = payoffMonth[it.id] ?: month,
                    interestPaid = Cents(interestByDebt.getValue(it.id)),
                )
            }
            .sortedBy { it.payoffMonth }
        val totalInterest = Cents(interestByDebt.values.sum())
        val totalPrincipal = principalByDebt.values.sum()
        return PayoffPlan(
            strategy = strategy,
            monthsToDebtFree = month,
            totalInterest = totalInterest,
            totalPaid = Cents(totalPrincipal + totalInterest.amount),
            order = results,
            completed = completed,
        )
    }

    /** Runs both strategies and recommends the cheaper (ties favour momentum). */
    fun compare(debts: List<CoupleDebt>, extraMonthlyPayment: Cents): PayoffComparison {
        val avalanche = simulate(debts, extraMonthlyPayment, PayoffStrategy.AVALANCHE)
        val snowball = simulate(debts, extraMonthlyPayment, PayoffStrategy.SNOWBALL)
        val interestSaved = Cents(snowball.totalInterest.amount - avalanche.totalInterest.amount)
        val monthsSaved = snowball.monthsToDebtFree - avalanche.monthsToDebtFree
        // Recommend avalanche only when it meaningfully saves money (> $50), else snowball's momentum.
        val recommended =
            if (interestSaved.amount > MEANINGFUL_SAVING_CENTS) PayoffStrategy.AVALANCHE
            else PayoffStrategy.SNOWBALL
        return PayoffComparison(
            avalanche = avalanche,
            snowball = snowball,
            recommended = recommended,
            interestSavedWithAvalanche = interestSaved,
            monthsSavedWithAvalanche = monthsSaved,
        )
    }

    /**
     * Estimates how much sooner the couple is debt-free if they redirect
     * [reallocated] per month away from another goal (e.g. wedding) into debt.
     * Returns months saved versus paying only minimums-plus-current-extra.
     */
    fun monthsSavedByAdding(
        debts: List<CoupleDebt>,
        currentExtra: Cents,
        reallocated: Cents,
        strategy: PayoffStrategy,
    ): Int {
        val base = simulate(debts, currentExtra, strategy)
        val boosted = simulate(debts, Cents(currentExtra.amount + reallocated.amount), strategy)
        return (base.monthsToDebtFree - boosted.monthsToDebtFree).coerceAtLeast(0)
    }

    private fun orderFor(debts: List<CoupleDebt>, strategy: PayoffStrategy): List<CoupleDebt> =
        when (strategy) {
            PayoffStrategy.AVALANCHE -> debts.sortedWith(
                compareByDescending<CoupleDebt> { it.aprBasisPoints }.thenBy { it.balance.amount },
            )
            PayoffStrategy.SNOWBALL -> debts.sortedWith(
                compareBy<CoupleDebt> { it.balance.amount }.thenByDescending { it.aprBasisPoints },
            )
        }

    /** Monthly interest in cents, rounded to the nearest cent. */
    private fun monthlyInterest(balanceCents: Long, aprBasisPoints: Int): Long {
        if (aprBasisPoints == 0 || balanceCents <= 0L) return 0L
        // balance * (aprBps / 10_000) / 12, rounded.
        val numerator = balanceCents.toDouble() * aprBasisPoints
        return Math.round(numerator / (BPS_DIVISOR * MONTHS_PER_YEAR))
    }

    private fun recordPayoff(map: MutableMap<String, Int>, id: String, month: Int) {
        map.putIfAbsent(id, month)
    }

    private const val BPS_DIVISOR = 10_000.0
    private const val MONTHS_PER_YEAR = 12.0
    private const val MEANINGFUL_SAVING_CENTS = 5_000L // $50
}
