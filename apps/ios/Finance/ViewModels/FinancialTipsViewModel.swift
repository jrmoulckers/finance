// SPDX-License-Identifier: BUSL-1.1

// FinancialTipsViewModel.swift
// Finance
//
// ViewModel for contextual financial tips. Loads tips from the
// FinancialTipService based on the current screen context and
// user's financial state.
//
// Uses @Observable (Observation framework) and structured concurrency.
//
// References: #320

import Observation
import os
import SwiftUI

@Observable
final class FinancialTipsViewModel {
    private let tipService: FinancialTipProviding
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FinancialTipsViewModel"
    )

    // MARK: - Published State

    /// Currently displayed tips for the active context.
    var tips: [FinancialTip] = []

    /// The active tip context.
    var context: TipContext = .dashboard

    /// Whether tips are loading.
    var isLoading = false

    /// Error message if tip loading fails.
    var errorMessage: String?

    /// The maximum number of tips to display.
    var maxTips: Int = 3

    // MARK: - Init

    init(
        tipService: FinancialTipProviding = FinancialTipService.shared,
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        budgetRepository: BudgetRepository = RepositoryProvider.shared.budgets,
        goalRepository: GoalRepository = RepositoryProvider.shared.goals
    ) {
        self.tipService = tipService
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
    }

    // MARK: - Data Loading

    /// Loads tips for the given context, enriched with the user's financial data.
    func loadTips(for context: TipContext) async {
        self.context = context
        isLoading = true
        defer { isLoading = false }

        do {
            async let budgets = budgetRepository.getBudgets()
            async let goals = goalRepository.getGoals()
            async let transactions = transactionRepository.getRecentTransactions(limit: 50)

            let (loadedBudgets, loadedGoals, loadedTransactions) = try await (
                budgets, goals, transactions
            )

            tips = Array(
                tipService.tips(
                    for: context,
                    budgets: loadedBudgets,
                    goals: loadedGoals,
                    transactions: loadedTransactions
                ).prefix(maxTips)
            )

            Self.logger.debug(
                "Loaded \(self.tips.count, privacy: .public) tips for \(context.rawValue, privacy: .public)"
            )
        } catch {
            // Tips are advisory — failures should not block the user.
            errorMessage = error.localizedDescription
            tips = []
            Self.logger.error(
                "Tip loading failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    /// Dismisses a tip and removes it from the current list.
    func dismissTip(_ tip: FinancialTip) {
        tipService.dismissTip(id: tip.id)
        withAnimation(.easeInOut(duration: 0.3)) {
            tips.removeAll { $0.id == tip.id }
        }
        Self.logger.info("User dismissed tip: \(tip.id, privacy: .public)")
    }

    /// Resets all tip dismissals and reloads.
    func resetAllDismissals() async {
        tipService.resetDismissals()
        await loadTips(for: context)
    }
}
