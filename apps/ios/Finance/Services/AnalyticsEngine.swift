// SPDX-License-Identifier: BUSL-1.1

// AnalyticsEngine.swift
// Finance
//
// On-device analytics engine that computes trend predictions, detects
// spending anomalies, and generates category insights. All computation
// is performed locally — no data leaves the device.
//
// Uses actor isolation for thread safety and structured concurrency
// for parallel analysis of independent metrics.
//
// References: #269

import Foundation
import os

// MARK: - Analytics Engine Protocol

/// Contract for the analytics computation engine.
protocol AnalyticsEngineProtocol: Sendable {
    /// Computes a full analytics summary from transaction history.
    func computeSummary(
        transactions: [TransactionItem],
        accounts: [AccountItem],
        period: AnalyticsPeriod,
        currencyCode: String
    ) async -> AnalyticsSummary

    /// Generates spending predictions for the next N months.
    func predictSpending(
        transactions: [TransactionItem],
        monthsAhead: Int
    ) -> [TrendPrediction]

    /// Detects anomalies in recent spending vs historical patterns.
    func detectAnomalies(
        transactions: [TransactionItem],
        period: AnalyticsPeriod
    ) -> [SpendingAnomaly]

    /// Computes per-category spending trends.
    func categoryTrends(
        transactions: [TransactionItem],
        period: AnalyticsPeriod
    ) -> [CategoryTrend]
}

// MARK: - Analytics Engine

/// Actor-isolated engine for on-device financial analytics.
///
/// Performs all computation locally using simple linear regression
/// for predictions and statistical deviation for anomaly detection.
/// Privacy-first: no data is transmitted externally.
actor AnalyticsEngine: AnalyticsEngineProtocol {

    static let shared = AnalyticsEngine()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AnalyticsEngine"
    )

    // MARK: - Summary

    func computeSummary(
        transactions: [TransactionItem],
        accounts: [AccountItem],
        period: AnalyticsPeriod,
        currencyCode: String
    ) async -> AnalyticsSummary {
        let filtered = filterByPeriod(transactions, period: period)
        let calendar = Calendar.current
        let now = Date.now

        // Compute in parallel using structured concurrency
        async let trends = categoryTrends(transactions: filtered, period: period)
        async let anomalies = detectAnomalies(transactions: filtered, period: period)
        async let predictions = predictSpending(transactions: filtered, monthsAhead: 3)

        let monthlyGroups = groupByMonth(filtered, calendar: calendar)
        let monthCount = max(monthlyGroups.count, 1)

        let totalExpenses = filtered
            .filter { $0.type == .expense }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        let totalIncome = filtered
            .filter { $0.type == .income }
            .reduce(Int64(0)) { $0 + $1.amountMinorUnits }

        let avgMonthlySpending = totalExpenses / Int64(monthCount)
        let avgMonthlyIncome = totalIncome / Int64(monthCount)

        // Project current month spending
        let startOfMonth = calendar.date(
            from: calendar.dateComponents([.year, .month], from: now)
        ) ?? now
        let currentMonthExpenses = filtered
            .filter { $0.type == .expense && $0.date >= startOfMonth }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        let dayOfMonth = calendar.component(.day, from: now)
        let daysInMonth = calendar.range(of: .day, in: .month, for: now)?.count ?? 30
        let projectedSpending = daysInMonth > 0
            ? currentMonthExpenses * Int64(daysInMonth) / max(Int64(dayOfMonth), 1)
            : currentMonthExpenses

        let savingsRate: Double = avgMonthlyIncome > 0
            ? Double(avgMonthlyIncome - avgMonthlySpending) / Double(avgMonthlyIncome) * 100.0
            : 0

        let resolvedTrends = await trends
        let resolvedAnomalies = await anomalies
        let resolvedPredictions = await predictions

        Self.logger.debug(
            "Analytics summary computed: \(resolvedTrends.count, privacy: .public) categories, "
            + "\(resolvedAnomalies.count, privacy: .public) anomalies, "
            + "\(resolvedPredictions.count, privacy: .public) predictions"
        )

        return AnalyticsSummary(
            averageMonthlySpending: avgMonthlySpending,
            averageMonthlyIncome: avgMonthlyIncome,
            projectedMonthEndSpending: projectedSpending,
            savingsRatePercent: savingsRate,
            topCategories: resolvedTrends,
            anomalies: resolvedAnomalies,
            predictions: resolvedPredictions,
            currencyCode: currencyCode
        )
    }

    // MARK: - Predictions (Linear Regression)

    func predictSpending(
        transactions: [TransactionItem],
        monthsAhead: Int
    ) -> [TrendPrediction] {
        let calendar = Calendar.current
        let monthlyTotals = monthlyExpenseTotals(transactions, calendar: calendar)

        guard monthlyTotals.count >= 2 else {
            Self.logger.debug("Insufficient data for prediction (\(monthlyTotals.count) months)")
            return []
        }

        // Simple linear regression: y = mx + b
        let n = Double(monthlyTotals.count)
        let xs = (0..<monthlyTotals.count).map { Double($0) }
        let ys = monthlyTotals.map { Double($0.amount) }

        let sumX = xs.reduce(0, +)
        let sumY = ys.reduce(0, +)
        let sumXY = zip(xs, ys).reduce(0) { $0 + $1.0 * $1.1 }
        let sumX2 = xs.reduce(0) { $0 + $1 * $1 }

        let denominator = n * sumX2 - sumX * sumX
        guard denominator != 0 else { return [] }

        let slope = (n * sumXY - sumX * sumY) / denominator
        let intercept = (sumY - slope * sumX) / n

        // Standard error for confidence intervals
        let predictions = ys.enumerated().map { i, y in y - (slope * Double(i) + intercept) }
        let residualSumSquares = predictions.reduce(0) { $0 + $1 * $1 }
        let standardError = sqrt(residualSumSquares / max(n - 2, 1))

        let lastDate = monthlyTotals.last?.month ?? Date.now

        return (1...monthsAhead).compactMap { offset in
            let x = Double(monthlyTotals.count - 1 + offset)
            let predicted = slope * x + intercept
            let margin = 1.96 * standardError // 95% confidence

            guard let futureDate = calendar.date(byAdding: .month, value: offset, to: lastDate)
            else { return nil }

            let confidence = max(0, min(100, 95.0 - Double(offset) * 5.0))

            return TrendPrediction(
                date: futureDate,
                predictedMinorUnits: Int64(max(0, predicted)),
                upperBoundMinorUnits: Int64(max(0, predicted + margin)),
                lowerBoundMinorUnits: Int64(max(0, predicted - margin)),
                confidencePercent: confidence
            )
        }
    }

    // MARK: - Anomaly Detection

    func detectAnomalies(
        transactions: [TransactionItem],
        period: AnalyticsPeriod
    ) -> [SpendingAnomaly] {
        let calendar = Calendar.current
        let expenses = transactions.filter { $0.type == .expense }
        let byCategory = Dictionary(grouping: expenses) { $0.category }

        var anomalies: [SpendingAnomaly] = []

        for (category, categoryTransactions) in byCategory {
            let monthlyAmounts = monthlyAmountsForTransactions(categoryTransactions, calendar: calendar)
            guard monthlyAmounts.count >= 3 else { continue }

            let amounts = monthlyAmounts.map { Double(abs($0.amount)) }
            let mean = amounts.reduce(0, +) / Double(amounts.count)
            let variance = amounts.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(amounts.count)
            let stdDev = sqrt(variance)

            guard stdDev > 0 else { continue }

            // Check the most recent month
            if let latest = monthlyAmounts.last {
                let deviation = (Double(abs(latest.amount)) - mean) / stdDev
                if abs(deviation) >= 1.5 {
                    anomalies.append(SpendingAnomaly(
                        category: category,
                        date: latest.month,
                        actualMinorUnits: abs(latest.amount),
                        expectedMinorUnits: Int64(mean),
                        deviationFactor: abs(deviation)
                    ))
                }
            }
        }

        return anomalies.sorted { $0.deviationFactor > $1.deviationFactor }
    }

    // MARK: - Category Trends

    func categoryTrends(
        transactions: [TransactionItem],
        period: AnalyticsPeriod
    ) -> [CategoryTrend] {
        let calendar = Calendar.current
        let expenses = transactions.filter { $0.type == .expense }
        let byCategory = Dictionary(grouping: expenses) { $0.category }

        return byCategory.compactMap { category, categoryTransactions in
            let monthly = monthlyAmountsForTransactions(categoryTransactions, calendar: calendar)
            guard !monthly.isEmpty else { return nil }

            let totalAmount = monthly.reduce(Int64(0)) { $0 + abs($1.amount) }
            let average = totalAmount / Int64(max(monthly.count, 1))

            let momChange: Double
            if monthly.count >= 2 {
                let current = Double(abs(monthly[monthly.count - 1].amount))
                let previous = Double(abs(monthly[monthly.count - 2].amount))
                momChange = previous > 0 ? ((current - previous) / previous) * 100 : 0
            } else {
                momChange = 0
            }

            let icon = categoryTransactions.first.map { _ in "tag" } ?? "tag"

            return CategoryTrend(
                categoryName: category,
                categoryIcon: icon,
                monthlyAmounts: monthly.map { MonthlyAmount(month: $0.month, amountMinorUnits: abs($0.amount)) },
                averageMinorUnits: average,
                monthOverMonthChangePercent: momChange
            )
        }
        .sorted { $0.averageMinorUnits > $1.averageMinorUnits }
    }

    // MARK: - Helpers

    private func filterByPeriod(
        _ transactions: [TransactionItem],
        period: AnalyticsPeriod
    ) -> [TransactionItem] {
        guard let monthCount = period.monthCount else { return transactions }
        let calendar = Calendar.current
        guard let cutoff = calendar.date(byAdding: .month, value: -monthCount, to: Date.now)
        else { return transactions }
        return transactions.filter { $0.date >= cutoff }
    }

    private struct MonthTotal {
        let month: Date
        let amount: Int64
    }

    private func groupByMonth(
        _ transactions: [TransactionItem],
        calendar: Calendar
    ) -> [Date: [TransactionItem]] {
        Dictionary(grouping: transactions) { tx in
            calendar.date(from: calendar.dateComponents([.year, .month], from: tx.date)) ?? tx.date
        }
    }

    private func monthlyExpenseTotals(
        _ transactions: [TransactionItem],
        calendar: Calendar
    ) -> [MonthTotal] {
        let expenses = transactions.filter { $0.type == .expense }
        let grouped = groupByMonth(expenses, calendar: calendar)

        return grouped.map { month, txns in
            MonthTotal(month: month, amount: txns.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) })
        }
        .sorted { $0.month < $1.month }
    }

    private func monthlyAmountsForTransactions(
        _ transactions: [TransactionItem],
        calendar: Calendar
    ) -> [MonthTotal] {
        let grouped = groupByMonth(transactions, calendar: calendar)
        return grouped.map { month, txns in
            MonthTotal(month: month, amount: txns.reduce(Int64(0)) { $0 + $1.amountMinorUnits })
        }
        .sorted { $0.month < $1.month }
    }
}
