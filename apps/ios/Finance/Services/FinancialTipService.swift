// SPDX-License-Identifier: BUSL-1.1

// FinancialTipService.swift
// Finance
//
// On-device service that generates context-aware financial tips based on
// the user's spending patterns, budget status, and goal progress.
// Tip dismissals are persisted in UserDefaults (non-sensitive boolean flags).
//
// References: #320

import Foundation
import os

// MARK: - FinancialTipProviding Protocol

/// Abstraction for financial tip generation — testable without side effects.
protocol FinancialTipProviding: Sendable {
    func tips(
        for context: TipContext,
        budgets: [BudgetItem],
        goals: [GoalItem],
        transactions: [TransactionItem]
    ) -> [FinancialTip]

    func dismissTip(id: String)
    func isDismissed(id: String) -> Bool
    func resetDismissals()
}

// MARK: - FinancialTipService

/// Generates and manages contextual financial tips.
///
/// Tips are selected based on the current context plus optional financial
/// state signals (over-budget categories, goal progress, etc.). Dismissed
/// tips are tracked in `UserDefaults` under a namespaced key prefix.
///
/// > Note: Dismissed-tip IDs are non-sensitive UI preferences — Keychain
/// >   storage is not required.
final class FinancialTipService: FinancialTipProviding, @unchecked Sendable {

    // MARK: - Singleton

    static let shared = FinancialTipService()

    // MARK: - Constants

    /// UserDefaults key prefix for dismissed tip tracking.
    private static let dismissedKeyPrefix = "financialTip.dismissed."

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FinancialTipService"
    )

    // MARK: - Private State

    private let defaults: UserDefaults

    // MARK: - Init

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: - Public API

    /// Returns context-appropriate tips, filtered by financial state and dismissals.
    ///
    /// - Parameters:
    ///   - context: The screen or action triggering the tip request.
    ///   - budgets: Current budget items for conditional tips.
    ///   - goals: Current goal items for conditional tips.
    ///   - transactions: Recent transactions for conditional tips.
    /// - Returns: An array of tips sorted by priority (highest first), excluding dismissed tips.
    func tips(
        for context: TipContext,
        budgets: [BudgetItem],
        goals: [GoalItem],
        transactions: [TransactionItem]
    ) -> [FinancialTip] {
        var candidates = allTips.filter { $0.applicableContexts.contains(context) }

        // Add dynamic tips based on financial state.
        candidates.append(contentsOf: dynamicTips(
            for: context,
            budgets: budgets,
            goals: goals,
            transactions: transactions
        ))

        // Filter dismissed and sort by priority.
        let result = candidates
            .filter { !isDismissed(id: $0.id) }
            .sorted { $0.priority > $1.priority }

        Self.logger.debug(
            "Generated \(result.count, privacy: .public) tips for context \(context.rawValue, privacy: .public)"
        )

        return result
    }

    /// Marks a tip as dismissed so it won't appear again.
    func dismissTip(id: String) {
        defaults.set(true, forKey: Self.dismissedKeyPrefix + id)
        Self.logger.info("Dismissed tip: \(id, privacy: .public)")
    }

    /// Checks whether a tip has been dismissed.
    func isDismissed(id: String) -> Bool {
        defaults.bool(forKey: Self.dismissedKeyPrefix + id)
    }

    /// Resets all tip dismissals.
    func resetDismissals() {
        let keys = defaults.dictionaryRepresentation().keys.filter {
            $0.hasPrefix(Self.dismissedKeyPrefix)
        }
        for key in keys {
            defaults.removeObject(forKey: key)
        }
        Self.logger.info("Reset all tip dismissals (\(keys.count, privacy: .public) tips)")
    }

    // MARK: - Static Tip Catalog

    /// The full catalog of pre-authored financial tips.
    private var allTips: [FinancialTip] {
        [
            // Dashboard tips
            FinancialTip(
                id: "tip_50_30_20",
                title: String(localized: "Try the 50/30/20 Rule"),
                body: String(localized: "Allocate 50% of income to needs, 30% to wants, and 20% to savings. It's a simple framework to balance your spending."),
                category: .budgeting,
                applicableContexts: [.dashboard, .budgets],
                priority: 10
            ),
            FinancialTip(
                id: "tip_emergency_fund",
                title: String(localized: "Build an Emergency Fund"),
                body: String(localized: "Aim to save 3–6 months of essential expenses. Start small — even $50/month adds up over time."),
                category: .saving,
                applicableContexts: [.dashboard, .goals, .newUser],
                priority: 9
            ),
            FinancialTip(
                id: "tip_automate_savings",
                title: String(localized: "Automate Your Savings"),
                body: String(localized: "Set up automatic transfers to your savings account on payday. You'll save consistently without having to think about it."),
                category: .saving,
                applicableContexts: [.dashboard, .accounts],
                priority: 8
            ),

            // Transaction tips
            FinancialTip(
                id: "tip_categorize_spending",
                title: String(localized: "Categorize Every Transaction"),
                body: String(localized: "Consistent categorization reveals your true spending patterns. Review uncategorized transactions weekly for the best insights."),
                category: .spending,
                applicableContexts: [.transactions],
                priority: 7
            ),
            FinancialTip(
                id: "tip_review_recurring",
                title: String(localized: "Audit Recurring Charges"),
                body: String(localized: "Review your subscriptions quarterly. The average person has 12 recurring subscriptions — canceling unused ones can save hundreds yearly."),
                category: .spending,
                applicableContexts: [.transactions, .accounts],
                systemImage: "repeat",
                priority: 8
            ),

            // Budget tips
            FinancialTip(
                id: "tip_zero_based_budget",
                title: String(localized: "Try Zero-Based Budgeting"),
                body: String(localized: "Give every dollar a job. Assign all income to specific categories until you reach zero — this ensures nothing slips through."),
                category: .budgeting,
                applicableContexts: [.budgets],
                priority: 6
            ),
            FinancialTip(
                id: "tip_budget_buffer",
                title: String(localized: "Add a 10% Buffer"),
                body: String(localized: "Life is unpredictable. Adding a small buffer to each budget category prevents frustration from minor overruns."),
                category: .budgeting,
                applicableContexts: [.budgets],
                priority: 5
            ),

            // Goal tips
            FinancialTip(
                id: "tip_smart_goals",
                title: String(localized: "Set SMART Financial Goals"),
                body: String(localized: "Make goals Specific, Measurable, Achievable, Relevant, and Time-bound. \"Save $5,000 for vacation by December\" beats \"save more money.\""),
                category: .saving,
                applicableContexts: [.goals],
                priority: 7
            ),
            FinancialTip(
                id: "tip_visualize_progress",
                title: String(localized: "Visualize Your Progress"),
                body: String(localized: "Tracking progress toward goals boosts motivation. Check your goal dashboard weekly to stay engaged and adjust course if needed."),
                category: .general,
                applicableContexts: [.goals, .dashboard],
                priority: 4
            ),

            // Account tips
            FinancialTip(
                id: "tip_high_yield_savings",
                title: String(localized: "Consider High-Yield Savings"),
                body: String(localized: "High-yield savings accounts can earn 10–20× more interest than traditional ones. Your emergency fund should be working for you."),
                category: .saving,
                applicableContexts: [.accounts],
                priority: 6
            ),
            FinancialTip(
                id: "tip_pay_yourself_first",
                title: String(localized: "Pay Yourself First"),
                body: String(localized: "Before paying bills or spending, move a set amount to savings. Treat savings as a non-negotiable expense."),
                category: .saving,
                applicableContexts: [.accounts, .dashboard],
                priority: 7
            ),

            // New user tips
            FinancialTip(
                id: "tip_start_tracking",
                title: String(localized: "Start Tracking Today"),
                body: String(localized: "The first step to financial health is awareness. Log your transactions daily for one week to understand where your money goes."),
                category: .general,
                applicableContexts: [.newUser, .dashboard],
                systemImage: "sparkles",
                priority: 10
            ),
        ]
    }

    // MARK: - Dynamic Tips

    /// Generates tips based on the user's current financial state.
    private func dynamicTips(
        for context: TipContext,
        budgets: [BudgetItem],
        goals: [GoalItem],
        transactions: [TransactionItem]
    ) -> [FinancialTip] {
        var tips: [FinancialTip] = []

        // Over-budget warning tip
        let overBudgetCategories = budgets.filter { $0.progress >= 1.0 }
        if !overBudgetCategories.isEmpty {
            let names = overBudgetCategories.map(\.name).joined(separator: ", ")
            tips.append(FinancialTip(
                id: "tip_dynamic_over_budget",
                title: String(localized: "Over Budget Alert"),
                body: String(localized: "You've exceeded your budget in: \(names). Consider reducing discretionary spending for the rest of the month."),
                category: .budgeting,
                applicableContexts: [context, .budgets, .dashboard, .overspending],
                systemImage: "exclamationmark.triangle",
                priority: 15
            ))
        }

        // Near-budget warning (75%+)
        let nearBudgetCategories = budgets.filter { $0.progress >= 0.75 && $0.progress < 1.0 }
        if !nearBudgetCategories.isEmpty {
            let names = nearBudgetCategories.map(\.name).joined(separator: ", ")
            tips.append(FinancialTip(
                id: "tip_dynamic_near_budget",
                title: String(localized: "Approaching Budget Limit"),
                body: String(localized: "You're nearing the limit in: \(names). Plan your remaining spending carefully this period."),
                category: .budgeting,
                applicableContexts: [context, .budgets, .dashboard],
                systemImage: "gauge.with.dots.needle.67percent",
                priority: 12
            ))
        }

        // Goal nearly complete
        let nearCompleteGoals = goals.filter {
            $0.status == .active && $0.progress >= 0.80 && $0.progress < 1.0
        }
        for goal in nearCompleteGoals {
            let percentLeft = Int((1.0 - goal.progress) * 100)
            tips.append(FinancialTip(
                id: "tip_dynamic_goal_near_\(goal.id)",
                title: String(localized: "Almost There!"),
                body: String(localized: "\"\(goal.name)\" is \(percentLeft)% away from completion. A small push could get you across the finish line!"),
                category: .saving,
                applicableContexts: [context, .goals, .dashboard, .savingsGoalProgress],
                systemImage: "star.fill",
                priority: 14
            ))
        }

        // No budgets set
        if budgets.isEmpty && (context == .dashboard || context == .budgets) {
            tips.append(FinancialTip(
                id: "tip_dynamic_no_budgets",
                title: String(localized: "Create Your First Budget"),
                body: String(localized: "Budgets help you control spending. Start with your top 3 expense categories and set realistic monthly limits."),
                category: .budgeting,
                applicableContexts: [context],
                actionLabel: String(localized: "Create Budget"),
                priority: 11
            ))
        }

        // No goals set
        if goals.isEmpty && (context == .dashboard || context == .goals) {
            tips.append(FinancialTip(
                id: "tip_dynamic_no_goals",
                title: String(localized: "Set a Financial Goal"),
                body: String(localized: "Goals give purpose to your savings. Whether it's an emergency fund or a vacation, start with one meaningful goal."),
                category: .saving,
                applicableContexts: [context],
                actionLabel: String(localized: "Create Goal"),
                priority: 11
            ))
        }

        return tips
    }
}
