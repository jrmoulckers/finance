// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.referral

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Referral system core engine.
 * State machine: SENT -> ACCEPTED -> REWARDED | SENT -> EXPIRED | CANCELLED
 * All monetary values use [Cents] (Long-backed).
 */
object ReferralEngine {

    const val CODE_LENGTH = 8
    const val DEFAULT_EXPIRY_SECONDS: Long = 30 * 24 * 60 * 60
    val DEFAULT_REWARD = Cents(500L)
    const val MAX_ACTIVE_REFERRALS = 50

    fun generateCode(userId: SyncId, salt: String): String {
        val input = "${userId.value}:$salt"
        return simpleHash(input)
    }

    fun transition(referral: Referral, action: ReferralAction, now: Instant): ReferralTransitionResult {
        val effectiveStatus = if (referral.status == ReferralStatus.SENT && isExpired(referral, now)) {
            ReferralStatus.EXPIRED
        } else {
            referral.status
        }
        val validTransitions = mapOf(
            ReferralStatus.SENT to setOf(ReferralAction.ACCEPT, ReferralAction.EXPIRE, ReferralAction.CANCEL),
            ReferralStatus.ACCEPTED to setOf(ReferralAction.REWARD),
        )
        val allowed = validTransitions[effectiveStatus] ?: emptySet()
        if (action !in allowed) {
            return ReferralTransitionResult.InvalidTransition(
                currentStatus = effectiveStatus,
                attemptedAction = action,
                reason = "Cannot ${action.name.lowercase()} a referral in ${effectiveStatus.name.lowercase()} state",
            )
        }
        val newStatus = when (action) {
            ReferralAction.ACCEPT -> ReferralStatus.ACCEPTED
            ReferralAction.REWARD -> ReferralStatus.REWARDED
            ReferralAction.EXPIRE -> ReferralStatus.EXPIRED
            ReferralAction.CANCEL -> ReferralStatus.CANCELLED
        }
        return ReferralTransitionResult.Success(referral.copy(
            status = newStatus, updatedAt = now,
            acceptedAt = if (action == ReferralAction.ACCEPT) now else referral.acceptedAt,
            rewardedAt = if (action == ReferralAction.REWARD) now else referral.rewardedAt,
        ))
    }

    fun attributeSignup(code: String, referrals: List<Referral>, now: Instant): Referral? {
        return referrals.firstOrNull { it.referralCode == code && it.status == ReferralStatus.SENT && !isExpired(it, now) }
    }

    fun totalRewardsEarned(referrals: List<Referral>): Cents {
        return Cents(referrals.filter { it.status == ReferralStatus.REWARDED }.sumOf { it.rewardAmount.amount })
    }

    fun statusCounts(referrals: List<Referral>): Map<ReferralStatus, Int> {
        return ReferralStatus.entries.associateWith { status -> referrals.count { it.status == status } }
    }

    fun activePending(referrals: List<Referral>, now: Instant): List<Referral> {
        return referrals.filter { it.status == ReferralStatus.SENT && !isExpired(it, now) }
    }

    fun expireStale(referrals: List<Referral>, now: Instant): List<Referral> {
        return referrals.map { ref ->
            if (ref.status == ReferralStatus.SENT && isExpired(ref, now)) ref.copy(status = ReferralStatus.EXPIRED, updatedAt = now) else ref
        }
    }

    fun isExpired(referral: Referral, now: Instant): Boolean {
        if (referral.status != ReferralStatus.SENT) return false
        return (now.epochSeconds - referral.createdAt.epochSeconds) > (referral.expirySeconds ?: DEFAULT_EXPIRY_SECONDS)
    }

    internal fun simpleHash(input: String): String {
        var hash = 0L
        for (c in input) { hash = hash * 31 + c.code.toLong() }
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        val result = StringBuilder()
        var h = if (hash < 0) -hash else hash
        repeat(CODE_LENGTH) { result.append(chars[(h % chars.length).toInt()]); h /= chars.length }
        return result.toString()
    }
}

@Serializable
data class Referral(
    val id: SyncId, val referrerUserId: SyncId, val refereeUserId: SyncId? = null,
    val referralCode: String, val status: ReferralStatus = ReferralStatus.SENT,
    val rewardAmount: Cents = ReferralEngine.DEFAULT_REWARD,
    val expirySeconds: Long? = ReferralEngine.DEFAULT_EXPIRY_SECONDS,
    val acceptedAt: Instant? = null, val rewardedAt: Instant? = null,
    val createdAt: Instant, val updatedAt: Instant,
) {
    init {
        require(referralCode.isNotBlank()) { "Referral code cannot be blank" }
        require(rewardAmount.amount >= 0) { "Reward amount cannot be negative" }
    }
}

@Serializable
enum class ReferralStatus { SENT, ACCEPTED, REWARDED, EXPIRED, CANCELLED }

@Serializable
enum class ReferralAction { ACCEPT, REWARD, EXPIRE, CANCEL }

sealed class ReferralTransitionResult {
    data class Success(val referral: Referral) : ReferralTransitionResult()
    data class InvalidTransition(val currentStatus: ReferralStatus, val attemptedAction: ReferralAction, val reason: String) : ReferralTransitionResult()
}
