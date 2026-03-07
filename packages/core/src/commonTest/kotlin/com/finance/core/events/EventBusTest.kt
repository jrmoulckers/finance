package com.finance.core.events

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import app.cash.turbine.test
import kotlin.test.*

class EventBusTest {

    private val timestamp = Instant.parse("2024-06-15T12:00:00Z")
    private val householdId = SyncId("household-1")

    private fun createTransactionCreatedEvent(
        transactionId: String = "txn-1",
        amount: Long = 2500,
    ) = DomainEvent.TransactionCreated(
        timestamp = timestamp,
        householdId = householdId,
        transactionId = SyncId(transactionId),
        accountId = SyncId("account-1"),
        amount = Cents(amount),
    )

    private fun createBudgetExceededEvent(
        budgetId: String = "budget-1",
    ) = DomainEvent.BudgetExceeded(
        timestamp = timestamp,
        householdId = householdId,
        budgetId = SyncId(budgetId),
        budgetAmount = Cents(50000),
        spentAmount = Cents(55000),
    )

    // ═══════════════════════════════════════════════════════════════════
    // emit() and receive via events Flow
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun emit_eventIsReceivedBySubscriber() = runTest {
        val bus = EventBus()
        val event = createTransactionCreatedEvent()

        bus.events.test {
            bus.emit(event)
            val received = awaitItem()
            assertEquals(event, received)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun emit_multipleEvents_receivedInOrder() = runTest {
        val bus = EventBus()
        val event1 = createTransactionCreatedEvent("txn-1")
        val event2 = createTransactionCreatedEvent("txn-2")
        val event3 = createBudgetExceededEvent()

        bus.events.test {
            bus.emit(event1)
            bus.emit(event2)
            bus.emit(event3)

            assertEquals(event1, awaitItem())
            assertEquals(event2, awaitItem())
            assertEquals(event3, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple subscribers
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun emit_multipleSubscribersReceiveSameEvent() = runTest {
        val bus = EventBus()
        val event = createTransactionCreatedEvent()

        val received1 = mutableListOf<DomainEvent>()
        val received2 = mutableListOf<DomainEvent>()

        val job1 = launch {
            bus.events.collect { received1.add(it) }
        }
        val job2 = launch {
            bus.events.collect { received2.add(it) }
        }

        // Give collectors a chance to start
        testScheduler.advanceUntilIdle()

        bus.emit(event)
        testScheduler.advanceUntilIdle()

        assertEquals(1, received1.size)
        assertEquals(event, received1[0])
        assertEquals(1, received2.size)
        assertEquals(event, received2[0])

        job1.cancel()
        job2.cancel()
    }

    // ═══════════════════════════════════════════════════════════════════
    // tryEmit()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun tryEmit_returnsTrue_whenBufferAvailable() = runTest {
        val bus = EventBus()
        val event = createTransactionCreatedEvent()

        // Buffer capacity is 64, so the first tryEmit should succeed
        val result = bus.tryEmit(event)
        assertTrue(result)
    }

    @Test
    fun tryEmit_eventIsReceivedBySubscriber() = runTest {
        val bus = EventBus()
        val event = createTransactionCreatedEvent()

        bus.events.test {
            bus.tryEmit(event)
            val received = awaitItem()
            assertEquals(event, received)
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Filtering by event type
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun events_canBeFilteredByType() = runTest {
        val bus = EventBus()
        val txnEvent = createTransactionCreatedEvent()
        val budgetEvent = createBudgetExceededEvent()

        // Filter only TransactionCreated events
        bus.events.filterIsInstance<DomainEvent.TransactionCreated>().test {
            bus.emit(txnEvent)
            bus.emit(budgetEvent) // this should not be received

            val received = awaitItem()
            assertEquals(txnEvent, received)
            // Budget event should not appear
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun events_filterByHouseholdId() = runTest {
        val bus = EventBus()
        val event1 = createTransactionCreatedEvent()
        val event2 = DomainEvent.TransactionCreated(
            timestamp = timestamp,
            householdId = SyncId("household-2"),
            transactionId = SyncId("txn-other"),
            accountId = SyncId("account-1"),
            amount = Cents(1000),
        )

        val targetHousehold = SyncId("household-1")
        bus.events.filter { it.householdId == targetHousehold }.test {
            bus.emit(event1) // household-1 — should match
            bus.emit(event2) // household-2 — should not match

            assertEquals(event1, awaitItem())
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Different DomainEvent subtypes
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun emit_differentEventTypes() = runTest {
        val bus = EventBus()

        val balanceChanged = DomainEvent.BalanceChanged(
            timestamp = timestamp,
            householdId = householdId,
            accountId = SyncId("account-1"),
            previousBalance = Cents(10000),
            newBalance = Cents(7500),
        )

        val lowBalance = DomainEvent.LowBalanceAlert(
            timestamp = timestamp,
            householdId = householdId,
            accountId = SyncId("account-1"),
            currentBalance = Cents(500),
            threshold = Cents(1000),
        )

        val goalCompleted = DomainEvent.GoalCompleted(
            timestamp = timestamp,
            householdId = householdId,
            goalId = SyncId("goal-1"),
            targetAmount = Cents(100000),
        )

        bus.events.test {
            bus.emit(balanceChanged)
            bus.emit(lowBalance)
            bus.emit(goalCompleted)

            assertTrue(awaitItem() is DomainEvent.BalanceChanged)
            assertTrue(awaitItem() is DomainEvent.LowBalanceAlert)
            assertTrue(awaitItem() is DomainEvent.GoalCompleted)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun domainEvent_properties_areAccessible() {
        val event = DomainEvent.TransactionUpdated(
            timestamp = timestamp,
            householdId = householdId,
            transactionId = SyncId("txn-1"),
            previousAmount = Cents(2500),
            newAmount = Cents(3500),
        )

        assertEquals(timestamp, event.timestamp)
        assertEquals(householdId, event.householdId)
        assertEquals(SyncId("txn-1"), event.transactionId)
        assertEquals(Cents(2500), event.previousAmount)
        assertEquals(Cents(3500), event.newAmount)
    }
}
