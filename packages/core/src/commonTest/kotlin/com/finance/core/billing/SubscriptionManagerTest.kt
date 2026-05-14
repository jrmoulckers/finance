// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.billing

import com.finance.models.types.Cents
import kotlinx.datetime.*
import kotlin.test.*

class SubscriptionManagerTest {

    private val now = Instant.parse("2024-06-15T12:00:00Z")
    private val oneMonthLater = now.plus(30L * 24 * 60 * 60, DateTimeUnit.SECOND)
    @Suppress("UnusedPrivateProperty")
    private val oneYearLater = now.plus(365L * 24 * 60 * 60, DateTimeUnit.SECOND)

    // ═══════════════════════════════════════════════════════════════════
    // Tier Resolution
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun resolveTier_nullState_returnsFree() {
        assertEquals(Tier.FREE, SubscriptionManager.resolveTier(null, now))
    }

    @Test
    fun resolveTier_activeSubscription_returnsPlanTier() {
        val state = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        assertEquals(Tier.PLUS, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_trialSubscription_returnsPlanTier() {
        val state = createState(PlanId.PREMIUM_MONTHLY, SubscriptionStatus.TRIALING)
        assertEquals(Tier.PREMIUM, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_cancelledBeforePeriodEnd_retainsTier() {
        val state = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.CANCELLED,
            periodEnd = oneMonthLater,
        )
        // now is before period end
        assertEquals(Tier.PLUS, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_cancelledAfterPeriodEnd_returnsFree() {
        val state = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.CANCELLED,
            periodEnd = now.minus(1L * 24 * 60 * 60, DateTimeUnit.SECOND), // Yesterday
        )
        assertEquals(Tier.FREE, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_pastDueWithinGrace_retainsTier() {
        val state = createState(
            PlanId.PREMIUM_YEARLY,
            SubscriptionStatus.PAST_DUE,
            periodEnd = now.minus(3L * 24 * 60 * 60, DateTimeUnit.SECOND), // 3 days ago
        )
        // Grace period is 7 days, so still within grace
        assertEquals(Tier.PREMIUM, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_pastDueAfterGrace_returnsFree() {
        val state = createState(
            PlanId.PREMIUM_YEARLY,
            SubscriptionStatus.PAST_DUE,
            periodEnd = now.minus(10L * 24 * 60 * 60, DateTimeUnit.SECOND), // 10 days ago
        )
        assertEquals(Tier.FREE, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_expired_returnsFree() {
        val state = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.EXPIRED)
        assertEquals(Tier.FREE, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_paused_returnsFree() {
        val state = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.PAUSED)
        assertEquals(Tier.FREE, SubscriptionManager.resolveTier(state, now))
    }

    @Test
    fun resolveTier_familyPlan_returnsFamily() {
        val state = createState(PlanId.FAMILY_YEARLY, SubscriptionStatus.ACTIVE)
        assertEquals(Tier.FAMILY, SubscriptionManager.resolveTier(state, now))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Plan ID to Tier
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun planIdToTier_allPlans() {
        assertEquals(Tier.FREE, SubscriptionManager.planIdToTier(PlanId.FREE))
        assertEquals(Tier.PLUS, SubscriptionManager.planIdToTier(PlanId.PLUS_MONTHLY))
        assertEquals(Tier.PLUS, SubscriptionManager.planIdToTier(PlanId.PLUS_YEARLY))
        assertEquals(Tier.PREMIUM, SubscriptionManager.planIdToTier(PlanId.PREMIUM_MONTHLY))
        assertEquals(Tier.PREMIUM, SubscriptionManager.planIdToTier(PlanId.PREMIUM_YEARLY))
        assertEquals(Tier.FAMILY, SubscriptionManager.planIdToTier(PlanId.FAMILY_MONTHLY))
        assertEquals(Tier.FAMILY, SubscriptionManager.planIdToTier(PlanId.FAMILY_YEARLY))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Create Subscription
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun createSubscription_withTrial() {
        val state = SubscriptionManager.createSubscription(
            ownerId = "user-1",
            planId = PlanId.PLUS_MONTHLY,
            platform = PurchasePlatform.APPLE,
            now = now,
        )

        assertEquals("user-1", state.ownerId)
        assertEquals(PlanId.PLUS_MONTHLY, state.planId)
        assertEquals(SubscriptionStatus.TRIALING, state.status)
        assertEquals(PurchasePlatform.APPLE, state.platform)
        assertTrue(state.autoRenew)
        assertNotNull(state.trialEnd)
        assertNull(state.lastPaymentDate) // No payment during trial
    }

    @Test
    fun createSubscription_rejectsFree() {
        assertFailsWith<IllegalArgumentException> {
            SubscriptionManager.createSubscription(
                ownerId = "user-1",
                planId = PlanId.FREE,
                platform = PurchasePlatform.STRIPE,
                now = now,
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // State Transitions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun cancelSubscription_setsStatus() {
        val active = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        val cancelled = SubscriptionManager.cancelSubscription(active, now)

        assertEquals(SubscriptionStatus.CANCELLED, cancelled.status)
        assertFalse(cancelled.autoRenew)
    }

    @Test
    fun cancelSubscription_rejectsExpired() {
        val expired = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.EXPIRED)
        assertFailsWith<IllegalArgumentException> {
            SubscriptionManager.cancelSubscription(expired, now)
        }
    }

    @Test
    fun renewSubscription_resetsToActive() {
        val pastDue = createState(PlanId.PREMIUM_MONTHLY, SubscriptionStatus.PAST_DUE)
        val renewed = SubscriptionManager.renewSubscription(pastDue, now)

        assertEquals(SubscriptionStatus.ACTIVE, renewed.status)
        assertTrue(renewed.autoRenew)
        assertEquals(now, renewed.lastPaymentDate)
        assertEquals(now, renewed.currentPeriodStart)
    }

    @Test
    fun markPaymentFailed_transitionsToPastDue() {
        val active = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        val pastDue = SubscriptionManager.markPaymentFailed(active, now)

        assertEquals(SubscriptionStatus.PAST_DUE, pastDue.status)
    }

    @Test
    fun expireSubscription_transitionsToExpired() {
        val pastDue = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.PAST_DUE)
        val expired = SubscriptionManager.expireSubscription(pastDue, now)

        assertEquals(SubscriptionStatus.EXPIRED, expired.status)
        assertFalse(expired.autoRenew)
    }

    @Test
    fun changePlan_updatesId() {
        val state = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        val upgraded = SubscriptionManager.changePlan(state, PlanId.PREMIUM_MONTHLY, now)

        assertEquals(PlanId.PREMIUM_MONTHLY, upgraded.planId)
    }

    @Test
    fun changePlan_rejectsFree() {
        val state = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        assertFailsWith<IllegalArgumentException> {
            SubscriptionManager.changePlan(state, PlanId.FREE, now)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Query Helpers
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun shouldShowRenewalPrompt_cancelledNearEnd() {
        val state = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.CANCELLED,
            periodEnd = now.plus(5L * 24 * 60 * 60, DateTimeUnit.SECOND), // 5 days away
        )

        assertTrue(SubscriptionManager.shouldShowRenewalPrompt(state, now))
    }

    @Test
    fun shouldShowRenewalPrompt_cancelledFarFromEnd() {
        val state = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.CANCELLED,
            periodEnd = now.plus(20L * 24 * 60 * 60, DateTimeUnit.SECOND), // 20 days away
        )

        assertFalse(SubscriptionManager.shouldShowRenewalPrompt(state, now))
    }

    @Test
    fun shouldShowRenewalPrompt_active_false() {
        val state = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        assertFalse(SubscriptionManager.shouldShowRenewalPrompt(state, now))
    }

    @Test
    fun remainingDays_calculation() {
        val state = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.ACTIVE,
            periodEnd = now.plus(15L * 24 * 60 * 60, DateTimeUnit.SECOND),
        )

        assertEquals(15, SubscriptionManager.remainingDays(state, now))
    }

    @Test
    fun remainingDays_expired_returnsZero() {
        val state = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.EXPIRED,
            periodEnd = now.minus(5L * 24 * 60 * 60, DateTimeUnit.SECOND),
        )

        assertEquals(0, SubscriptionManager.remainingDays(state, now))
    }

    @Test
    fun isUpgrade_plusToPremium() {
        assertTrue(SubscriptionManager.isUpgrade(PlanId.PLUS_MONTHLY, PlanId.PREMIUM_MONTHLY))
    }

    @Test
    fun isUpgrade_premiumToPlus_isFalse() {
        assertFalse(SubscriptionManager.isUpgrade(PlanId.PREMIUM_MONTHLY, PlanId.PLUS_MONTHLY))
    }

    @Test
    fun isDowngrade_premiumToPlus() {
        assertTrue(SubscriptionManager.isDowngrade(PlanId.PREMIUM_MONTHLY, PlanId.PLUS_MONTHLY))
    }

    // ═══════════════════════════════════════════════════════════════════
    // SubscriptionState Properties
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun subscriptionState_isPaid() {
        val active = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        assertTrue(active.isPaid)

        val free = createState(PlanId.FREE, SubscriptionStatus.ACTIVE)
        assertFalse(free.isPaid)

        val expired = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.EXPIRED)
        assertFalse(expired.isPaid)
    }

    @Test
    fun subscriptionState_isTrialing() {
        val trialing = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.TRIALING)
        assertTrue(trialing.isTrialing)

        val active = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.ACTIVE)
        assertFalse(active.isTrialing)
    }

    @Test
    fun subscriptionState_needsAttention() {
        val pastDue = createState(PlanId.PLUS_MONTHLY, SubscriptionStatus.PAST_DUE)
        assertTrue(pastDue.needsAttention)

        val cancelled = createState(
            PlanId.PLUS_MONTHLY,
            SubscriptionStatus.CANCELLED,
        ).copy(autoRenew = false)
        assertTrue(cancelled.needsAttention)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Plans
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun plans_allHaveProductIds() {
        Plans.ALL.forEach { plan ->
            assertTrue(plan.productIds.isNotEmpty(), "${plan.planId} should have product IDs")
        }
    }

    @Test
    fun plans_byId_findsPlans() {
        assertNotNull(Plans.byId(PlanId.PLUS_MONTHLY))
        assertNotNull(Plans.byId(PlanId.PREMIUM_YEARLY))
        assertNull(Plans.byId(PlanId.FREE))
    }

    @Test
    fun plans_groupedByTier() {
        val grouped = Plans.groupedByTier()
        assertEquals(3, grouped.size) // Plus, Premium, Family
        assertEquals(2, grouped["Plus"]?.size) // Monthly + Yearly
    }

    @Test
    fun plans_effectiveMonthlyCents() {
        val yearly = Plans.PLUS_YEARLY
        // $39.99 / 12 = $3.33 (333 cents)
        assertEquals(Cents(333), yearly.effectiveMonthlyCents)
    }

    @Test
    fun plans_savingsVsMonthly() {
        val savings = Plans.PLUS_YEARLY.savingsVsMonthly(Plans.PLUS_MONTHLY)
        // Monthly: $4.99 × 12 = $59.88, Yearly: $39.99
        // Savings: ($59.88 - $39.99) / $59.88 × 100 ≈ 33.2%
        assertTrue(savings > 30.0)
        assertTrue(savings < 40.0)
    }

    @Test
    fun plans_pricesArePositive() {
        Plans.ALL.forEach { plan ->
            assertTrue(plan.priceCents.amount > 0, "${plan.planId} should have positive price")
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BillingEvent types
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun billingEvent_subscribed_creation() {
        val event = BillingEvent.Subscribed(
            timestamp = now,
            planId = PlanId.PLUS_MONTHLY,
            platform = PurchasePlatform.APPLE,
            isTrialStart = true,
        )

        assertEquals(now, event.timestamp)
        assertEquals(PlanId.PLUS_MONTHLY, event.planId)
        assertTrue(event.isTrialStart)
    }

    @Test
    fun billingEvent_planChanged_creation() {
        val event = BillingEvent.PlanChanged(
            timestamp = now,
            planId = PlanId.PREMIUM_MONTHLY,
            fromPlanId = PlanId.PLUS_MONTHLY,
        )

        assertEquals(PlanId.PREMIUM_MONTHLY, event.planId)
        assertEquals(PlanId.PLUS_MONTHLY, event.fromPlanId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun createState(
        planId: PlanId,
        status: SubscriptionStatus,
        periodEnd: Instant = oneMonthLater,
    ): SubscriptionState = SubscriptionState(
        ownerId = "user-1",
        planId = planId,
        status = status,
        platform = PurchasePlatform.APPLE,
        currentPeriodStart = now,
        currentPeriodEnd = periodEnd,
        autoRenew = status == SubscriptionStatus.ACTIVE || status == SubscriptionStatus.TRIALING,
        createdAt = now,
        updatedAt = now,
    )
}
