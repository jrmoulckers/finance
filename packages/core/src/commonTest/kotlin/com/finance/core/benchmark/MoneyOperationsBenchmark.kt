package com.finance.core.benchmark

import com.finance.core.money.MoneyOperations
import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.measureTime

/**
 * Performance benchmarks for [MoneyOperations].
 *
 * These tests verify that core money operations complete within acceptable
 * time bounds even under heavy load. They are not correctness tests — see
 * [com.finance.core.money.MoneyOperationsTest] for functional coverage.
 *
 * Targets:
 * - Single operation: <1µs amortized
 * - 10K-operation batch: <50ms total
 * - Allocation (3-way split): <10ms for 1K iterations
 */
class MoneyOperationsBenchmark {

    companion object {
        private const val LARGE_DATASET_SIZE = 10_000
        private const val ALLOCATION_ITERATIONS = 1_000
        private const val WARMUP_ITERATIONS = 50
    }

    // ── Arithmetic Benchmarks ────────────────────────────────────────────────

    @Test
    fun benchmarkSumLargeDataset() {
        val amounts = (1..LARGE_DATASET_SIZE).map { Cents(it.toLong() * 100) }

        repeat(WARMUP_ITERATIONS) { MoneyOperations.sum(amounts) }

        val duration = measureTime {
            repeat(100) { MoneyOperations.sum(amounts) }
        }

        printResult("MoneyOperations.sum(${LARGE_DATASET_SIZE} items) x100", duration)
        assertTrue(duration.inWholeMilliseconds < 500, "sum of $LARGE_DATASET_SIZE items x100 should complete in <500ms, took $duration")
    }

    @Test
    fun benchmarkMultiplyLargeDataset() {
        val amounts = (1..LARGE_DATASET_SIZE).map { Cents(it.toLong() * 100) }

        repeat(WARMUP_ITERATIONS) { amounts.forEach { MoneyOperations.multiply(it, 1.075) } }

        val duration = measureTime {
            amounts.forEach { MoneyOperations.multiply(it, 1.075) }
        }

        printResult("MoneyOperations.multiply x$LARGE_DATASET_SIZE", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "multiply over $LARGE_DATASET_SIZE items should complete in <50ms, took $duration")
    }

    @Test
    fun benchmarkDivideLargeDataset() {
        val amounts = (1..LARGE_DATASET_SIZE).map { Cents(it.toLong() * 1000) }

        repeat(WARMUP_ITERATIONS) { amounts.forEach { MoneyOperations.divide(it, 3) } }

        val duration = measureTime {
            amounts.forEach { MoneyOperations.divide(it, 3) }
        }

        printResult("MoneyOperations.divide x$LARGE_DATASET_SIZE", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "divide over $LARGE_DATASET_SIZE items should complete in <50ms, took $duration")
    }

    @Test
    fun benchmarkPercentageLargeDataset() {
        val amounts = (1..LARGE_DATASET_SIZE).map { Cents(it.toLong() * 100) }

        repeat(WARMUP_ITERATIONS) { amounts.forEach { MoneyOperations.percentage(it, 15.5) } }

        val duration = measureTime {
            amounts.forEach { MoneyOperations.percentage(it, 15.5) }
        }

        printResult("MoneyOperations.percentage x$LARGE_DATASET_SIZE", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "percentage over $LARGE_DATASET_SIZE items should complete in <50ms, took $duration")
    }

    // ── Banker's Rounding Benchmarks ─────────────────────────────────────────

    @Test
    fun benchmarkBankersRoundLargeDataset() {
        val values = (1..LARGE_DATASET_SIZE).map { it.toDouble() + 0.5 }

        repeat(WARMUP_ITERATIONS) { values.forEach { MoneyOperations.bankersRound(it) } }

        val duration = measureTime {
            values.forEach { MoneyOperations.bankersRound(it) }
        }

        printResult("MoneyOperations.bankersRound x$LARGE_DATASET_SIZE", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "bankersRound over $LARGE_DATASET_SIZE values should complete in <50ms, took $duration")
    }

    @Test
    fun benchmarkBankersRoundEdgeCases() {
        val edgeCases = listOf(0.0, 0.5, 1.5, 2.5, -0.5, -1.5, 99999.5, 0.4999999, 0.5000001)

        repeat(WARMUP_ITERATIONS) { edgeCases.forEach { MoneyOperations.bankersRound(it) } }

        val duration = measureTime {
            repeat(LARGE_DATASET_SIZE) {
                edgeCases.forEach { MoneyOperations.bankersRound(it) }
            }
        }

        printResult("MoneyOperations.bankersRound edge cases x${LARGE_DATASET_SIZE * edgeCases.size}", duration)
        assertTrue(duration.inWholeMilliseconds < 100, "bankersRound edge cases should complete in <100ms, took $duration")
    }

    // ── Allocation Benchmarks ────────────────────────────────────────────────

    @Test
    fun benchmarkAllocateEqualParts() {
        val amount = Cents(1_000_000)

        repeat(WARMUP_ITERATIONS) { MoneyOperations.allocate(amount, 3) }

        val duration = measureTime {
            repeat(ALLOCATION_ITERATIONS) {
                MoneyOperations.allocate(amount, 3)
            }
        }

        printResult("MoneyOperations.allocate(3 parts) x$ALLOCATION_ITERATIONS", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "allocate 3-way x$ALLOCATION_ITERATIONS should complete in <50ms, took $duration")
    }

    @Test
    fun benchmarkAllocateManyParts() {
        val amount = Cents(1_000_000)

        repeat(WARMUP_ITERATIONS) { MoneyOperations.allocate(amount, 100) }

        val duration = measureTime {
            repeat(ALLOCATION_ITERATIONS) {
                MoneyOperations.allocate(amount, 100)
            }
        }

        printResult("MoneyOperations.allocate(100 parts) x$ALLOCATION_ITERATIONS", duration)
        assertTrue(duration.inWholeMilliseconds < 200, "allocate 100-way x$ALLOCATION_ITERATIONS should complete in <200ms, took $duration")
    }

    @Test
    fun benchmarkAllocateByRatio() {
        val amount = Cents(500_000)
        val ratios = listOf(50, 30, 20)

        repeat(WARMUP_ITERATIONS) { MoneyOperations.allocateByRatio(amount, ratios) }

        val duration = measureTime {
            repeat(ALLOCATION_ITERATIONS) {
                MoneyOperations.allocateByRatio(amount, ratios)
            }
        }

        printResult("MoneyOperations.allocateByRatio(50/30/20) x$ALLOCATION_ITERATIONS", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "allocateByRatio x$ALLOCATION_ITERATIONS should complete in <50ms, took $duration")
    }

    @Test
    fun benchmarkAllocateByComplexRatio() {
        val amount = Cents(1_000_000)
        val ratios = listOf(25, 20, 15, 15, 10, 5, 5, 3, 2)

        repeat(WARMUP_ITERATIONS) { MoneyOperations.allocateByRatio(amount, ratios) }

        val duration = measureTime {
            repeat(ALLOCATION_ITERATIONS) {
                MoneyOperations.allocateByRatio(amount, ratios)
            }
        }

        printResult("MoneyOperations.allocateByRatio(9-way) x$ALLOCATION_ITERATIONS", duration)
        assertTrue(duration.inWholeMilliseconds < 100, "allocateByRatio 9-way x$ALLOCATION_ITERATIONS should complete in <100ms, took $duration")
    }

    // ── Combined Workload ────────────────────────────────────────────────────

    @Test
    fun benchmarkMixedWorkload() {
        val amounts = (1..LARGE_DATASET_SIZE).map { Cents(it.toLong() * 100) }
        val ratios = listOf(50, 30, 20)

        repeat(WARMUP_ITERATIONS) {
            MoneyOperations.sum(amounts)
            MoneyOperations.multiply(amounts.first(), 1.1)
            MoneyOperations.allocateByRatio(amounts.first(), ratios)
        }

        val duration = measureTime {
            val total = MoneyOperations.sum(amounts)
            val taxed = MoneyOperations.percentage(total, 8.25)
            MoneyOperations.allocateByRatio(total + taxed, ratios)

            amounts.take(1_000).forEach {
                MoneyOperations.multiply(it, 1.075)
                MoneyOperations.divide(it, 12)
            }
        }

        printResult("Mixed workload (sum + tax + allocate + 1K multiply/divide)", duration)
        assertTrue(duration.inWholeMilliseconds < 50, "mixed workload should complete in <50ms, took $duration")
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun printResult(label: String, duration: Duration) {
        println("  \u23f1  $label: $duration")
    }
}
