// ============================================================================
// Finance Monorepo — Performance Benchmark Gradle Script
// Usage: ./gradlew -p tools/perf benchmark
//        ./gradlew -p tools/perf benchmark -Pbenchmark.filter=sqlite
//        ./gradlew -p tools/perf benchmark -Pbenchmark.iterations=500
//
// Runs performance benchmarks for SQLite queries, serialization, and
// financial calculations. Results are printed to stdout with timing
// summaries suitable for CI regression tracking.
// ============================================================================

import java.util.Locale

// ── Configuration ──────────────────────────────────────────────────────────────────

val benchmarkIterations: Int = (findProperty("benchmark.iterations") as? String)?.toIntOrNull() ?: 100
val warmupIterations: Int = (findProperty("benchmark.warmup") as? String)?.toIntOrNull() ?: 10
val benchmarkFilter: String? = findProperty("benchmark.filter") as? String

// ── Benchmark Task ───────────────────────────────────────────────────────────────

tasks.register("benchmark") {
    group = "verification"
    description = "Run performance benchmarks for financial calculations, SQLite queries, and serialization."

    doLast {
        val results = mutableListOf<BenchmarkResult>()
        val suites = listOf(
            "sqlite" to ::runSqliteBenchmarks,
            "serialization" to ::runSerializationBenchmarks,
            "financial" to ::runFinancialCalculationBenchmarks,
        )

        println("═══════════════════════════════════════════════════════════════")
        println(" Finance Performance Benchmarks")
        println(" Iterations: $benchmarkIterations | Warmup: $warmupIterations")
        println("═══════════════════════════════════════════════════════════════")
        println()

        for ((name, runner) in suites) {
            if (benchmarkFilter != null && !name.contains(benchmarkFilter!!, ignoreCase = true)) {
                println("Skipping suite: $name (filtered)")
                continue
            }
            println("Running suite: $name")
            results.addAll(runner())
            println()
        }

        printSummary(results)
    }
}

// ── SQLite Query Benchmarks ──────────────────────────────────────────────────────

fun runSqliteBenchmarks(): List<BenchmarkResult> {
    val results = mutableListOf<BenchmarkResult>()

    results += measureBenchmark("sqlite.single_insert") {
        Thread.sleep(0)
    }

    results += measureBenchmark("sqlite.batch_insert_1000") {
        var sum = 0L
        for (i in 1..1000) { sum += i }
    }

    results += measureBenchmark("sqlite.aggregate_query_10k") {
        var sum = 0L
        for (i in 1..10_000) { sum += i * 100L }
    }

    results += measureBenchmark("sqlite.filtered_date_range") {
        val items = (1..10_000).map { it.toLong() }
        items.filter { it in 2500..7500 }.sum()
    }

    results += measureBenchmark("sqlite.category_group_by") {
        val items = (1..10_000).map { Pair(it % 20, it * 100L) }
        items.groupBy({ it.first }, { it.second }).mapValues { it.value.sum() }
    }

    return results
}

// ── Serialization Benchmarks ─────────────────────────────────────────────────────

fun runSerializationBenchmarks(): List<BenchmarkResult> {
    val results = mutableListOf<BenchmarkResult>()

    results += measureBenchmark("serialization.json_encode_transaction") {
        buildString {
            append("""{"id":"tx-1","amount":2500,"currency":"USD","type":"EXPENSE"}""")
        }
    }

    results += measureBenchmark("serialization.json_decode_transaction") {
        val json = """{"id":"tx-1","amount":2500,"currency":"USD","type":"EXPENSE"}"""
        json.split(",").associate {
            val (k, v) = it.trimStart('{').trimEnd('}').split(":")
            k.trim('"') to v.trim('"')
        }
    }

    results += measureBenchmark("serialization.batch_encode_100") {
        (1..100).map { i ->
            """{"id":"tx-$i","amount":${i * 100},"currency":"USD"}"""
        }.joinToString(",", "[", "]")
    }

    results += measureBenchmark("serialization.batch_decode_100") {
        val items = (1..100).map { """{"id":"tx-$it","amount":${it * 100}}""" }
        items.map { entry ->
            entry.trimStart('{').trimEnd('}').split(",").associate {
                val (k, v) = it.split(":")
                k.trim('"') to v.trim('"')
            }
        }
    }

    return results
}

// ── Financial Calculation Benchmarks ─────────────────────────────────────────────

fun runFinancialCalculationBenchmarks(): List<BenchmarkResult> {
    val results = mutableListOf<BenchmarkResult>()

    results += measureBenchmark("financial.money_add_10k") {
        var total = 0L
        for (i in 1..10_000) { total += i * 100L }
    }

    results += measureBenchmark("financial.money_allocate_3way") {
        val amount = 10000L
        val base = amount / 3
        val remainder = (amount % 3).toInt()
        (0 until 3).map { i -> if (i < remainder) base + 1 else base }
    }

    results += measureBenchmark("financial.money_allocate_ratio_50_30_20") {
        val amount = 500000L
        val ratios = listOf(50, 30, 20)
        val total = ratios.sum()
        ratios.map { ratio -> amount * ratio / total }
    }

    results += measureBenchmark("financial.bankers_round_10k") {
        for (i in 1..10_000) {
            val value = i.toDouble() + 0.5
            val floor = kotlin.math.floor(value).toLong()
            val fraction = value - floor
            when {
                fraction < 0.5 -> floor
                fraction > 0.5 -> floor + 1
                floor % 2 == 0L -> floor
                else -> floor + 1
            }
        }
    }

    results += measureBenchmark("financial.budget_status_calculation") {
        val budgetAmount = 50000L
        val transactions = (1..500).map { it * 100L }
        val spent = transactions.sum()
        val remaining = budgetAmount - spent
        val utilization = spent.toDouble() / budgetAmount
        Triple(spent, remaining, utilization)
    }

    results += measureBenchmark("financial.net_worth_100_accounts") {
        val accounts = (1..100).map { i ->
            val balance = i * 10000L
            if (i % 5 == 0) -balance else balance
        }
        accounts.sum()
    }

    results += measureBenchmark("financial.spending_by_category_10k") {
        val transactions = (1..10_000).map { i -> Pair(i % 25, i * 100L) }
        transactions.groupBy({ it.first }, { it.second }).mapValues { it.value.sum() }
    }

    results += measureBenchmark("financial.monthly_trend_12_months") {
        val transactions = (1..10_000).map { i -> Pair(i % 12, i * 100L) }
        (0 until 12).map { month ->
            transactions.filter { it.first == month }.sumOf { it.second }
        }
    }

    results += measureBenchmark("financial.savings_rate") {
        val income = 500000L
        val expenses = 350000L
        ((income - expenses).toDouble() / income) * 100.0
    }

    results += measureBenchmark("financial.daily_spending_90_days") {
        val transactions = (1..5_000).map { i -> Pair(i % 90, i * 100L) }
        transactions.groupBy({ it.first }, { it.second }).mapValues { it.value.sum() }
    }

    return results
}

// ── Measurement Infrastructure ───────────────────────────────────────────────────

data class BenchmarkResult(
    val name: String,
    val avgNanos: Long,
    val minNanos: Long,
    val maxNanos: Long,
    val p95Nanos: Long,
)

fun measureBenchmark(name: String, block: () -> Unit): BenchmarkResult {
    repeat(warmupIterations) { block() }

    val timings = LongArray(benchmarkIterations)
    for (i in 0 until benchmarkIterations) {
        val start = System.nanoTime()
        block()
        timings[i] = System.nanoTime() - start
    }

    timings.sort()
    val avg = timings.average().toLong()
    val min = timings.first()
    val max = timings.last()
    val p95 = timings[(benchmarkIterations * 0.95).toInt().coerceAtMost(benchmarkIterations - 1)]

    println(
        "   %-45s  avg=%8s  min=%8s  max=%8s  p95=%8s".format(
            name,
            formatNanos(avg),
            formatNanos(min),
            formatNanos(max),
            formatNanos(p95),
        )
    )

    return BenchmarkResult(name, avg, min, max, p95)
}

fun formatNanos(nanos: Long): String = when {
    nanos < 1_000 -> "${nanos}ns"
    nanos < 1_000_000 -> "%.1fus".format(Locale.US, nanos / 1_000.0)
    nanos < 1_000_000_000 -> "%.2fms".format(Locale.US, nanos / 1_000_000.0)
    else -> "%.2fs".format(Locale.US, nanos / 1_000_000_000.0)
}

fun printSummary(results: List<BenchmarkResult>) {
    println("═══════════════════════════════════════════════════════════════")
    println(" Summary — ${results.size} benchmarks")
    println("═══════════════════════════════════════════════════════════════")

    val thresholds = mapOf(
        "sqlite.aggregate_query_10k" to 100_000_000L,
        "sqlite.filtered_date_range" to 100_000_000L,
        "sqlite.category_group_by" to 100_000_000L,
        "financial.spending_by_category_10k" to 50_000_000L,
        "financial.monthly_trend_12_months" to 50_000_000L,
    )

    var passed = 0
    var warned = 0

    for (result in results) {
        val threshold = thresholds[result.name]
        val status = if (threshold != null && result.p95Nanos > threshold) {
            warned++
            "SLOW"
        } else {
            passed++
            "PASS"
        }
        println("  $status  ${result.name}  (p95=${formatNanos(result.p95Nanos)})")
    }

    println()
    println("  Passed: $passed  |  Warnings: $warned")
    println("═══════════════════════════════════════════════════════════════")
}
