// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import com.finance.desktop.narration.NarrationText.capitalizeFirst
import com.finance.desktop.narration.NarrationText.formatCents
import com.finance.desktop.narration.NarrationText.formatWholeDollars
import com.finance.desktop.narration.NarrationText.monthDayOrdinal
import com.finance.desktop.narration.NarrationText.monthDayVisible
import com.finance.desktop.narration.NarrationText.percentInt
import com.finance.desktop.narration.NarrationText.spellCents
import com.finance.desktop.narration.NarrationText.spellInt
import com.finance.desktop.narration.NarrationText.spellWholeDollars

// =============================================================================
// TemplateNarrationGenerator — the deterministic, golden-tested narrator
// =============================================================================
//
// Implements the template layer from `docs/windows/ml-narration-pipeline-design.md`
// (§4 stage 2, §5, §9). Given an already-computed [FinancialStateSnapshot], it
// produces a [Narration] in either [NarrationMode] with no model, no network,
// and no I/O — so the output is fully reproducible and golden-tested in CI.
//
// Tone is non-alarmist (design §3, §5.4): budgets are "fully used" not
// "overspent"; low-confidence claims are hedged ("early signal") and never
// asserted as fact. Uncertainty is always surfaced: in detailed mode a
// low-confidence source produces an explicit `uncertainty` segment.
//
// Selection / ordering (reproduces the §9 worked example):
//   headline  = the most time-relevant bill + cash on hand (a "summary").
//   material  = budgets needing attention, then the net-worth trend, then goals.
//   concise   = headline + the top two material segments (hedging stays inline).
//   detailed  = headline + all material segments + one appended `uncertainty`
//               segment when any included source is low confidence.
class TemplateNarrationGenerator {

    /** Generates a [Narration] for the [snapshot] in the requested [mode]. */
    fun generate(
        snapshot: FinancialStateSnapshot,
        mode: NarrationMode,
    ): Narration {
        val headline = buildHeadline(snapshot)
        val material = buildMaterialSegments(snapshot)

        val segments =
            when (mode) {
                NarrationMode.CONCISE -> material.take(CONCISE_SEGMENT_LIMIT)
                NarrationMode.DETAILED -> material + buildUncertaintySegments(snapshot, material)
            }

        return Narration(
            mode = mode,
            schemaVersion = snapshot.schemaVersion,
            locale = snapshot.locale,
            headline = headline,
            segments = segments,
            provenance = TEMPLATE_PROVENANCE,
        )
    }

    // -- Headline -----------------------------------------------------------

    private fun buildHeadline(snapshot: FinancialStateSnapshot): NarrationSegment {
        val bill = mostUrgentBill(snapshot.upcomingBills)
        return if (bill != null) {
            billAndCashHeadline(bill, snapshot.cashOnHand)
        } else {
            netWorthHeadline(snapshot)
        }
    }

    private fun mostUrgentBill(bills: List<BillState>): BillState? =
        bills.minWithOrNull(
            compareBy<BillState> { statusPriority(it.status) }.thenBy { it.dueDateIso },
        )

    private fun statusPriority(status: BillStatus): Int =
        when (status) {
            BillStatus.PAST_DUE -> 0
            BillStatus.DUE -> 1
            BillStatus.SCHEDULED -> 2
        }

    private fun billAndCashHeadline(
        bill: BillState,
        cash: NarrationMoney,
    ): NarrationSegment {
        val text =
            "Your ${bill.name} bill of ${formatCents(bill.amountCents)} is due " +
                "${monthDayVisible(bill.dueDateIso)}, and you have " +
                "${formatCents(cash.cents)} on hand."
        val screenReader =
            "Your ${bill.name} bill of ${spellCents(bill.amountCents)} is due " +
                "${monthDayOrdinal(bill.dueDateIso)}, and you have " +
                "${spellCents(cash.cents)} on hand."
        return NarrationSegment(
            id = "summary",
            kind = SegmentKind.SUMMARY,
            text = text,
            confidence = RULE_HIGH,
            a11y =
                A11yMetadata(
                    screenReaderText = screenReader,
                    ariaLive = AriaLive.POLITE,
                    role = A11yRole.STATUS,
                    headingLevel = HEADLINE_HEADING_LEVEL,
                ),
            sourceRefs = listOf("bill.${bill.name.lowercase()}", "cashOnHand"),
        )
    }

    private fun netWorthHeadline(snapshot: FinancialStateSnapshot): NarrationSegment {
        val netWorthDollars = snapshot.netWorth.cents / CENTS_PER_DOLLAR
        val text =
            "Your net worth is ${formatWholeDollars(netWorthDollars)}, with " +
                "${formatCents(snapshot.cashOnHand.cents)} on hand."
        val screenReader =
            "Your net worth is ${spellWholeDollars(netWorthDollars)}, with " +
                "${spellCents(snapshot.cashOnHand.cents)} on hand."
        return NarrationSegment(
            id = "summary",
            kind = SegmentKind.SUMMARY,
            text = text,
            confidence = RULE_HIGH,
            a11y =
                A11yMetadata(
                    screenReaderText = screenReader,
                    ariaLive = AriaLive.POLITE,
                    role = A11yRole.STATUS,
                    headingLevel = HEADLINE_HEADING_LEVEL,
                ),
            sourceRefs = listOf("netWorth", "cashOnHand"),
        )
    }

    // -- Material segments --------------------------------------------------

    private fun buildMaterialSegments(snapshot: FinancialStateSnapshot): List<NarrationSegment> {
        val segments = mutableListOf<NarrationSegment>()
        snapshot.budgets
            .filter { it.percentUsed >= BUDGET_ATTENTION_THRESHOLD }
            .sortedByDescending { it.percentUsed }
            .forEach { segments.add(budgetSegment(it)) }
        segments.add(trendSegment(snapshot.netWorthTrend))
        snapshot.goals.forEach { segments.add(goalSegment(it)) }
        return segments
    }

    private fun budgetSegment(budget: BudgetState): NarrationSegment {
        val stateWord =
            when {
                budget.percentUsed >= 1.0 -> "fully used"
                budget.percentUsed >= NEARLY_USED_THRESHOLD -> "nearly used"
                else -> "${percentInt(budget.percentUsed)} percent used"
            }
        val text =
            "Your ${budget.categoryName} plan is $stateWord — " +
                "${formatCents(budget.spentCents)} of the " +
                "${formatCents(budget.plannedCents)} you planned. " +
                "Want to adjust the plan or move funds?"
        val screenReader =
            "Your ${budget.categoryName} plan is $stateWord. " +
                "${capitalizeFirst(spellCents(budget.spentCents))} of the " +
                "${spellCents(budget.plannedCents)} you planned. " +
                "Want to adjust the plan or move funds?"
        return NarrationSegment(
            id = "budget.${budget.categoryName.lowercase()}",
            kind = SegmentKind.BUDGET,
            text = text,
            confidence = budget.confidence,
            a11y =
                A11yMetadata(
                    screenReaderText = screenReader,
                    ariaLive = AriaLive.POLITE,
                    role = A11yRole.NOTE,
                    headingLevel = null,
                ),
            sourceRefs = listOf("budget.${budget.categoryName.lowercase()}"),
        )
    }

    private fun trendSegment(trend: Trend): NarrationSegment {
        val magnitude = magnitudeWord(trend.changePct)
        val direction = directionWord(trend.direction)
        val days = trend.periodDays
        val (text, screenReader) =
            when (trend.confidence.level) {
                ConfidenceLevel.LOW -> {
                    val body =
                        "your net worth looks $magnitude $direction over the last"
                    val tail = " This may change as more history builds."
                    val visible =
                        "Early signal: $body $days days.$tail"
                    val spoken =
                        "Early signal. ${capitalizeFirst(body)} ${spellInt(days.toLong())} days.$tail"
                    visible to spoken
                }
                ConfidenceLevel.MEDIUM -> {
                    val visible =
                        "Based on recent activity, your net worth looks $magnitude $direction " +
                            "over the last $days days."
                    val spoken =
                        "Based on recent activity, your net worth looks $magnitude $direction " +
                            "over the last ${spellInt(days.toLong())} days."
                    visible to spoken
                }
                ConfidenceLevel.HIGH -> {
                    val visible =
                        "Your net worth is $magnitude $direction over the last $days days."
                    val spoken =
                        "Your net worth is $magnitude $direction over the last " +
                            "${spellInt(days.toLong())} days."
                    visible to spoken
                }
            }
        return NarrationSegment(
            id = "trend",
            kind = SegmentKind.TREND,
            text = text,
            confidence = trend.confidence,
            a11y =
                A11yMetadata(
                    screenReaderText = screenReader,
                    ariaLive = AriaLive.POLITE,
                    role = A11yRole.NOTE,
                    headingLevel = null,
                ),
            sourceRefs = listOf("netWorthTrend"),
        )
    }

    private fun goalSegment(goal: GoalState): NarrationSegment {
        val savedDollars = goal.currentCents / CENTS_PER_DOLLAR
        val pct = percentInt(goal.percentComplete)
        val months = goal.monthsToTarget
        val pace =
            if (months != null) {
                " — $pct% there, on track for about $months months at your recent pace."
            } else {
                " — $pct% there so far."
            }
        val spokenPace =
            if (months != null) {
                "$pct percent there, on track for about " +
                    "${spellInt(months.toLong())} months at your recent pace."
            } else {
                "$pct percent there so far."
            }
        val text = "You've saved ${formatWholeDollars(savedDollars)} toward your ${goal.name}$pace"
        val screenReader =
            "You've saved ${spellWholeDollars(savedDollars)} toward your ${goal.name}. $spokenPace"
        return NarrationSegment(
            id = "goal.${goal.name.lowercase().replace(' ', '.')}",
            kind = SegmentKind.GOAL,
            text = text,
            confidence = goal.confidence,
            a11y =
                A11yMetadata(
                    screenReaderText = screenReader,
                    ariaLive = AriaLive.POLITE,
                    role = A11yRole.NOTE,
                    headingLevel = null,
                ),
            sourceRefs = listOf("goal.${goal.name.lowercase().replace(' ', '.')}"),
        )
    }

    // -- Uncertainty (detailed only) ----------------------------------------

    private fun buildUncertaintySegments(
        snapshot: FinancialStateSnapshot,
        material: List<NarrationSegment>,
    ): List<NarrationSegment> {
        val trendIsLow = snapshot.netWorthTrend.confidence.level == ConfidenceLevel.LOW
        val trendRendered = material.any { it.id == "trend" }
        if (!trendIsLow || !trendRendered) return emptyList()
        val days = snapshot.netWorthTrend.periodDays
        val text =
            "One note on confidence: the net-worth trend is based on a short, " +
                "$days-day window, so treat it as a rough early signal rather than a " +
                "firm direction."
        val screenReader =
            "One note on confidence. The net-worth trend is based on a short, " +
                "${spellInt(days.toLong())} day window, so treat it as a rough early signal " +
                "rather than a firm direction."
        return listOf(
            NarrationSegment(
                id = "uncertainty",
                kind = SegmentKind.UNCERTAINTY,
                text = text,
                confidence = snapshot.netWorthTrend.confidence,
                a11y =
                    A11yMetadata(
                        screenReaderText = screenReader,
                        ariaLive = AriaLive.POLITE,
                        role = A11yRole.NOTE,
                        headingLevel = null,
                    ),
                sourceRefs = listOf("netWorthTrend"),
            ),
        )
    }

    // -- Word helpers -------------------------------------------------------

    private fun magnitudeWord(changePct: Double): String {
        val magnitude = kotlin.math.abs(changePct)
        return when {
            magnitude < SLIGHT_THRESHOLD -> "slightly"
            magnitude < MODERATE_THRESHOLD -> "moderately"
            else -> "notably"
        }
    }

    private fun directionWord(direction: TrendDirection): String =
        when (direction) {
            TrendDirection.UP -> "higher"
            TrendDirection.DOWN -> "lower"
            TrendDirection.FLAT -> "about the same"
        }

    private companion object {
        const val CONCISE_SEGMENT_LIMIT = 2
        const val HEADLINE_HEADING_LEVEL = 2
        const val CENTS_PER_DOLLAR = 100L
        const val BUDGET_ATTENTION_THRESHOLD = 0.85
        const val NEARLY_USED_THRESHOLD = 0.9
        const val SLIGHT_THRESHOLD = 0.02
        const val MODERATE_THRESHOLD = 0.05

        val RULE_HIGH = Confidence(ConfidenceLevel.HIGH, 0.95, ConfidenceBasis.RULE)
        val TEMPLATE_PROVENANCE =
            Provenance(
                generator = GeneratorKind.TEMPLATE,
                deterministic = true,
                modelId = null,
                modelVersion = null,
                runtime = null,
            )
    }
}
