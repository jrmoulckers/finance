// SPDX-License-Identifier: BUSL-1.1

// ComplicationDataWriter.swift
// Finance
//
// iPhone-side service that writes complication data to the shared App Group
// defaults for all watch face complications. This data is read by the
// watchOS WidgetKit timeline providers.
// Refs #266

import Foundation
import os

/// Writes pre-computed financial data to the App Group shared defaults
/// so that watchOS complications can display it without a WCSession connection.
///
/// The writer computes:
/// - Total balance (existing, from WatchDataSender)
/// - Budget utilization for all active budgets
/// - Today's spending total and transaction count
/// - Primary goal progress
///
/// This service is called by ``WatchDataSender`` after syncing data and also
/// by background refresh tasks to keep complications fresh.
actor ComplicationDataWriter {

    // MARK: - Constants

    private static let appGroupIdentifier = "group.com.finance.app"

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ComplicationDataWriter"
    )

    // MARK: - Dependencies

    private let accountRepository: any AccountRepository
    private let transactionRepository: any TransactionRepository
    private let budgetRepository: any BudgetRepository
    private let goalRepository: any GoalRepository

    // MARK: - Initialisation

    init(
        accountRepository: any AccountRepository = RepositoryProvider.shared.accounts,
        transactionRepository: any TransactionRepository = RepositoryProvider.shared.transactions,
        budgetRepository: any BudgetRepository = RepositoryProvider.shared.budgets,
        goalRepository: any GoalRepository = RepositoryProvider.shared.goals
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
    }

    // MARK: - Public API

    /// Fetches current financial data and writes all complication data
    /// to the shared App Group defaults.
    func writeAllComplicationData() async {
        guard let defaults = UserDefaults(
            suiteName: Self.appGroupIdentifier
        ) else {
            Self.logger.error("Failed to access App Group defaults")
            return
        }

        await writeBudgetData(to: defaults)
        await writeSpendingData(to: defaults)
        await writeGoalData(to: defaults)

        Self.logger.info("All complication data written")
    }

    // MARK: - Budget Data

    /// Writes budget utilization data for the budget complication.
    func writeBudgetData(to defaults: UserDefaults) async {
        do {
            let budgets = try await budgetRepository.getBudgets()
            let complicationBudgets = budgets.map { budget in
                ComplicationBudgetDTO(
                    id: budget.id,
                    name: budget.name,
                    spentMinorUnits: budget.spentMinorUnits,
                    budgetedMinorUnits: budget.limitMinorUnits
                )
            }

            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(complicationBudgets)
            defaults.set(data, forKey: "complication.budgets")

            Self.logger.info(
                "Wrote \(complicationBudgets.count) budget(s) to complication data"
            )
        } catch {
            Self.logger.error(
                "Failed to write budget complication data: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    // MARK: - Spending Data

    /// Writes today's spending data for the spending complication.
    func writeSpendingData(to defaults: UserDefaults) async {
        do {
            let allTransactions = try await transactionRepository.getTransactions()
            let calendar = Calendar.current
            let todayTransactions = allTransactions.filter { tx in
                calendar.isDateInToday(tx.date) && tx.type == .expense
            }

            let spentToday = todayTransactions.reduce(Int64(0)) { total, tx in
                total + abs(tx.amountMinorUnits)
            }

            // Daily target = sum of all monthly budgets / 30
            let budgets = try await budgetRepository.getBudgets()
            let monthlyTotal = budgets.reduce(Int64(0)) { $0 + $1.limitMinorUnits }
            let dailyTarget = monthlyTotal / 30

            defaults.set(spentToday, forKey: "complication.spentToday")
            defaults.set(dailyTarget, forKey: "complication.dailyTarget")
            defaults.set(todayTransactions.count, forKey: "complication.transactionCount")

            Self.logger.info(
                "Wrote spending data: \(spentToday) spent, \(todayTransactions.count) transactions"
            )
        } catch {
            Self.logger.error(
                "Failed to write spending complication data: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    // MARK: - Goal Data

    /// Writes the primary active goal for the goal complication.
    func writeGoalData(to defaults: UserDefaults) async {
        do {
            let goals = try await goalRepository.getGoals()
            let activeGoals = goals.filter { $0.status == .active }

            // Pick the goal closest to completion
            guard let primaryGoal = activeGoals.max(by: {
                $0.progress < $1.progress
            }) else {
                Self.logger.info("No active goals for complication")
                return
            }

            defaults.set(primaryGoal.name, forKey: "complication.goalName")
            defaults.set(primaryGoal.currentMinorUnits, forKey: "complication.goalCurrent")
            defaults.set(primaryGoal.targetMinorUnits, forKey: "complication.goalTarget")

            Self.logger.info(
                "Wrote goal data: \(primaryGoal.name, privacy: .private) at \(Int(primaryGoal.progress * 100))%"
            )
        } catch {
            Self.logger.error(
                "Failed to write goal complication data: \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}

// MARK: - DTO

/// Data transfer object for budget complication data.
/// Uses a different name to avoid collision with the watchOS-side model.
private struct ComplicationBudgetDTO: Codable, Sendable {
    let id: String
    let name: String
    let spentMinorUnits: Int64
    let budgetedMinorUnits: Int64
}
