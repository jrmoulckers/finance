// SPDX-License-Identifier: BUSL-1.1

// MainTabView.swift
// Finance
//
// Root TabView with 5 tabs matching the Android app: Dashboard, Accounts,
// Transactions, Budgets, Goals. Uses SF Symbols icons and .tabItem modifiers.

import SwiftUI

/// The root navigation container for the Finance app.
///
/// Uses `TabView` with 5 tabs following Apple HIG conventions:
/// - SF Symbols for tab icons
/// - `.tabItem` modifiers for tab configuration
/// - Each tab wraps its own `NavigationStack`
struct MainTabView: View {
    @State private var selectedTab: Tab = .dashboard

    enum Tab: String, CaseIterable {
        case dashboard, accounts, transactions, budgets, goals

        var title: String {
            switch self {
            case .dashboard: String(localized: "Dashboard")
            case .accounts: String(localized: "Accounts")
            case .transactions: String(localized: "Transactions")
            case .budgets: String(localized: "Budgets")
            case .goals: String(localized: "Goals")
            }
        }

        var systemImage: String {
            switch self {
            case .dashboard: "house"
            case .accounts: "building.columns"
            case .transactions: "arrow.left.arrow.right"
            case .budgets: "chart.pie"
            case .goals: "target"
            }
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem {
                    Label(Tab.dashboard.title, systemImage: Tab.dashboard.systemImage)
                }
                .tag(Tab.dashboard)
                .accessibilityLabel(Tab.dashboard.title)
                .accessibilityHint(String(localized: "Shows your financial overview"))

            AccountsView()
                .tabItem {
                    Label(Tab.accounts.title, systemImage: Tab.accounts.systemImage)
                }
                .tag(Tab.accounts)
                .accessibilityLabel(Tab.accounts.title)
                .accessibilityHint(String(localized: "Shows your accounts grouped by type"))

            TransactionsView()
                .tabItem {
                    Label(Tab.transactions.title, systemImage: Tab.transactions.systemImage)
                }
                .tag(Tab.transactions)
                .accessibilityLabel(Tab.transactions.title)
                .accessibilityHint(String(localized: "Shows all your transactions"))

            BudgetsView()
                .tabItem {
                    Label(Tab.budgets.title, systemImage: Tab.budgets.systemImage)
                }
                .tag(Tab.budgets)
                .accessibilityLabel(Tab.budgets.title)
                .accessibilityHint(String(localized: "Shows your budget categories and spending"))

            GoalsView()
                .tabItem {
                    Label(Tab.goals.title, systemImage: Tab.goals.systemImage)
                }
                .tag(Tab.goals)
                .accessibilityLabel(Tab.goals.title)
                .accessibilityHint(String(localized: "Shows your financial goals and progress"))
        }
    }
}

#Preview {
    MainTabView()
        .environment(BiometricAuthManager())
}
