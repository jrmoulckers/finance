// SPDX-License-Identifier: BUSL-1.1

// MainTabView.swift
// Finance
//
// Root TabView with 5 tabs matching the Android app: Dashboard, Accounts,
// Transactions, Budgets, Goals. Uses SF Symbols icons and .tabItem modifiers.
// Deep link navigation is driven by DeepLinkRouter via @Environment.
// Refs #470

import SwiftUI

/// The root navigation container for the Finance app.
///
/// Uses `TabView` with 5 tabs following Apple HIG conventions:
/// - SF Symbols for tab icons
/// - `.tabItem` modifiers for tab configuration
/// - Accounts and Transactions tabs use `NavigationStack(path:)` for
///   deep-link-driven programmatic navigation via ``DeepLinkRouter``
/// - Dashboard, Budgets, and Goals tabs manage their own `NavigationStack`
struct MainTabView: View {
    @Environment(DeepLinkRouter.self) private var deepLinkRouter

    var body: some View {
        @Bindable var router = deepLinkRouter

        TabView(selection: $router.selectedTab) {
            DashboardView()
                .tabItem {
                    Label(
                        DeepLinkRouter.AppTab.dashboard.title,
                        systemImage: DeepLinkRouter.AppTab.dashboard.systemImage
                    )
                }
                .tag(DeepLinkRouter.AppTab.dashboard)
                .accessibilityLabel(DeepLinkRouter.AppTab.dashboard.title)
                .accessibilityHint(String(localized: "Shows your financial overview"))

            NavigationStack(path: $router.accountsPath) {
                AccountsView()
                    .navigationDestination(for: AccountRoute.self) { route in
                        // TODO: Load account from KMP repository by ID (#470)
                        accountDeepLinkPlaceholder(id: route.id)
                    }
            }
            .tabItem {
                Label(
                    DeepLinkRouter.AppTab.accounts.title,
                    systemImage: DeepLinkRouter.AppTab.accounts.systemImage
                )
            }
            .tag(DeepLinkRouter.AppTab.accounts)
            .accessibilityLabel(DeepLinkRouter.AppTab.accounts.title)
            .accessibilityHint(String(localized: "Shows your accounts grouped by type"))

            NavigationStack(path: $router.transactionsPath) {
                TransactionsView()
                    .navigationDestination(for: TransactionRoute.self) { route in
                        // TODO: Load transaction from KMP repository by ID (#470)
                        transactionDeepLinkPlaceholder(id: route.id)
                    }
            }
            .tabItem {
                Label(
                    DeepLinkRouter.AppTab.transactions.title,
                    systemImage: DeepLinkRouter.AppTab.transactions.systemImage
                )
            }
            .tag(DeepLinkRouter.AppTab.transactions)
            .accessibilityLabel(DeepLinkRouter.AppTab.transactions.title)
            .accessibilityHint(String(localized: "Shows all your transactions"))

            BudgetsView()
                .tabItem {
                    Label(
                        DeepLinkRouter.AppTab.budgets.title,
                        systemImage: DeepLinkRouter.AppTab.budgets.systemImage
                    )
                }
                .tag(DeepLinkRouter.AppTab.budgets)
                .accessibilityLabel(DeepLinkRouter.AppTab.budgets.title)
                .accessibilityHint(String(localized: "Shows your budget categories and spending"))

            GoalsView()
                .tabItem {
                    Label(
                        DeepLinkRouter.AppTab.goals.title,
                        systemImage: DeepLinkRouter.AppTab.goals.systemImage
                    )
                }
                .tag(DeepLinkRouter.AppTab.goals)
                .accessibilityLabel(DeepLinkRouter.AppTab.goals.title)
                .accessibilityHint(String(localized: "Shows your financial goals and progress"))
        }
        .alert(
            String(localized: "Unsupported Link"),
            isPresented: $router.showUnknownLinkAlert
        ) {
            Button(String(localized: "OK"), role: .cancel) {}
                .accessibilityLabel(String(localized: "Dismiss"))
        } message: {
            if let url = deepLinkRouter.unknownLinkURL {
                Text(String(localized: "The link could not be opened: \(url)"))
            }
        }
    }

    // MARK: - Deep Link Placeholders

    /// Placeholder destination for account deep links until the KMP
    /// repository layer supports loading accounts by ID.
    private func accountDeepLinkPlaceholder(id: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "building.columns")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "Loading account…"))
                .font(.headline)
                .foregroundStyle(.secondary)
            Text(id)
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityLabel(String(localized: "Account identifier"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(String(localized: "Account"))
        .accessibilityLabel(String(localized: "Loading account details"))
    }

    /// Placeholder destination for transaction deep links until the KMP
    /// repository layer supports loading transactions by ID.
    private func transactionDeepLinkPlaceholder(id: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.left.arrow.right")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "Loading transaction…"))
                .font(.headline)
                .foregroundStyle(.secondary)
            Text(id)
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityLabel(String(localized: "Transaction identifier"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(String(localized: "Transaction"))
        .accessibilityLabel(String(localized: "Loading transaction details"))
    }
}

#Preview {
    MainTabView()
        .environment(DeepLinkRouter())
}
