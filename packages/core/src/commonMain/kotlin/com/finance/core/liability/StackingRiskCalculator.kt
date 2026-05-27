// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.liability

import com.finance.models.LiabilityInstallment
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlinx.serialization.Serializable

/** Configurable BNPL stacking-risk thresholds. */
@Serializable
data class StackingRiskConfig(
    val exposureThreshold: Cents = DEFAULT_EXPOSURE_THRESHOLD,
    val lookAheadDays: Int = DEFAULT_LOOK_AHEAD_DAYS,
    val collisionWindowDays: Int = DEFAULT_COLLISION_WINDOW_DAYS,
    val minimumOverlappingLiabilities: Int = DEFAULT_MINIMUM_OVERLAPPING_LIABILITIES,
) {
    init {
        require(exposureThreshold.amount > 0L) { "Exposure threshold must be positive" }
        require(lookAheadDays > 0) { "Look-ahead days must be positive" }
        require(collisionWindowDays > 0) { "Collision window days must be positive" }
        require(minimumOverlappingLiabilities > 1) { "Overlapping liability minimum must be greater than one" }
    }

    companion object {
        val DEFAULT_EXPOSURE_THRESHOLD = Cents(50_000L)
        const val DEFAULT_LOOK_AHEAD_DAYS = 30
        const val DEFAULT_COLLISION_WINDOW_DAYS = 7
        const val DEFAULT_MINIMUM_OVERLAPPING_LIABILITIES = 2
    }
}

/** Severity of a BNPL stacking-risk alert. */
@Serializable
enum class StackingRiskSeverity { NONE, LOW, MEDIUM, HIGH }

/** Pure result of evaluating unpaid installments for stacking risk. */
@Serializable
data class StackingRiskResult(
    val severity: StackingRiskSeverity,
    val hasRisk: Boolean,
    val totalExposure: Cents,
    val threshold: Cents,
    val dueInstallmentCount: Int,
    val overlappingLiabilityCount: Int,
    val windowStart: LocalDate?,
    val windowEnd: LocalDate?,
    val windowExposure: Cents,
    val liabilityIds: Set<SyncId>,
) {
    companion object {
        fun none(threshold: Cents): StackingRiskResult = StackingRiskResult(
            severity = StackingRiskSeverity.NONE,
            hasRisk = false,
            totalExposure = Cents.ZERO,
            threshold = threshold,
            dueInstallmentCount = 0,
            overlappingLiabilityCount = 0,
            windowStart = null,
            windowEnd = null,
            windowExposure = Cents.ZERO,
            liabilityIds = emptySet(),
        )
    }
}

/** Edge-first BNPL stacking-risk computation. */
object StackingRiskCalculator {
    /** Evaluate whether due BNPL installments stack up enough to alert the user. */
    fun evaluate(
        installments: List<LiabilityInstallment>,
        referenceDate: LocalDate,
        config: StackingRiskConfig = StackingRiskConfig(),
    ): StackingRiskResult {
        val horizon = referenceDate.plus(config.lookAheadDays, DateTimeUnit.DAY)
        val upcoming = installments
            .filter { it.isOutstanding && it.dueDate >= referenceDate && it.dueDate <= horizon }
            .sortedBy { it.dueDate }

        if (upcoming.isEmpty()) return StackingRiskResult.none(config.exposureThreshold)

        val totalExposure = Cents(upcoming.sumOf { it.amount.amount })
        val highestWindow = highestCollisionWindow(upcoming, config.collisionWindowDays)
        val crossesExposureThreshold = totalExposure.amount >= config.exposureThreshold.amount
        val hasCollision = highestWindow.liabilityIds.size >= config.minimumOverlappingLiabilities
        val hasRisk = crossesExposureThreshold || hasCollision

        val severity = when {
            crossesExposureThreshold && hasCollision -> StackingRiskSeverity.HIGH
            totalExposure.amount >= config.exposureThreshold.amount * 2 -> StackingRiskSeverity.HIGH
            crossesExposureThreshold -> StackingRiskSeverity.MEDIUM
            hasCollision -> StackingRiskSeverity.MEDIUM
            upcoming.size > 1 -> StackingRiskSeverity.LOW
            else -> StackingRiskSeverity.NONE
        }

        return StackingRiskResult(
            severity = severity,
            hasRisk = hasRisk,
            totalExposure = totalExposure,
            threshold = config.exposureThreshold,
            dueInstallmentCount = upcoming.size,
            overlappingLiabilityCount = highestWindow.liabilityIds.size,
            windowStart = highestWindow.start,
            windowEnd = highestWindow.end,
            windowExposure = highestWindow.exposure,
            liabilityIds = upcoming.map { it.liabilityId }.toSet(),
        )
    }

    private fun highestCollisionWindow(
        installments: List<LiabilityInstallment>,
        collisionWindowDays: Int,
    ): CollisionWindow {
        return installments.map { anchor ->
            val end = anchor.dueDate.plus(collisionWindowDays, DateTimeUnit.DAY)
            val inWindow = installments.filter { it.dueDate >= anchor.dueDate && it.dueDate <= end }
            CollisionWindow(
                start = anchor.dueDate,
                end = end,
                exposure = Cents(inWindow.sumOf { it.amount.amount }),
                liabilityIds = inWindow.map { it.liabilityId }.toSet(),
            )
        }.maxWith(compareBy<CollisionWindow> { it.liabilityIds.size }.thenBy { it.exposure.amount })
    }

    private data class CollisionWindow(
        val start: LocalDate,
        val end: LocalDate,
        val exposure: Cents,
        val liabilityIds: Set<SyncId>,
    )
}
