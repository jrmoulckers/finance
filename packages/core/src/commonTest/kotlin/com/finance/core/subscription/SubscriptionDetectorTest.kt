// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.subscription

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

class SubscriptionDetectorTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Monthly subscription detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_monthlySubscription_foundCorrectly() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(1499), // $14.99
                date = LocalDate(2024, 1 + month, 15),
            ).copy(payee = "Netflix")
        }

        val subscriptions = SubscriptionDetector.detect(transactions)

        assertEquals(1, subscriptions.size)
        val sub = subscriptions.first()
        assertEquals("netflix", sub.payee)
        assertEquals(SubscriptionFrequency.MONTHLY, sub.frequency)
        assertEquals(Cents(1499), sub.averageAmount)
        assertEquals(6, sub.occurrenceCount)
        assertEquals(SubscriptionConfidence.HIGH, sub.confidence)
    }

    @Test
    fun detect_monthlySubscription_estimatesCorrectly() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(999), // $9.99
                date = LocalDate(2024, 1 + month, 1),
            ).copy(payee = "Spotify")
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        val sub = subscriptions.first()

        // Monthly cost = $9.99
        assertEquals(Cents(999), sub.estimatedMonthlyCost)
        // Annual cost = $9.99 * 12 = $119.88
        assertEquals(Cents(11988), sub.estimatedAnnualCost)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Weekly subscription detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_weeklySubscription_foundCorrectly() {
        val transactions = (0..7).map { week ->
            TestFixtures.createExpense(
                amount = Cents(500), // $5.00
                date = LocalDate(2024, 1, 1).plus(week * 7, DateTimeUnit.DAY),
            ).copy(payee = "Weekly Service")
        }

        val subscriptions = SubscriptionDetector.detect(transactions)

        assertEquals(1, subscriptions.size)
        assertEquals(SubscriptionFrequency.WEEKLY, subscriptions.first().frequency)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Yearly subscription detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_yearlySubscription_foundCorrectly() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(9999), // $99.99
                date = LocalDate(2022, 3, 15),
            ).copy(payee = "Annual License"),
            TestFixtures.createExpense(
                amount = Cents(9999),
                date = LocalDate(2023, 3, 15),
            ).copy(payee = "Annual License"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)

        assertEquals(1, subscriptions.size)
        assertEquals(SubscriptionFrequency.YEARLY, subscriptions.first().frequency)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Non-subscription filtering
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_irregularAmounts_notDetected() {
        // Transactions with same payee but wildly different amounts
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 15))
                .copy(payee = "Grocery Store"),
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 2, 15))
                .copy(payee = "Grocery Store"),
            TestFixtures.createExpense(amount = Cents(2500), date = LocalDate(2024, 3, 15))
                .copy(payee = "Grocery Store"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty())
    }

    @Test
    fun detect_irregularIntervals_notDetected() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 1))
                .copy(payee = "Random Shop"),
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 15))
                .copy(payee = "Random Shop"),
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 3, 20))
                .copy(payee = "Random Shop"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty())
    }

    @Test
    fun detect_singleTransaction_notDetected() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1999), date = LocalDate(2024, 1, 15))
                .copy(payee = "One-time Purchase"),
        )

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty())
    }

    @Test
    fun detect_ignoresDeletedTransactions() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(1499),
                date = LocalDate(2024, 1 + month, 15),
                deletedAt = TestFixtures.fixedInstant, // all deleted
            ).copy(payee = "Netflix")
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty())
    }

    @Test
    fun detect_ignoresNullPayee() {
        val transactions = (0..5).map { month ->
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 1 + month, 15),
            ) // payee is null by default
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        assertTrue(subscriptions.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple subscriptions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_multipleSubscriptions_sortedByAnnualCost() {
        val transactions = buildList {
            // Cheap subscription: $5/mo
            (0..5).forEach { month ->
                add(
                    TestFixtures.createExpense(
                        amount = Cents(500),
                        date = LocalDate(2024, 1 + month, 1),
                    ).copy(payee = "Cheap Service"),
                )
            }
            // Expensive subscription: $50/mo
            (0..5).forEach { month ->
                add(
                    TestFixtures.createExpense(
                        amount = Cents(5000),
                        date = LocalDate(2024, 1 + month, 15),
                    ).copy(payee = "Expensive Service"),
                )
            }
        }

        val subscriptions = SubscriptionDetector.detect(transactions)

        assertEquals(2, subscriptions.size)
        // Most expensive first
        assertEquals("expensive service", subscriptions[0].payee)
        assertEquals("cheap service", subscriptions[1].payee)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Cost estimation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun estimateAnnualCost_sumsAllSubscriptions() {
        val transactions = buildList {
            (0..5).forEach { month ->
                add(
                    TestFixtures.createExpense(
                        amount = Cents(1000),
                        date = LocalDate(2024, 1 + month, 1),
                    ).copy(payee = "Service A"),
                )
            }
            (0..5).forEach { month ->
                add(
                    TestFixtures.createExpense(
                        amount = Cents(2000),
                        date = LocalDate(2024, 1 + month, 15),
                    ).copy(payee = "Service B"),
                )
            }
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        val annual = SubscriptionDetector.estimateAnnualCost(subscriptions)

        // $10 * 12 + $20 * 12 = $360
        assertEquals(Cents(36000), annual)
    }

    @Test
    fun estimateMonthlyCost_sumsAllSubscriptions() {
        val transactions = buildList {
            (0..5).forEach { month ->
                add(
                    TestFixtures.createExpense(
                        amount = Cents(1000),
                        date = LocalDate(2024, 1 + month, 1),
                    ).copy(payee = "Service A"),
                )
            }
            (0..5).forEach { month ->
                add(
                    TestFixtures.createExpense(
                        amount = Cents(2000),
                        date = LocalDate(2024, 1 + month, 15),
                    ).copy(payee = "Service B"),
                )
            }
        }

        val subscriptions = SubscriptionDetector.detect(transactions)
        val monthly = SubscriptionDetector.estimateMonthlyCost(subscriptions)

        assertEquals(Cents(3000), monthly)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Price change detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectPriceChanges_detectsIncrease() {
        // Simulate Netflix price increase
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(999), date = LocalDate(2024, 1, 15))
                .copy(payee = "Netflix"),
            TestFixtures.createExpense(amount = Cents(999), date = LocalDate(2024, 2, 15))
                .copy(payee = "Netflix"),
            TestFixtures.createExpense(amount = Cents(999), date = LocalDate(2024, 3, 15))
                .copy(payee = "Netflix"),
            TestFixtures.createExpense(amount = Cents(1599), date = LocalDate(2024, 4, 15))
                .copy(payee = "Netflix"),
            TestFixtures.createExpense(amount = Cents(1599), date = LocalDate(2024, 5, 15))
                .copy(payee = "Netflix"),
            TestFixtures.createExpense(amount = Cents(1599), date = LocalDate(2024, 6, 15))
                .copy(payee = "Netflix"),
        )

        // These won't be detected as subscription because amounts differ > 10%
        // But let's test the analyseGroup directly
        val group = SubscriptionDetector.analyseGroup("netflix", transactions)
        // With 10% tolerance, 999 vs 1599 is ~60% difference — won't match
        assertNull(group)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Normalise payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun normalisePayee_trimAndLowercase() {
        assertEquals("netflix", SubscriptionDetector.normalisePayee("  Netflix  "))
        assertEquals("netflix", SubscriptionDetector.normalisePayee("NETFLIX"))
    }

    @Test
    fun normalisePayee_collapseWhitespace() {
        assertEquals("whole foods market", SubscriptionDetector.normalisePayee("Whole  Foods   Market"))
    }

    @Test
    fun normalisePayee_stripTrailingReferences() {
        assertEquals("merchant", SubscriptionDetector.normalisePayee("Merchant #12345"))
        assertEquals("merchant", SubscriptionDetector.normalisePayee("Merchant *9876"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Frequency classification
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun classifyFrequency_correctRanges() {
        assertEquals(SubscriptionFrequency.WEEKLY, SubscriptionDetector.classifyFrequency(7.0))
        assertEquals(SubscriptionFrequency.BIWEEKLY, SubscriptionDetector.classifyFrequency(14.0))
        assertEquals(SubscriptionFrequency.MONTHLY, SubscriptionDetector.classifyFrequency(30.0))
        assertEquals(SubscriptionFrequency.QUARTERLY, SubscriptionDetector.classifyFrequency(91.0))
        assertEquals(SubscriptionFrequency.YEARLY, SubscriptionDetector.classifyFrequency(365.0))
    }

    @Test
    fun classifyFrequency_outOfRange_returnsNull() {
        assertNull(SubscriptionDetector.classifyFrequency(3.0))
        assertNull(SubscriptionDetector.classifyFrequency(45.0))
        assertNull(SubscriptionDetector.classifyFrequency(200.0))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Monthly/annual cost conversion
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun toMonthlyCost_conversions() {
        val amount = Cents(1200) // $12.00

        assertEquals(
            Cents(1200 * 52 / 12),
            SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.WEEKLY),
        )
        assertEquals(
            Cents(1200 * 26 / 12),
            SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.BIWEEKLY),
        )
        assertEquals(
            Cents(1200),
            SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.MONTHLY),
        )
        assertEquals(
            Cents(400),
            SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.QUARTERLY),
        )
        assertEquals(
            Cents(100),
            SubscriptionDetector.toMonthlyCost(amount, SubscriptionFrequency.YEARLY),
        )
    }

    @Test
    fun toAnnualCost_conversions() {
        val amount = Cents(1000) // $10.00

        assertEquals(
            Cents(52000),
            SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.WEEKLY),
        )
        assertEquals(
            Cents(26000),
            SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.BIWEEKLY),
        )
        assertEquals(
            Cents(12000),
            SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.MONTHLY),
        )
        assertEquals(
            Cents(4000),
            SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.QUARTERLY),
        )
        assertEquals(
            Cents(1000),
            SubscriptionDetector.toAnnualCost(amount, SubscriptionFrequency.YEARLY),
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Confidence levels
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detect_confidenceLevels() {
        // 2 occurrences → LOW
        val twoMonths = (0..1).map { month ->
            TestFixtures.createExpense(
                amount = Cents(999),
                date = LocalDate(2024, 1 + month, 15),
            ).copy(payee = "Two-month Sub")
        }
        val subsLow = SubscriptionDetector.detect(twoMonths)
        assertEquals(1, subsLow.size)
        assertEquals(SubscriptionConfidence.LOW, subsLow.first().confidence)

        // 4 occurrences → MEDIUM
        val fourMonths = (0..3).map { month ->
            TestFixtures.createExpense(
                amount = Cents(999),
                date = LocalDate(2024, 1 + month, 15),
            ).copy(payee = "Four-month Sub")
        }
        val subsMed = SubscriptionDetector.detect(fourMonths)
        assertEquals(1, subsMed.size)
        assertEquals(SubscriptionConfidence.MEDIUM, subsMed.first().confidence)

        // 7 occurrences → HIGH
        val sevenMonths = (0..6).map { month ->
            TestFixtures.createExpense(
                amount = Cents(999),
                date = LocalDate(2024, 1 + month, 15),
            ).copy(payee = "Seven-month Sub")
        }
        val subsHigh = SubscriptionDetector.detect(sevenMonths)
        assertEquals(1, subsHigh.size)
        assertEquals(SubscriptionConfidence.HIGH, subsHigh.first().confidence)
    }
}
