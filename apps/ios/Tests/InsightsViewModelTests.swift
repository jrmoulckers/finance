// SPDX-License-Identifier: BUSL-1.1

// InsightsViewModelTests.swift
// FinanceTests
//
// Unit tests for InsightsViewModel and InsightsEngine.
//
// References: #241

import Foundation
import SwiftUI
import Testing
@testable import FinanceApp

// MARK: - Stub Insights Engine

final class StubInsightsEngine: InsightsEngineProtocol, @unchecked Sendable {
    var summaryToReturn: InsightsSummary?

    func generateInsights(
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem],
        currencyCode: String
    ) async -> InsightsSummary {
        summaryToReturn ?? InsightsSummary(
            totalSpendingMinorUnits: 0,
            totalIncomeMinorUnits: 0,
            netCashFlowMinorUnits: 0,
            savingsRatePercent: 0,
            spendingBreakdown: [],
            insights: [],
            monthlySpendingTrend: [],
            currencyCode: currencyCode
        )
    }
}

// MARK: - InsightsViewModel Tests

@Suite("InsightsViewModel Tests")
struct InsightsViewModelTests {

    @Test("Loads insights successfully")
    @MainActor
    func loadsSuccessfully() async {
        let engine = StubInsightsEngine()
        engine.summaryToReturn = InsightsSummary(
            totalSpendingMinorUnits: 150_000,
            totalIncomeMinorUnits: 400_000,
            netCashFlowMinorUnits: 250_000,
            savingsRatePercent: 62.5,
            spendingBreakdown: [],
            insights: [
                FinancialInsight(
                    type: .savingsOpportunity,
                    severity: .info,
                    title: "Great Savings",
                    description: "You're saving well."
                ),
            ],
            monthlySpendingTrend: [],
            currencyCode: "USD"
        )

        let vm = InsightsViewModel(
            transactionRepository: StubTransactionRepository(),
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository(),
            engine: engine
        )

        await vm.loadInsights()

        #expect(vm.summary != nil)
        #expect(vm.summary?.totalSpendingMinorUnits == 150_000)
        #expect(vm.summary?.insights.count == 1)
        #expect(!vm.isLoading)
    }

    @Test("Handles repository error gracefully")
    @MainActor
    func handlesError() async {
        let repo = StubTransactionRepository()
        repo.errorToThrow = TestError.simulated

        let vm = InsightsViewModel(
            transactionRepository: repo,
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository()
        )

        await vm.loadInsights()

        #expect(vm.summary == nil)
        #expect(vm.errorMessage != nil)
        #expect(!vm.isLoading)
    }

    @Test("Filters insights by severity")
    @MainActor
    func filtersInsights() async {
        let engine = StubInsightsEngine()
        engine.summaryToReturn = InsightsSummary(
            totalSpendingMinorUnits: 0,
            totalIncomeMinorUnits: 0,
            netCashFlowMinorUnits: 0,
            savingsRatePercent: 0,
            spendingBreakdown: [],
            insights: [
                FinancialInsight(type: .savingsOpportunity, severity: .info, title: "Info", description: ""),
                FinancialInsight(type: .categorySpike, severity: .warning, title: "Warning", description: ""),
                FinancialInsight(type: .budgetPerformance, severity: .suggestion, title: "Suggestion", description: ""),
            ],
            monthlySpendingTrend: [],
            currencyCode: "USD"
        )

        let vm = InsightsViewModel(
            transactionRepository: StubTransactionRepository(),
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository(),
            engine: engine
        )

        await vm.loadInsights()

        vm.selectedFilter = .all
        #expect(vm.filteredInsights.count == 3)

        vm.selectedFilter = .warnings
        #expect(vm.filteredInsights.count == 1)
        #expect(vm.filteredInsights.first?.title == "Warning")

        vm.selectedFilter = .info
        #expect(vm.filteredInsights.count == 1)
        #expect(vm.filteredInsights.first?.title == "Info")
    }
}

// MARK: - InsightsEngine Tests

@Suite("InsightsEngine Tests")
struct InsightsEngineTests {

    @Test("Generates insights from sample data")
    func generatesInsights() async {
        let engine = InsightsEngine.shared

        let summary = await engine.generateInsights(
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals,
            currencyCode: "USD"
        )

        #expect(!summary.insights.isEmpty)
        #expect(summary.currencyCode == "USD")
    }

    @Test("Detects over-budget condition")
    func detectsOverBudget() async {
        let engine = InsightsEngine.shared

        let summary = await engine.generateInsights(
            transactions: [],
            budgets: [SampleData.overBudget],
            goals: [],
            currencyCode: "USD"
        )

        let budgetInsight = summary.insights.first {
            $0.type == .budgetPerformance && $0.severity == .warning
        }
        #expect(budgetInsight != nil)
    }

    @Test("Computes spending breakdown")
    func computesBreakdown() async {
        let engine = InsightsEngine.shared

        // Create transactions dated this month so they get included
        let now = Date()
        let txns = [
            TransactionItem(
                id: "a", payee: "Store", category: "Groceries",
                amountMinorUnits: -5000, currencyCode: "USD",
                date: now, type: .expense
            ),
            TransactionItem(
                id: "b", payee: "Gas", category: "Transport",
                amountMinorUnits: -3000, currencyCode: "USD",
                date: now, type: .expense
            ),
        ]

        let summary = await engine.generateInsights(
            transactions: txns,
            budgets: [],
            goals: [],
            currencyCode: "USD"
        )

        #expect(summary.spendingBreakdown.count == 2)
        #expect(summary.totalSpendingMinorUnits == 8000)
    }
}
