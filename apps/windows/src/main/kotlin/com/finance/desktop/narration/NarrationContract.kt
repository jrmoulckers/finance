// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// =============================================================================
// Narration Contract — deterministic, on-device, screen-reader-first
// =============================================================================
//
// This file implements the narration contract specified in
// `docs/windows/ml-narration-pipeline-design.md` (§5). It is the stable
// interface between an already-computed financial state and the plain-language,
// Narrator-friendly summaries surfaced on the Windows desktop client.
//
// IMPORTANT: this is the DETERMINISTIC TEMPLATE layer only. There is no model,
// no network, and no I/O on this path — narration is pure code over a derived
// snapshot. The optional ML enhancement (ONNX/DirectML) and on-hardware Narrator
// validation are tracked as follow-ups in the design doc (§11) and the
// validation checklist (`docs/windows/chart-narration-validation-checklist.md`).
//
// The design places the contract in shared `commonMain` (owned by
// @kmp-engineer). Until that lands, this Windows-local copy keeps the Windows
// chart-narration slice (#2707) unblocked while mirroring the documented shapes
// so the eventual shared types can drop in.

/** Output verbosity. Both modes derive from the same snapshot + generator. */
@Serializable
enum class NarrationMode {
    @SerialName("concise")
    CONCISE,

    @SerialName("detailed")
    DETAILED,
}

/** The kind of fact a [NarrationSegment] conveys (drives ordering and role). */
@Serializable
enum class SegmentKind {
    @SerialName("summary")
    SUMMARY,

    @SerialName("trend")
    TREND,

    @SerialName("budget")
    BUDGET,

    @SerialName("bill")
    BILL,

    @SerialName("goal")
    GOAL,

    @SerialName("insight")
    INSIGHT,

    @SerialName("uncertainty")
    UNCERTAINTY,
}

/**
 * UI Automation live-region politeness. Routine financial state is [POLITE];
 * [ASSERTIVE] is reserved for time-critical, user-initiated results only and is
 * never used for passive state (see design §5.2).
 */
@Serializable
enum class AriaLive {
    @SerialName("off")
    OFF,

    @SerialName("polite")
    POLITE,

    @SerialName("assertive")
    ASSERTIVE,
}

/** Accessibility role announced by Narrator / exposed to UI Automation. */
@Serializable
enum class A11yRole {
    @SerialName("status")
    STATUS,

    @SerialName("heading")
    HEADING,

    @SerialName("note")
    NOTE,
}

/** Confidence band for a claim. Every segment carries one. */
@Serializable
enum class ConfidenceLevel {
    @SerialName("high")
    HIGH,

    @SerialName("medium")
    MEDIUM,

    @SerialName("low")
    LOW,
}

/** What a [Confidence] is grounded in (sample size, model score, recency, …). */
@Serializable
enum class ConfidenceBasis {
    @SerialName("sample_size")
    SAMPLE_SIZE,

    @SerialName("model_score")
    MODEL_SCORE,

    @SerialName("recency")
    RECENCY,

    @SerialName("rule")
    RULE,

    @SerialName("blended")
    BLENDED,
}

/** Direction of a [Trend] over its window. */
@Serializable
enum class TrendDirection {
    @SerialName("up")
    UP,

    @SerialName("down")
    DOWN,

    @SerialName("flat")
    FLAT,
}

/** Lifecycle status of an upcoming bill. */
@Serializable
enum class BillStatus {
    @SerialName("scheduled")
    SCHEDULED,

    @SerialName("due")
    DUE,

    @SerialName("past_due")
    PAST_DUE,
}

/** Budget cadence. */
@Serializable
enum class BudgetPeriod {
    @SerialName("monthly")
    MONTHLY,

    @SerialName("weekly")
    WEEKLY,

    @SerialName("biweekly")
    BIWEEKLY,

    @SerialName("yearly")
    YEARLY,
}

/** Which generator produced the narration. */
@Serializable
enum class GeneratorKind {
    @SerialName("template")
    TEMPLATE,

    @SerialName("ml_assisted")
    ML_ASSISTED,
}

/** Money is always integer cents plus an ISO 4217 code — never floating point. */
@Serializable
data class NarrationMoney(
    val cents: Long,
    val currency: String,
)

/** A stated confidence band with a basis. */
@Serializable
data class Confidence(
    val level: ConfidenceLevel,
    val score: Double,
    val basis: ConfidenceBasis,
)

/** A pre-computed directional change over a window. */
@Serializable
data class Trend(
    val direction: TrendDirection,
    val changeCents: Long,
    val changePct: Double,
    val periodDays: Int,
    val confidence: Confidence,
)

/** A pre-computed budget position. */
@Serializable
data class BudgetState(
    val categoryName: String,
    val plannedCents: Long,
    val spentCents: Long,
    val period: BudgetPeriod,
    val isRollover: Boolean,
    val percentUsed: Double,
    val confidence: Confidence,
)

/** An upcoming bill. */
@Serializable
data class BillState(
    val name: String,
    val amountCents: Long,
    val dueDateIso: String,
    val status: BillStatus,
)

/** A savings goal position. */
@Serializable
data class GoalState(
    val name: String,
    val targetCents: Long,
    val currentCents: Long,
    val percentComplete: Double,
    val monthsToTarget: Int? = null,
    val confidence: Confidence,
)

/** A pre-ranked insight (rendered when material). */
@Serializable
data class InsightInput(
    val id: String,
    val kind: String,
    val salience: Double,
    val payload: Map<String, String> = emptyMap(),
)

/** A notable, pre-classified delta (never a raw transaction). */
@Serializable
data class Signal(
    val id: String,
    val kind: String,
    val observedCents: Long,
    val expectedLowCents: Long,
    val expectedHighCents: Long,
    val confidence: Confidence,
)

/**
 * Input to the narrator: a derived, already-computed projection of financial
 * state. The narrator performs no financial math — it consumes engine outputs.
 */
@Serializable
data class FinancialStateSnapshot(
    val schemaVersion: Int,
    val asOf: String,
    val locale: String,
    val currency: String,
    val netWorth: NarrationMoney,
    val cashOnHand: NarrationMoney,
    val safeToSpend: NarrationMoney? = null,
    val netWorthTrend: Trend,
    val budgets: List<BudgetState> = emptyList(),
    val upcomingBills: List<BillState> = emptyList(),
    val goals: List<GoalState> = emptyList(),
    val insights: List<InsightInput> = emptyList(),
    val signals: List<Signal> = emptyList(),
)

/** Narrator / UI Automation metadata attached to a [NarrationSegment]. */
@Serializable
data class A11yMetadata(
    val screenReaderText: String,
    val ariaLive: AriaLive = AriaLive.POLITE,
    val role: A11yRole,
    val headingLevel: Int? = null,
)

/** One unit of narration: visible prose plus its accessibility projection. */
@Serializable
data class NarrationSegment(
    val id: String,
    val kind: SegmentKind,
    val text: String,
    val confidence: Confidence,
    val a11y: A11yMetadata,
    val sourceRefs: List<String> = emptyList(),
)

/** How the narration was produced (template vs. ML-assisted). */
@Serializable
data class Provenance(
    val generator: GeneratorKind = GeneratorKind.TEMPLATE,
    val deterministic: Boolean = true,
    val modelId: String? = null,
    val modelVersion: String? = null,
    val runtime: String? = null,
)

/** A complete narration: exactly one [headline] plus ordered [segments]. */
@Serializable
data class Narration(
    val mode: NarrationMode,
    val schemaVersion: Int,
    val locale: String,
    val headline: NarrationSegment,
    val segments: List<NarrationSegment> = emptyList(),
    val provenance: Provenance = Provenance(),
)

/**
 * Joins the [headline] and all [segments] screen-reader text into a single
 * announcement string — the text a Narrator/UI Automation summary node speaks.
 */
fun Narration.screenReaderText(): String =
    buildString {
        append(headline.a11y.screenReaderText)
        segments.forEach { segment ->
            append(' ')
            append(segment.a11y.screenReaderText)
        }
    }.trim()

/** Joins the visible prose of the [headline] and all [segments]. */
fun Narration.plainText(): String =
    buildString {
        append(headline.text)
        segments.forEach { segment ->
            append(' ')
            append(segment.text)
        }
    }.trim()
