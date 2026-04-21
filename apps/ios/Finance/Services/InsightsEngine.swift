// SPDX-License-Identifier: BUSL-1.1

// InsightsEngine.swift
// Finance
//
// On-device engine that analyses transactions, budgets, and goals to
// generate actionable financial insights. All computation happens locally
// (privacy-first, no server calls).
//
// References: #241

import Foundation
import os

// MARK: - InsightsEngineProtocol

/// Abstraction for the insights computation engine.
protocol InsightsEngineProtocol: Sendable {
    func generateInsights(
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem],
        currencyCode: String
    ) async -> InsightsSummary
}

// MARK: - InsightsEngine

/// Computes financial insights from local transaction data.
///
/// The engine performs:
/// 1. Spending breakdown by category
/// 2. Month-over-month trend analysis
/// 3. Savings rate calculation
/// 4. Category spike detection
/// 5. Budget performance scoring
/// 6. Actionable recommendations
final class InsightsEngine: InsightsEngineProtocol, @unchecked Sendable {

    static let shared = InsightsEngine()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "InsightsEngine"
    )

    // MARK: - Public API

    func generateInsights(
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem],
        currencyCode: String
    ) async -> InsightsSummary {
        let calendar = Calendar.current
        let now = Date()

        // Current month's transactions
        let thisMonth = transactions.filter {
            calendar.isDate($0.date, equalTo: now, toGranularity: .month)
        }

        // Last month's transactions
        let lastMonthDate = calendar.date(byAdding: .month, value: -1, to: now) ?? now
        let lastMonth = transactions.filter {
            calendar.isDate($0.date, equalTo: lastMonthDate, toGranularity: .month)
        }

        // Core metrics
        let totalSpending = thisMonth
            .filter { $0.type == .expense }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        let totalIncome = thisMonth
            .filter { $0.type == .income }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        let netCashFlow = totalIncome - totalSpending

        let savingsRate: Double = totalIncome > 0
            ? Double(netCashFlow) / Double(totalIncome) * 100.0
            : 0

        // Spending breakdown
        let breakdown = computeBreakdown(expenses: thisMonth.filter { $0.type == .expense })

        // Monthly trend (last 6 months)
        let trend = computeMonthlyTrend(transactions: transactions, months: 6)

        // Generate insights
        var insights: [FinancialInsight] = []

        insights.append(contentsOf: savingsRateInsights(savingsRate: savingsRate))
        insights.append(contentsOf: categorySpikes(
            thisMonth: thisMonth, lastMonth: lastMonth
        ))
        insights.append(contentsOf: budgetInsights(budgets: budgets))
        insights.append(contentsOf: monthOverMonthInsights(
            thisMonthSpending: totalSpending,
            lastMonthTransactions: lastMonth
        ))
        insights.append(contentsOf: goalInsights(goals: goals))

        // Sort by severity (critical first)
        let severityOrder: [InsightSeverity] = [.critical, .warning, .suggestion, .info]
        insights.sort { lhs, rhs in
            let lhsIndex = severityOrder.firstIndex(of: lhs.severity) ?? 0
            let rhsIndex = severityOrder.firstIndex(of: rhs.severity) ?? 0
            return lhsIndex < rhsIndex
        }

        Self.logger.debug(
            "Generated \(insights.count, privacy: .public) insights, savings rate: \(String(format: "%.1f", savingsRate), privacy: .public)%"
        )

        return InsightsSummary(
            totalSpendingMinorUnits: totalSpending,
            totalIncomeMinorUnits: totalIncome,
            netCashFlowMinorUnits: netCashFlow,
            savingsRatePercent: savingsRate,
            spendingBreakdown: breakdown,
            insights: insights,
            monthlySpendingTrend: trend,
            currencyCode: currencyCode
        )
    }

    // MARK: - Breakdown

    private func computeBreakdown(expenses: [TransactionItem]) -> [SpendingBreakdown] {
        let grouped = Dictionary(grouping: expenses) { $0.category }
        let total = expenses.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        guard total > 0 else { return [] }

        let colors = FinanceColors.chart
        return grouped
            .map { (category, txns) in
                let amount = txns.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
                return (category: category, amount: amount)
            }
            .sorted { $0.amount > $1.amount }
            .enumerated()
            .map { index, item in
                SpendingBreakdown(
                    categoryName: item.category,
                    categoryIcon: iconForCategory(item.category),
                    amountMinorUnits: item.amount,
                    percentOfTotal: Double(item.amount) / Double(total) * 100,
                    color: colors[index % colors.count]
                )
            }
    }

    // MARK: - Monthly Trend

    private func computeMonthlyTrend(
        transactions: [TransactionItem],
        months: Int
    ) -> [MonthlyAmount] {
        let calendar = Calendar.current
        let now = Date()

        return (0..<months).compactMap { offset in
            guard let month = calendar.date(byAdding: .month, value: -offset, to: now) else {
                return nil
            }
            let spending = transactions
                .filter {
                    $0.type == .expense &&
                    calendar.isDate($0.date, equalTo: month, toGranularity: .month)
                }
                .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

            return MonthlyAmount(month: month, amountMinorUnits: spending)
        }
        .reversed()
    }

    // MARK: - Insight Generators

    private func savingsRateInsights(savingsRate: Double) -> [FinancialInsight] {
        if savingsRate >= 20 {
            return [FinancialInsight(
                type: .savingsOpportunity,
                severity: .info,
                title: String(localized: "Great Savings Rate"),
                description: String(localized: "You're saving \(String(format: "%.0f", savingsRate))% of your income this month — above the recommended 20%. Keep it up!"),
                percentChange: savingsRate
            )]
        } else if savingsRate >= 0 {
            return [FinancialInsight(
                type: .savingsOpportunity,
                severity: .suggestion,
                title: String(localized: "Boost Your Savings"),
                description: String(localized: "Your savings rate is \(String(format: "%.0f", savingsRate))%. Aim for 20% — even small increases compound significantly over time."),
                percentChange: savingsRate
            )]
        } else {
            return [FinancialInsight(
                type: .savingsOpportunity,
                severity: .warning,
                title: String(localized: "Spending Exceeds Income"),
                description: String(localized: "You're spending more than you earn this month. Review your expenses and identify areas to cut back."),
                percentChange: savingsRate
            )]
        }
    }

    private func categorySpikes(
        thisMonth: [TransactionItem],
        lastMonth: [TransactionItem]
    ) -> [FinancialInsight] {
        let thisGrouped = Dictionary(grouping: thisMonth.filter { $0.type == .expense }) { $0.category }
        let lastGrouped = Dictionary(grouping: lastMonth.filter { $0.type == .expense }) { $0.category }

        var insights: [FinancialInsight] = []

        for (category, txns) in thisGrouped {
            let thisTotal = txns.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
            let lastTotal = (lastGrouped[category] ?? [])
                .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

            guard lastTotal > 0 else { continue }

            let change = Double(thisTotal - lastTotal) / Double(lastTotal) * 100

            if change > 50 {
                insights.append(FinancialInsight(
                    type: .categorySpike,
                    severity: change > 100 ? .warning : .suggestion,
                    title: String(localized: "\(category) Spending Up \(String(format: "%.0f", change))%"),
                    description: String(localized: "Your spending in \(category) has increased significantly compared to last month. Review recent transactions to ensure this is intentional."),
                    percentChange: change,
                    relatedCategory: category
                ))
            }
        }

        return insights
    }

    private func budgetInsights(budgets: [BudgetItem]) -> [FinancialInsight] {
        var insights: [FinancialInsight] = []

        let overBudget = budgets.filter { $0.progress >= 1.0 }
        if !overBudget.isEmpty {
            insights.append(FinancialInsight(
                type: .budgetPerformance,
                severity: .warning,
                title: String(localized: "\(overBudget.count) Budget\(overBudget.count == 1 ? "" : "s") Exceeded"),
                description: String(localized: "You've exceeded your limit in \(overBudget.map(\.name).joined(separator: ", ")). Consider adjusting your budget or reducing spending.")
            ))
        }

        let onTrack = budgets.filter { $0.progress < 0.75 }
        if !onTrack.isEmpty && overBudget.isEmpty {
            insights.append(FinancialInsight(
                type: .budgetPerformance,
                severity: .info,
                title: String(localized: "Budgets on Track"),
                description: String(localized: "All your budgets are within healthy limits. Great discipline!")
            ))
        }

        return insights
    }

    private func monthOverMonthInsights(
        thisMonthSpending: Int64,
        lastMonthTransactions: [TransactionItem]
    ) -> [FinancialInsight] {
        let lastMonthSpending = lastMonthTransactions
            .filter { $0.type == .expense }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        guard lastMonthSpending > 0 else { return [] }

        let change = Double(thisMonthSpending - lastMonthSpending) / Double(lastMonthSpending) * 100

        if abs(change) > 10 {
            return [FinancialInsight(
                type: .monthOverMonth,
                severity: change > 20 ? .warning : .info,
                title: change > 0
                    ? String(localized: "Spending Up \(String(format: "%.0f", change))% vs Last Month")
                    : String(localized: "Spending Down \(String(format: "%.0f", abs(change)))% vs Last Month"),
                description: change > 0
                    ? String(localized: "Your spending is trending higher this month. Review your largest categories for potential savings.")
                    : String(localized: "You've reduced spending compared to last month. Great progress on financial discipline!"),
                percentChange: change
            )]
        }

        return []
    }

    private func goalInsights(goals: [GoalItem]) -> [FinancialInsight] {
        var insights: [FinancialInsight] = []

        let activeGoals = goals.filter { $0.status == .active }
        for goal in activeGoals {
            if goal.progress >= 0.9 && goal.progress < 1.0 {
                insights.append(FinancialInsight(
                    type: .savingsOpportunity,
                    severity: .info,
                    title: String(localized: "\"\(goal.name)\" Nearly Complete"),
                    description: String(localized: "You're \(String(format: "%.0f", goal.progress * 100))% of the way to your goal. A final push will get you there!"),
                    percentChange: goal.progress * 100
                ))
            }
        }

        return insights
    }

    // MARK: - Helpers

    private func iconForCategory(_ name: String) -> String {
        let mapping: [String: String] = [
            "Groceries": "cart", "Dining Out": "fork.knife",
            "Transport": "car", "Entertainment": "film",
            "Shopping": "bag", "Utilities": "bolt",
            "Health": "heart", "Housing": "house",
            "Travel": "airplane", "Education": "book",
            "Income": "arrow.down.left", "Transfer": "arrow.left.arrow.right",
        ]
        return mapping[name] ?? "creditcard"
    }
}
