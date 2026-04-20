// SPDX-License-Identifier: BUSL-1.1

// HealthScoreEngine.swift
// Finance
//
// On-device engine for computing the financial health score.
// Analyses savings rate, budget adherence, debt-to-asset ratio,
// emergency fund coverage, and goal progress to produce a
// composite score with actionable recommendations.
//
// All computation is local — no data leaves the device.
//
// References: #299

import Foundation
import os

// MARK: - Health Score Engine Protocol

/// Contract for financial health score computation.
protocol HealthScoreEngineProtocol: Sendable {
    /// Computes the financial health score from user data.
    func computeScore(
        accounts: [AccountItem],
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem]
    ) async -> FinancialHealthScore
}

// MARK: - Health Score Engine

/// Actor-isolated engine for on-device financial health scoring.
actor HealthScoreEngine: HealthScoreEngineProtocol {

    static let shared = HealthScoreEngine()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "HealthScoreEngine"
    )

    // MARK: - Score Computation

    func computeScore(
        accounts: [AccountItem],
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem]
    ) async -> FinancialHealthScore {
        let savingsComponent = computeSavingsRate(transactions: transactions)
        let budgetComponent = computeBudgetAdherence(budgets: budgets)
        let debtComponent = computeDebtRatio(accounts: accounts)
        let emergencyComponent = computeEmergencyFund(accounts: accounts, transactions: transactions)
        let goalComponent = computeGoalProgress(goals: goals)

        let components = [savingsComponent, budgetComponent, debtComponent, emergencyComponent, goalComponent]

        let weightedSum = components.reduce(0.0) { sum, comp in
            sum + Double(comp.score) * comp.weight
        }
        let totalWeight = components.reduce(0.0) { $0 + $1.weight }
        let overallScore = totalWeight > 0 ? Int(weightedSum / totalWeight) : 0

        let tips = generateTips(components: components, accounts: accounts, budgets: budgets, goals: goals)
        let benchmark = generateBenchmark(score: overallScore)

        Self.logger.debug(
            "Health score computed: \(overallScore, privacy: .public) "
            + "(\(components.map { "\($0.name):\($0.score)" }.joined(separator: ", "), privacy: .public))"
        )

        return FinancialHealthScore(
            overallScore: overallScore,
            components: components,
            tips: tips,
            benchmark: benchmark
        )
    }

    // MARK: - Component: Savings Rate

    private func computeSavingsRate(transactions: [TransactionItem]) -> HealthScoreComponent {
        let calendar = Calendar.current
        let now = Date.now
        let threeMonthsAgo = calendar.date(byAdding: .month, value: -3, to: now) ?? now

        let recent = transactions.filter { $0.date >= threeMonthsAgo }
        let income = recent.filter { $0.type == .income }
            .reduce(Int64(0)) { $0 + $1.amountMinorUnits }
        let expenses = recent.filter { $0.type == .expense }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        let savingsRate: Double = income > 0
            ? Double(income - expenses) / Double(income) * 100
            : 0

        let score: Int
        switch savingsRate {
        case 30...: score = 100
        case 20..<30: score = 85
        case 15..<20: score = 70
        case 10..<15: score = 55
        case 5..<10: score = 40
        case 0..<5: score = 25
        default: score = 10
        }

        return HealthScoreComponent(
            id: "savings_rate",
            name: String(localized: "Savings Rate"),
            score: score,
            maxScore: 100,
            weight: 0.25,
            description: String(localized: "Your 3-month savings rate is \(String(format: "%.1f", savingsRate))%"),
            systemImage: "leaf"
        )
    }

    // MARK: - Component: Budget Adherence

    private func computeBudgetAdherence(budgets: [BudgetItem]) -> HealthScoreComponent {
        guard !budgets.isEmpty else {
            return HealthScoreComponent(
                id: "budget_adherence",
                name: String(localized: "Budget Adherence"),
                score: 50,
                maxScore: 100,
                weight: 0.20,
                description: String(localized: "No budgets set up yet"),
                systemImage: "chart.pie"
            )
        }

        let withinBudget = budgets.filter { $0.progress <= 1.0 }.count
        let adherenceRate = Double(withinBudget) / Double(budgets.count) * 100

        let score: Int
        switch adherenceRate {
        case 90...: score = 100
        case 75..<90: score = 80
        case 60..<75: score = 60
        case 40..<60: score = 40
        default: score = 20
        }

        return HealthScoreComponent(
            id: "budget_adherence",
            name: String(localized: "Budget Adherence"),
            score: score,
            maxScore: 100,
            weight: 0.20,
            description: String(localized: "\(withinBudget) of \(budgets.count) budgets within limits"),
            systemImage: "chart.pie"
        )
    }

    // MARK: - Component: Debt-to-Asset Ratio

    private func computeDebtRatio(accounts: [AccountItem]) -> HealthScoreComponent {
        let assets = accounts
            .filter { $0.type != .creditCard && $0.type != .loan && $0.balanceMinorUnits > 0 }
            .reduce(Int64(0)) { $0 + $1.balanceMinorUnits }

        let debt = accounts
            .filter { $0.type == .creditCard || $0.type == .loan }
            .reduce(Int64(0)) { $0 + abs($1.balanceMinorUnits) }

        let ratio: Double = assets > 0 ? Double(debt) / Double(assets) * 100 : (debt > 0 ? 100 : 0)

        let score: Int
        switch ratio {
        case 0..<10: score = 100
        case 10..<25: score = 85
        case 25..<50: score = 65
        case 50..<75: score = 45
        case 75..<100: score = 25
        default: score = 10
        }

        return HealthScoreComponent(
            id: "debt_ratio",
            name: String(localized: "Debt-to-Asset Ratio"),
            score: score,
            maxScore: 100,
            weight: 0.20,
            description: String(localized: "Debt is \(String(format: "%.1f", ratio))% of assets"),
            systemImage: "percent"
        )
    }

    // MARK: - Component: Emergency Fund

    private func computeEmergencyFund(
        accounts: [AccountItem],
        transactions: [TransactionItem]
    ) -> HealthScoreComponent {
        let calendar = Calendar.current
        let now = Date.now
        let threeMonthsAgo = calendar.date(byAdding: .month, value: -3, to: now) ?? now

        let monthlyExpenses: Int64 = {
            let recent = transactions.filter { $0.type == .expense && $0.date >= threeMonthsAgo }
            let total = recent.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
            return total / 3
        }()

        let savingsBalance = accounts
            .filter { $0.type == .savings }
            .reduce(Int64(0)) { $0 + $1.balanceMinorUnits }

        let monthsCovered: Double = monthlyExpenses > 0
            ? Double(savingsBalance) / Double(monthlyExpenses)
            : 0

        let score: Int
        switch monthsCovered {
        case 6...: score = 100
        case 4..<6: score = 80
        case 3..<4: score = 65
        case 1..<3: score = 40
        case 0..<1: score = 20
        default: score = 0
        }

        return HealthScoreComponent(
            id: "emergency_fund",
            name: String(localized: "Emergency Fund"),
            score: score,
            maxScore: 100,
            weight: 0.20,
            description: String(localized: "\(String(format: "%.1f", monthsCovered)) months of expenses covered"),
            systemImage: "shield"
        )
    }

    // MARK: - Component: Goal Progress

    private func computeGoalProgress(goals: [GoalItem]) -> HealthScoreComponent {
        let activeGoals = goals.filter { $0.status == .active }

        guard !activeGoals.isEmpty else {
            return HealthScoreComponent(
                id: "goal_progress",
                name: String(localized: "Goal Progress"),
                score: 50,
                maxScore: 100,
                weight: 0.15,
                description: String(localized: "No active goals"),
                systemImage: "target"
            )
        }

        let avgProgress = activeGoals.reduce(0.0) { $0 + $1.progress } / Double(activeGoals.count)
        let score = min(100, Int(avgProgress * 100))

        return HealthScoreComponent(
            id: "goal_progress",
            name: String(localized: "Goal Progress"),
            score: score,
            maxScore: 100,
            weight: 0.15,
            description: String(localized: "Average \(String(format: "%.0f", avgProgress * 100))% across \(activeGoals.count) goals"),
            systemImage: "target"
        )
    }

    // MARK: - Tips Generation

    private func generateTips(
        components: [HealthScoreComponent],
        accounts: [AccountItem],
        budgets: [BudgetItem],
        goals: [GoalItem]
    ) -> [HealthTip] {
        var tips: [HealthTip] = []

        for component in components where component.percentage < 70 {
            switch component.id {
            case "savings_rate":
                tips.append(HealthTip(
                    title: String(localized: "Boost Your Savings"),
                    description: String(localized: "Try to save at least 20% of your income. Start by reducing discretionary spending."),
                    impact: .high,
                    systemImage: "leaf"
                ))
            case "budget_adherence":
                tips.append(HealthTip(
                    title: String(localized: "Stay Within Budget"),
                    description: String(localized: "Review over-budget categories and adjust limits or reduce spending."),
                    impact: .medium,
                    systemImage: "chart.pie"
                ))
            case "debt_ratio":
                tips.append(HealthTip(
                    title: String(localized: "Reduce Debt"),
                    description: String(localized: "Focus on paying down high-interest debt first using the avalanche method."),
                    impact: .high,
                    systemImage: "percent"
                ))
            case "emergency_fund":
                tips.append(HealthTip(
                    title: String(localized: "Build Emergency Fund"),
                    description: String(localized: "Aim for 3–6 months of expenses in a high-yield savings account."),
                    impact: .high,
                    systemImage: "shield"
                ))
            case "goal_progress":
                tips.append(HealthTip(
                    title: String(localized: "Set Up Auto-Save"),
                    description: String(localized: "Automate contributions toward your goals to ensure consistent progress."),
                    impact: .medium,
                    systemImage: "target"
                ))
            default:
                break
            }
        }

        if budgets.isEmpty {
            tips.append(HealthTip(
                title: String(localized: "Create Budgets"),
                description: String(localized: "Setting up budgets is the first step to controlling your spending."),
                impact: .medium,
                systemImage: "plus.circle"
            ))
        }

        if goals.filter({ $0.status == .active }).isEmpty {
            tips.append(HealthTip(
                title: String(localized: "Set Financial Goals"),
                description: String(localized: "Having clear goals helps you stay motivated and focused on saving."),
                impact: .medium,
                systemImage: "target"
            ))
        }

        return tips
    }

    // MARK: - Benchmark

    private func generateBenchmark(score: Int) -> HealthBenchmark {
        // Simulated benchmark data — in production this would come from
        // aggregated anonymous data via the backend.
        let percentile: Int
        switch score {
        case 90...: percentile = 95
        case 80..<90: percentile = 80
        case 70..<80: percentile = 65
        case 60..<70: percentile = 50
        case 50..<60: percentile = 35
        case 40..<50: percentile = 20
        default: percentile = 10
        }

        return HealthBenchmark(
            percentile: percentile,
            averageScore: 62,
            medianScore: 58,
            groupLabel: String(localized: "All Users")
        )
    }
}
