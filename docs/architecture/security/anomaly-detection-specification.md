<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Anomaly Detection for Unusual Transactions — Finance App

**Issue:** #323
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Implementation Specification
**MASVS Control:** MASVS-CODE, Financial Application Security

---

## Executive Summary

Anomaly detection for the Finance app identifies unusual transaction patterns that
may indicate account compromise, unauthorized access, or erroneous data entry. This
specification defines a **privacy-preserving, client-side** approach where all anomaly
detection logic runs locally on the user's device — no transaction data is ever sent
to external services or analyzed server-side beyond what the sync engine already requires.

### Design Principles

1. **All processing client-side** — anomaly detection runs in KMP shared code on the
   user's device. No financial data leaves the device for anomaly analysis.
2. **No data exfiltration** — anomaly alerts are local notifications only. No financial
   amounts, payees, or patterns are sent to any telemetry or monitoring service.
3. **User-configurable** — all thresholds are customizable by the user in settings.
4. **No false sense of security** — this is a user-facing feature, not a fraud
   prevention system. Users are informed that Finance is not a fraud detection service.
5. **Privacy-first** — even aggregate anomaly statistics (e.g., "3 anomalies this month")
   are NOT sent to any server or included in crash reports.

---

## Anomaly Detection Rules

### Rule 1: Unusual Transaction Amount

**Trigger:** A transaction amount exceeds the user's historical pattern for that
category or account.

```kotlin
/**
 * Detect transactions with unusual amounts.
 *
 * Uses a rolling statistical model (mean + standard deviation) of
 * the user's transaction amounts within the same category over the
 * past 90 days. Transactions exceeding the threshold are flagged.
 *
 * PRIVACY: All computation is local. No financial amounts are
 * transmitted anywhere.
 */
class AmountAnomalyDetector(
    private val lookbackDays: Int = 90,
    private val stdDevMultiplier: Double = 3.0,
) : AnomalyDetector {

    override suspend fun analyze(
        transaction: Transaction,
        history: List<Transaction>,
    ): AnomalyResult {
        val categoryHistory = history
            .filter { it.categoryId == transaction.categoryId }
            .filter { it.date >= transaction.date.minusDays(lookbackDays) }
            .map { it.amountCents.toDouble() }

        if (categoryHistory.size < 5) {
            // Insufficient history — cannot determine anomaly
            return AnomalyResult.InsufficientData
        }

        val mean = categoryHistory.average()
        val stdDev = categoryHistory.standardDeviation()
        val threshold = mean + (stdDev * stdDevMultiplier)

        return if (transaction.amountCents > threshold) {
            AnomalyResult.Flagged(
                rule = "unusual_amount",
                severity = AnomalySeverity.MEDIUM,
                message = "This transaction amount is unusually high for this category",
                // NEVER include actual amounts in the anomaly result
            )
        } else {
            AnomalyResult.Normal
        }
    }
}
```

### Rule 2: Unusual Transaction Frequency

**Trigger:** The number of transactions within a time window exceeds the user's
normal pattern.

```kotlin
/**
 * Detect unusual transaction frequency (velocity check).
 *
 * Flags when the number of transactions in the current day/hour
 * significantly exceeds the user's historical average.
 */
class FrequencyAnomalyDetector(
    private val lookbackDays: Int = 30,
    private val dailyMultiplier: Double = 3.0,
    private val hourlyMultiplier: Double = 5.0,
) : AnomalyDetector {

    override suspend fun analyze(
        transaction: Transaction,
        history: List<Transaction>,
    ): AnomalyResult {
        val recentHistory = history
            .filter { it.date >= transaction.date.minusDays(lookbackDays) }

        // Daily frequency check
        val avgDailyCount = recentHistory.size.toDouble() / lookbackDays
        val todayCount = history.count { it.date == transaction.date }

        if (todayCount > avgDailyCount * dailyMultiplier && todayCount >= 5) {
            return AnomalyResult.Flagged(
                rule = "high_frequency",
                severity = AnomalySeverity.LOW,
                message = "Unusually high number of transactions today",
            )
        }

        return AnomalyResult.Normal
    }
}
```

### Rule 3: New Payee with Large Amount

**Trigger:** A transaction to a never-before-seen payee with an amount above the
user's median transaction amount.

```kotlin
/**
 * Detect large transactions to new payees.
 *
 * First-time payees with above-median amounts may indicate
 * a compromised account making unauthorized transfers.
 */
class NewPayeeAnomalyDetector : AnomalyDetector {

    override suspend fun analyze(
        transaction: Transaction,
        history: List<Transaction>,
    ): AnomalyResult {
        val knownPayees = history.map { it.payee.lowercase() }.toSet()
        val isNewPayee = transaction.payee.lowercase() !in knownPayees

        if (!isNewPayee) return AnomalyResult.Normal

        val medianAmount = history
            .map { it.amountCents }
            .sorted()
            .let { sorted ->
                if (sorted.isEmpty()) return AnomalyResult.InsufficientData
                sorted[sorted.size / 2]
            }

        return if (transaction.amountCents > medianAmount * 2) {
            AnomalyResult.Flagged(
                rule = "new_payee_large_amount",
                severity = AnomalySeverity.MEDIUM,
                message = "Large transaction to a new payee",
            )
        } else {
            AnomalyResult.Normal
        }
    }
}
```

### Rule 4: Unusual Time-of-Day

**Trigger:** A transaction is created at an unusual time for the user.

```kotlin
/**
 * Detect transactions at unusual times.
 *
 * If the user typically makes transactions between 8am-10pm and
 * a transaction appears at 3am, it may indicate unauthorized access
 * or a scheduled transaction processing at an unexpected time.
 */
class TimeAnomalyDetector(
    private val lookbackDays: Int = 60,
    private val unusualHourThreshold: Double = 0.02, // < 2% of transactions at this hour
) : AnomalyDetector {

    override suspend fun analyze(
        transaction: Transaction,
        history: List<Transaction>,
    ): AnomalyResult {
        if (history.size < 20) return AnomalyResult.InsufficientData

        val hourDistribution = history
            .groupBy { it.createdAt.hour }
            .mapValues { (_, txns) -> txns.size.toDouble() / history.size }

        val transactionHour = transaction.createdAt.hour
        val hourFrequency = hourDistribution[transactionHour] ?: 0.0

        return if (hourFrequency < unusualHourThreshold) {
            AnomalyResult.Flagged(
                rule = "unusual_time",
                severity = AnomalySeverity.LOW,
                message = "Transaction at an unusual time of day",
            )
        } else {
            AnomalyResult.Normal
        }
    }
}
```

### Rule 5: Duplicate Transaction Detection

**Trigger:** A transaction with the same amount, payee, and date as an existing
transaction (potential double-charge).

```kotlin
/**
 * Detect potential duplicate transactions.
 *
 * Flags transactions that match an existing transaction's amount,
 * payee, and date — which may indicate a double-charge or sync error.
 */
class DuplicateAnomalyDetector(
    private val timezoneToleranceMinutes: Int = 5,
) : AnomalyDetector {

    override suspend fun analyze(
        transaction: Transaction,
        history: List<Transaction>,
    ): AnomalyResult {
        val duplicates = history.filter { existing ->
            existing.id != transaction.id &&
            existing.amountCents == transaction.amountCents &&
            existing.payee.equals(transaction.payee, ignoreCase = true) &&
            existing.date == transaction.date
        }

        return if (duplicates.isNotEmpty()) {
            AnomalyResult.Flagged(
                rule = "potential_duplicate",
                severity = AnomalySeverity.MEDIUM,
                message = "This transaction may be a duplicate",
            )
        } else {
            AnomalyResult.Normal
        }
    }
}
```

---

## Anomaly Engine Architecture

### KMP Shared Interface

```kotlin
/**
 * Core anomaly detection engine.
 *
 * Runs all configured detectors against new transactions.
 * ALL processing is local — no data leaves the device.
 */
interface AnomalyDetector {
    suspend fun analyze(
        transaction: Transaction,
        history: List<Transaction>,
    ): AnomalyResult
}

sealed class AnomalyResult {
    object Normal : AnomalyResult()
    object InsufficientData : AnomalyResult()
    data class Flagged(
        val rule: String,
        val severity: AnomalySeverity,
        val message: String,
    ) : AnomalyResult()
}

enum class AnomalySeverity { LOW, MEDIUM, HIGH }

/**
 * Orchestrates multiple anomaly detectors.
 *
 * Returns the highest-severity result across all detectors.
 */
class AnomalyEngine(
    private val detectors: List<AnomalyDetector>,
) {
    suspend fun analyzeTransaction(
        transaction: Transaction,
        history: List<Transaction>,
    ): List<AnomalyResult.Flagged> {
        return detectors
            .map { it.analyze(transaction, history) }
            .filterIsInstance<AnomalyResult.Flagged>()
    }
}
```

### Integration Points

1. **On transaction create/sync:** Run anomaly engine on each new transaction
2. **Local notification:** Show an in-app alert for flagged transactions
3. **Transaction list UI:** Display anomaly badge on flagged transactions
4. **Settings:** Allow users to configure thresholds and enable/disable rules

### What Is NOT Sent to Server

- ❌ Individual anomaly results
- ❌ Transaction amounts or patterns
- ❌ Anomaly rule triggers
- ❌ Statistical models or thresholds
- ❌ Any financial data derived from anomaly analysis

### What MAY Be Sent (with consent, anonymized)

- ✅ Anonymous count: "anomaly_checks_performed: 47" (MetricsCollector, consent-gated)
- ✅ Feature usage: "anomaly_detection_enabled: true" (settings sync, non-financial)

---

## Privacy Impact Assessment

| Data Element        | Collected           | Stored                | Transmitted          | Justification         |
| ------------------- | ------------------- | --------------------- | -------------------- | --------------------- |
| Transaction amounts | Read (for analysis) | Not separately stored | Never                | Analysis input        |
| Statistical models  | Computed            | In-memory only        | Never                | Ephemeral computation |
| Anomaly flags       | Generated           | Local DB only         | Never                | User-facing alerts    |
| Thresholds          | User-configured     | Local settings        | Sync (non-financial) | User preference       |
| Detection metrics   | Anonymous counts    | In-memory             | With consent only    | Product improvement   |

**GDPR Compliance:**

- Processing basis: Legitimate interest (security of processing, Art. 32)
- Data minimization: Only reads existing transaction data, creates no new PII
- Right to erasure: Anomaly flags deleted with transactions (cascade)
- Transparency: Feature documented in privacy policy

**CCPA Compliance:**

- No sale or sharing of financial data
- No new data collection — analysis of existing local data only

---

## Recommendations

| Priority | Action                                                 | Effort |
| -------- | ------------------------------------------------------ | ------ |
| P1       | Implement AnomalyDetector interface in KMP shared code | 2 days |
| P1       | Amount anomaly detector (Rule 1)                       | 1 day  |
| P1       | Duplicate transaction detector (Rule 5)                | 1 day  |
| P2       | Frequency detector (Rule 2)                            | 1 day  |
| P2       | New payee detector (Rule 3)                            | 1 day  |
| P2       | Time-of-day detector (Rule 4)                          | 1 day  |
| P2       | Settings UI for threshold configuration                | 2 days |
| P3       | In-app notification for flagged transactions           | 2 days |
| P3       | Transaction list anomaly badges                        | 1 day  |

---

## References

- OWASP MASVS v2: MASVS-CODE (Code Quality and Security)
- NIST SP 800-83: Malware Incident Prevention and Handling (anomaly detection principles)
- PCI DSS v4.0: Requirement 10 (Log and Monitor All Access)
- GDPR Article 32: Security of Processing
- GDPR Article 35: Data Protection Impact Assessment
