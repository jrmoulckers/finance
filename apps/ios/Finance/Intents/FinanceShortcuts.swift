// SPDX-License-Identifier: BUSL-1.1

// FinanceShortcuts.swift
// Finance
//
// Registers all App Intents with the Shortcuts app and Siri.
// The system auto-discovers this provider; no Info.plist changes needed.

import AppIntents

/// Provides the canonical set of Siri Shortcuts for the Finance app.
///
/// The system uses this provider to:
/// - Surface shortcuts in the Shortcuts app gallery
/// - Enable phrase-based Siri invocation
/// - Show suggested shortcuts on the Lock Screen and in Spotlight
struct FinanceShortcuts: AppShortcutsProvider {

    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Add expense in \(.applicationName)",
                "Log expense in \(.applicationName)",
                "Record expense in \(.applicationName)",
                "Add a \(\.$amount) expense in \(.applicationName)",
                "Add \(\.$amount) \(\.$category) expense in \(.applicationName)",
            ],
            shortTitle: "Add Expense",
            systemImageName: "plus.circle"
        )

        AppShortcut(
            intent: ShowBalanceIntent(),
            phrases: [
                "Show balance in \(.applicationName)",
                "Show my balance in \(.applicationName)",
                "What's my balance in \(.applicationName)",
                "Check balance in \(.applicationName)",
                "Show \(\.$accountName) balance in \(.applicationName)",
            ],
            shortTitle: "Show Balance",
            systemImageName: "dollarsign.circle"
        )

        AppShortcut(
            intent: BudgetStatusIntent(),
            phrases: [
                "Budget status in \(.applicationName)",
                "How's my budget in \(.applicationName)",
                "Check budget in \(.applicationName)",
                "Show budget status in \(.applicationName)",
                "\(\.$budgetName) budget status in \(.applicationName)",
            ],
            shortTitle: "Budget Status",
            systemImageName: "chart.pie"
        )
    }
}
