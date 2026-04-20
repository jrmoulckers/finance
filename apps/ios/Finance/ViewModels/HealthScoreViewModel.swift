// SPDX-License-Identifier: BUSL-1.1

// HealthScoreViewModel.swift
// Finance
//
// ViewModel for the financial health score screen. Loads user data,
// runs the score engine, and exposes results for the view layer.
//
// References: #299

import Observation
import os
import SwiftUI

@Observable
final class HealthScoreViewModel {
    private let accountRepository: AccountRepository
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository
    private let engine: HealthScoreEngineProtocol
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "HealthScoreViewModel"
    )

    // MARK: - State

    var healthScore: FinancialHealthScore?
    var scoreHistory: [HealthScoreSnapshot] = []
    var isLoading = false
    var errorMessage: String?

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    /// The overall score as a percentage for progress ring display.
    var scoreProgress: Double {
        guard let score = healthScore else { return 0 }
        return Double(score.overallScore) / 100.0
    }

    /// Color for the overall score display.
    var scoreColor: Color {
        healthScore?.grade.color ?? .secondary
    }

    // MARK: - Init

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        goalRepository: GoalRepository,
        engine: HealthScoreEngineProtocol = HealthScoreEngine.shared,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
        self.engine = engine
        self.formatter = formatter
    }

    // MARK: - Data Loading

    func loadHealthScore() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let accounts = accountRepository.getAccounts()
            async let transactions = transactionRepository.getTransactions()
            async let budgets = budgetRepository.getBudgets()
            async let goals = goalRepository.getGoals()

            let (a, t, b, g) = try await (accounts, transactions, budgets, goals)

            healthScore = await engine.computeScore(
                accounts: a,
                transactions: t,
                budgets: b,
                goals: g
            )

            generateMockHistory()

            Self.logger.debug(
                "Health score loaded: \(self.healthScore?.overallScore ?? 0, privacy: .public)"
            )
        } catch {
            errorMessage = String(localized: "Failed to compute health score.")
            Self.logger.error("Health score failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Generates mock historical snapshots for score trend display.
    /// In production, this would load from persisted score history.
    private func generateMockHistory() {
        guard let current = healthScore else { return }
        let calendar = Calendar.current
        let now = Date.now

        scoreHistory = (0..<6).map { monthOffset in
            let date = calendar.date(byAdding: .month, value: -5 + monthOffset, to: now) ?? now
            let variance = Int.random(in: -8...5)
            let score = max(0, min(100, current.overallScore + variance - (5 - monthOffset) * 2))
            return HealthScoreSnapshot(date: date, score: score)
        }
    }
}
