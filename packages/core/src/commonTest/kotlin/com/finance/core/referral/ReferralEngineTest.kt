// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.referral

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.*

class ReferralEngineTest {

    private val baseTime = Instant.parse("2024-06-15T12:00:00Z")
    private val userId = SyncId("user-1")
    private fun createReferral(id: String = "ref-1", status: ReferralStatus = ReferralStatus.SENT, code: String = "TESTCODE", rewardAmount: Cents = ReferralEngine.DEFAULT_REWARD, createdAt: Instant = baseTime, expirySeconds: Long = ReferralEngine.DEFAULT_EXPIRY_SECONDS) = Referral(SyncId(id), userId, null, code, status, rewardAmount, expirySeconds, null, null, createdAt, createdAt)

    @Test fun generateCode_fixedLength() { val c = ReferralEngine.generateCode(userId, "salt1"); assertEquals(ReferralEngine.CODE_LENGTH, c.length); assertTrue(c.all { it.isUpperCase() || it.isDigit() }) }
    @Test fun generateCode_differentSalts() { assertNotEquals(ReferralEngine.generateCode(userId, "salt1"), ReferralEngine.generateCode(userId, "salt2")) }
    @Test fun generateCode_deterministic() { assertEquals(ReferralEngine.generateCode(userId, "salt1"), ReferralEngine.generateCode(userId, "salt1")) }

    @Test fun sent_canBeAccepted() { val r = ReferralEngine.transition(createReferral(), ReferralAction.ACCEPT, Instant.parse("2024-06-16T12:00:00Z")); assertIs<ReferralTransitionResult.Success>(r); assertEquals(ReferralStatus.ACCEPTED, r.referral.status) }
    @Test fun sent_canBeCancelled() { val r = ReferralEngine.transition(createReferral(), ReferralAction.CANCEL, Instant.parse("2024-06-16T12:00:00Z")); assertIs<ReferralTransitionResult.Success>(r); assertEquals(ReferralStatus.CANCELLED, r.referral.status) }
    @Test fun sent_canBeExpired() { val r = ReferralEngine.transition(createReferral(), ReferralAction.EXPIRE, Instant.parse("2024-06-16T12:00:00Z")); assertIs<ReferralTransitionResult.Success>(r); assertEquals(ReferralStatus.EXPIRED, r.referral.status) }
    @Test fun accepted_canBeRewarded() { val r = ReferralEngine.transition(createReferral(status = ReferralStatus.ACCEPTED), ReferralAction.REWARD, Instant.parse("2024-06-17T12:00:00Z")); assertIs<ReferralTransitionResult.Success>(r); assertEquals(ReferralStatus.REWARDED, r.referral.status) }
    @Test fun sent_cannotBeRewarded() { assertIs<ReferralTransitionResult.InvalidTransition>(ReferralEngine.transition(createReferral(), ReferralAction.REWARD, Instant.parse("2024-06-16T12:00:00Z"))) }
    @Test fun rewarded_cannotTransition() { assertIs<ReferralTransitionResult.InvalidTransition>(ReferralEngine.transition(createReferral(status = ReferralStatus.REWARDED), ReferralAction.ACCEPT, Instant.parse("2024-06-17T12:00:00Z"))) }
    @Test fun autoExpired_cannotBeAccepted() { val r = ReferralEngine.transition(createReferral(expirySeconds = 3600), ReferralAction.ACCEPT, Instant.fromEpochSeconds(baseTime.epochSeconds + 7200)); assertIs<ReferralTransitionResult.InvalidTransition>(r); assertEquals(ReferralStatus.EXPIRED, r.currentStatus) }

    @Test fun attributeSignup_finds() { assertNotNull(ReferralEngine.attributeSignup("MYCODE1A", listOf(createReferral(code = "MYCODE1A")), Instant.parse("2024-06-16T12:00:00Z"))) }
    @Test fun attributeSignup_expired() { assertNull(ReferralEngine.attributeSignup("EXPIRED1", listOf(createReferral(code = "EXPIRED1", expirySeconds = 100)), Instant.fromEpochSeconds(baseTime.epochSeconds + 200))) }
    @Test fun attributeSignup_accepted() { assertNull(ReferralEngine.attributeSignup("USED1234", listOf(createReferral(code = "USED1234", status = ReferralStatus.ACCEPTED)), Instant.parse("2024-06-16T12:00:00Z"))) }

    @Test fun totalRewards() { assertEquals(Cents(1000), ReferralEngine.totalRewardsEarned(listOf(createReferral(id = "r1", status = ReferralStatus.REWARDED, rewardAmount = Cents(500)), createReferral(id = "r2", status = ReferralStatus.REWARDED, rewardAmount = Cents(500), code = "C2"), createReferral(id = "r3", status = ReferralStatus.ACCEPTED, code = "C3")))) }
    @Test fun statusCounts() { val c = ReferralEngine.statusCounts(listOf(createReferral(id = "r1"), createReferral(id = "r2", code = "C2"), createReferral(id = "r3", status = ReferralStatus.ACCEPTED, code = "C3"))); assertEquals(2, c[ReferralStatus.SENT]); assertEquals(1, c[ReferralStatus.ACCEPTED]); assertEquals(0, c[ReferralStatus.CANCELLED]) }
    @Test fun activePending() { val r = ReferralEngine.activePending(listOf(createReferral(id = "r1", expirySeconds = 86400, code = "A1"), createReferral(id = "r2", expirySeconds = 100, code = "S1")), Instant.fromEpochSeconds(baseTime.epochSeconds + 3600)); assertEquals(1, r.size); assertEquals("A1", r[0].referralCode) }
    @Test fun expireStale() { val r = ReferralEngine.expireStale(listOf(createReferral(id = "r1", expirySeconds = 86400, code = "A1"), createReferral(id = "r2", expirySeconds = 100, code = "S1"), createReferral(id = "r3", status = ReferralStatus.ACCEPTED, code = "C1")), Instant.fromEpochSeconds(baseTime.epochSeconds + 3600)); assertEquals(ReferralStatus.SENT, r[0].status); assertEquals(ReferralStatus.EXPIRED, r[1].status); assertEquals(ReferralStatus.ACCEPTED, r[2].status) }
    @Test fun isExpired_within() { assertFalse(ReferralEngine.isExpired(createReferral(expirySeconds = 86400), Instant.fromEpochSeconds(baseTime.epochSeconds + 3600))) }
    @Test fun isExpired_past() { assertTrue(ReferralEngine.isExpired(createReferral(expirySeconds = 3600), Instant.fromEpochSeconds(baseTime.epochSeconds + 7200))) }
}
