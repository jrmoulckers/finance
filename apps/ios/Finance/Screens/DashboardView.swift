// SPDX-License-Identifier: BUSL-1.1

// DashboardView.swift
// Finance
//
// Main dashboard screen showing net worth, spending summary, budget health,
// and recent transactions. Supports pull-to-refresh for data sync.

import SwiftUI
import FinanceShared

// MARK: - View

struct DashboardView: View {
    @State private var viewModel: DashboardViewModel
    @State private var showingAskFinance = false
    @State private var showingSettings = false
    @Environment(DeepLinkHandler.self) private var deepLinkHandler: DeepLinkHandler?
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    // Low-noise mode: quick-access cards the user can hide. (#2122)
    @AppStorage(FeatureVisibility.investmentsKey) private var showInvestments = true
    @AppStorage(FeatureVisibility.billsKey) private var showBills = true
    @AppStorage(FeatureVisibility.reportsKey) private var showReports = true

    init(viewModel: DashboardViewModel = DashboardViewModel(
        accountRepository: RepositoryProvider.shared.accounts,
        transactionRepository: RepositoryProvider.shared.transactions,
        budgetRepository: RepositoryProvider.shared.budgets
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.accounts.isEmpty {
                    DashboardSkeletonView()
                } else if viewModel.accounts.isEmpty {
                    dashboardEmptyState
                } else {
                    ScrollView {
                        VStack(spacing: FinanceSpacing.lg) {
                            netWorthCard
                            netWorthTrendSection
                            savingsRateCard
                            spendingSummaryCard
                            budgetHealthSection
                            quickAccessSection
                            recentTransactionsSection
                        }
                        .padding(.horizontal)
                        .padding(.bottom, FinanceSpacing.lg)
                    }
                }
            }
            .offlineAware()
            .navigationTitle(String(localized: "Dashboard"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingAskFinance = true } label: {
                        Image(systemName: "bubble.left.and.text.bubble.right.fill")
                    }
                    .accessibilityIdentifier("ask_finance_button")
                    .accessibilityLabel(String(localized: "Ask Finance"))
                    .accessibilityHint(String(localized: "Ask a natural-language question about your money"))
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button { showingSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityIdentifier("settings_button")
                    .accessibilityLabel(String(localized: "Settings"))
                    .accessibilityHint(String(localized: "Opens app settings"))
                }
            }
            .sheet(isPresented: $showingAskFinance) {
                FinanceQueryView()
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
            .refreshable { await viewModel.loadDashboard() }
            .task { await viewModel.loadDashboard() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadDashboard() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - First-Run Empty State (#3588)

    /// Guiding empty state shown to brand-new users who have no accounts yet.
    ///
    /// Replaces the wall of zero-value cards with a welcoming message and a
    /// working "Add Account" call to action that switches to the Accounts tab
    /// and opens the create-account flow. Fully accessible via `EmptyStateView`.
    private var dashboardEmptyState: some View {
        EmptyStateView(
            systemImage: "sparkles",
            title: String(localized: "Welcome to Finance"),
            message: String(localized: "Add your first account to see your net worth, spending, and budget health here."),
            actionLabel: String(localized: "Add Account"),
            action: {
                deepLinkHandler?.selectedTab = .accounts
                deepLinkHandler?.requestAccountCreation = true
            }
        )
        .accessibilityIdentifier("dashboard_empty_state")
    }

    // MARK: - Net Worth Card

    private var netWorthCard: some View {
        VStack(spacing: FinanceSpacing.xs) {
            Text(String(localized: "Net Worth"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            CurrencyLabel(
                amountInMinorUnits: viewModel.netWorth,
                currencyCode: viewModel.currencyCode,
                showSign: false,
                font: .largeTitle.bold()
            )
            .foregroundStyle(netWorthColor)
            .accessibilityLabel(netWorthAccessibilityLabel)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, FinanceSpacing.xl)
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
        .accessibilityIdentifier("net_worth_card")
    }

    /// Net worth < 0 is emphasized with the negative semantic token so it is
    /// not visually identical to a positive balance. (#3593)
    private var netWorthColor: Color {
        viewModel.netWorth < 0 ? FinanceColors.amountNegative : .primary
    }

    // MARK: - Net Worth Trend (#2116)

    /// Clean net-worth growth chart with projection, shown on the primary
    /// surface right below the headline net-worth figure.
    @ViewBuilder
    private var netWorthTrendSection: some View {
        if viewModel.hasNetWorthTrend {
            NetWorthTrendCard(viewModel: viewModel)
        }
    }

    /// Spoken label for the net-worth amount so VoiceOver conveys the figure
    /// and, when negative, an explicit qualifier. The "Net Worth" caption
    /// remains a discrete element for context. (#3578, #3593)
    private var netWorthAccessibilityLabel: String {
        if viewModel.netWorth < 0 {
            let amount = CurrencyLabel.formatted(
                minorUnits: abs(viewModel.netWorth),
                currencyCode: viewModel.currencyCode
            )
            return String(localized: "Net worth, negative \(amount)")
        }
        let amount = CurrencyLabel.formatted(
            minorUnits: viewModel.netWorth,
            currencyCode: viewModel.currencyCode
        )
        return String(localized: "Net worth, \(amount)")
    }

    // MARK: - Savings Rate (#2162)

    private var savingsRateCard: some View {
        NavigationLink {
            AnalyticsView(
                transactionRepository: RepositoryProvider.shared.transactions,
                accountRepository: RepositoryProvider.shared.accounts
            )
        } label: {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "leaf.fill")
                            .font(.subheadline)
                            .foregroundStyle(.green)
                            .accessibilityHidden(true)
                        Text(String(localized: "Savings Rate"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Text(viewModel.savingsRateDisplay)
                        .font(.largeTitle.bold())
                        .foregroundStyle(.primary)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                    savingsRateTrendRow
                    Text(String(localized: "This month"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .cardBackground(cornerRadius: 16)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("savings_rate_card")
        .accessibilityLabel(viewModel.savingsRateAccessibilityLabel)
        .accessibilityHint(String(localized: "Opens savings rate history"))
        .accessibilityAddTraits(.isButton)
    }

    /// Trend row. The direction is conveyed by both an SF Symbol *and* text —
    /// never colour alone — to satisfy non-colour-only accessibility.
    private var savingsRateTrendRow: some View {
        HStack(spacing: 4) {
            Image(systemName: viewModel.savingsRateTrendSymbol)
                .font(.caption.weight(.bold))
                .accessibilityHidden(true)
            Text(viewModel.savingsRateTrendText)
                .font(.caption)
        }
        .foregroundStyle(savingsRateTrendColor)
        .accessibilityHidden(true)
    }

    private var savingsRateTrendColor: Color {
        switch viewModel.savingsRateTrend {
        case .improving: return .green
        case .declining: return .orange
        case .flat, .notEnoughData: return .secondary
        }
    }

    // MARK: - Adaptive Layout (#2190)

    /// Current environment mapped to the pure layout metrics input.
    private var layoutInput: SizeClassInput {
        SizeClassInput(horizontalSizeClass: horizontalSizeClass, dynamicTypeSize: dynamicTypeSize)
    }

    // MARK: - Spending Summary

    private var spendingSummaryCard: some View {
        let columns = CompactLayoutMetrics.summaryColumns(for: layoutInput)
        return VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Text(String(localized: "This Month"))
                .font(.headline)
            if columns == 1 {
                VStack(spacing: FinanceSpacing.sm) {
                    summaryColumn(title: String(localized: "Income"), amount: viewModel.monthlyIncome)
                    Divider()
                    summaryColumn(title: String(localized: "Expenses"), amount: viewModel.monthlyExpenses)
                    Divider()
                    summaryColumn(title: String(localized: "Net"), amount: viewModel.monthlyIncome - viewModel.monthlyExpenses)
                }
            } else {
                HStack(spacing: FinanceSpacing.md) {
                    summaryColumn(title: String(localized: "Income"), amount: viewModel.monthlyIncome)
                    Divider().frame(height: FinanceSpacing.minTapTarget)
                    summaryColumn(title: String(localized: "Expenses"), amount: viewModel.monthlyExpenses)
                    Divider().frame(height: FinanceSpacing.minTapTarget)
                    summaryColumn(title: String(localized: "Net"), amount: viewModel.monthlyIncome - viewModel.monthlyExpenses)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("spending_summary_card")
        .accessibilityLabel(spendingSummaryAccessibilityLabel)
    }

    /// Composes the three amounts into one spoken label so VoiceOver conveys
    /// the actual figures rather than just "Monthly spending summary". (#3578)
    private var spendingSummaryAccessibilityLabel: String {
        let income = CurrencyLabel.formatted(minorUnits: viewModel.monthlyIncome, currencyCode: viewModel.currencyCode)
        let expenses = CurrencyLabel.formatted(minorUnits: viewModel.monthlyExpenses, currencyCode: viewModel.currencyCode)
        let net = CurrencyLabel.formatted(minorUnits: viewModel.monthlyIncome - viewModel.monthlyExpenses, currencyCode: viewModel.currencyCode)
        return String(localized: "This month. Income \(income). Expenses \(expenses). Net \(net).")
    }

    private func summaryColumn(title: String, amount: Int64) -> some View {
        VStack(spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            CurrencyLabel(amountInMinorUnits: amount, currencyCode: viewModel.currencyCode, showSign: false, font: .callout.bold())
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Budget Health

    private var budgetHealthSection: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Text(String(localized: "Budget Health")).font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: FinanceSpacing.md) {
                    ForEach(viewModel.budgets) { budget in
                        NavigationLink {
                            BudgetsView()
                        } label: {
                            budgetHealthCard(budget)
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(budget.name)
                        .accessibilityValue(String(localized: "\(Int(budget.progress * 100)) percent of budget used"))
                        .accessibilityHint(String(localized: "Opens your budgets"))
                        .accessibilityAddTraits(.isButton)
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }

    private func budgetHealthCard(_ budget: BudgetItem) -> some View {
        VStack(spacing: FinanceSpacing.xs) {
            ProgressRing(progress: budget.progress, lineWidth: 6, progressColor: budget.progressColor, size: 60)
            Text(budget.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(width: 80)
        .padding(.vertical, FinanceSpacing.sm).padding(.horizontal, FinanceSpacing.xs)
        .cardBackground(cornerRadius: FinanceSpacing.Radius.lg)
        .accessibilityElement(children: .ignore)
    }

    // MARK: - Quick Access

    /// The single-parent workflow tiles are always available, so the section
    /// heading shows whenever they or any low-noise quick-access card is on.
    private var hasVisibleQuickAccess: Bool { true }

    @ViewBuilder
    private var quickAccessSection: some View {
        if hasVisibleQuickAccess {
            VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
                Text(String(localized: "More"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                LazyVGrid(
                    columns: CompactLayoutMetrics.gridItems(
                        count: CompactLayoutMetrics.quickAccessColumns(for: layoutInput),
                        spacing: FinanceSpacing.sm
                    ),
                    spacing: FinanceSpacing.sm
                ) {
                    NavigationLink {
                        GroceryModeView()
                    } label: {
                        quickAccessCard(
                            title: String(localized: "Safe to Spend"),
                            iconToken: .categoryGroceries,
                            color: .green
                        )
                    }
                    .accessibilityLabel(String(localized: "Safe to spend"))
                    .accessibilityHint(String(localized: "Check if you can afford a purchase before payday"))

                    NavigationLink {
                        ExpectedIncomeView()
                    } label: {
                        quickAccessCard(
                            title: String(localized: "Expected Income"),
                            iconToken: .income,
                            color: .teal
                        )
                    }
                    .accessibilityLabel(String(localized: "Expected income"))
                    .accessibilityHint(String(localized: "Track money you're expecting but haven't received"))

                    if showInvestments {
                        NavigationLink {
                            InvestmentPortfolioView()
                        } label: {
                            quickAccessCard(
                                title: String(localized: "Investments"),
                                iconToken: .investment,
                                color: .blue
                            )
                        }
                        .accessibilityLabel(String(localized: "Investments"))
                        .accessibilityHint(String(localized: "Opens your investment portfolio"))
                    }

                    if showBills {
                        NavigationLink {
                            BillsListView()
                        } label: {
                            quickAccessCard(
                                title: String(localized: "Bills"),
                                iconToken: .bill,
                                color: .orange
                            )
                        }
                        .accessibilityLabel(String(localized: "Bills"))
                        .accessibilityHint(String(localized: "Opens your bill reminders"))
                    }

                    if showReports {
                        NavigationLink {
                            ReportBuilderView()
                        } label: {
                            quickAccessCard(
                                title: String(localized: "Reports"),
                                iconToken: .reports,
                                color: .purple
                            )
                        }
                        .accessibilityLabel(String(localized: "Reports"))
                        .accessibilityHint(String(localized: "Opens the custom report builder"))
                    }
                }
            }
        }
    }

    private func quickAccessCard(title: String, iconToken: IconToken, color: Color) -> some View {
        VStack(spacing: FinanceSpacing.xs) {
            IconView(iconToken, size: 22)
                .foregroundStyle(color)
                .frame(width: FinanceSpacing.minTapTarget, height: FinanceSpacing.minTapTarget)
                .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.lg))
            Text(title)
                .font(.caption)
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, FinanceSpacing.sm)
        .cardBackground(cornerRadius: FinanceSpacing.Radius.lg)
    }

    // MARK: - Recent Transactions

    private var recentTransactionsSection: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            HStack {
                Text(String(localized: "Recent Transactions")).font(.headline)
                Spacer()
                NavigationLink {
                    TransactionsView()
                } label: {
                    Text(String(localized: "See All")).font(.subheadline)
                }
                .accessibilityLabel(String(localized: "See all transactions"))
                .accessibilityHint(String(localized: "Opens the full transactions list"))
            }
            if viewModel.recentTransactions.isEmpty {
                EmptyStateView(
                    systemImage: "arrow.left.arrow.right",
                    title: String(localized: "No Recent Transactions"),
                    message: String(localized: "Your latest transactions will appear here.")
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.recentTransactions) { transaction in
                        transactionRow(transaction)
                        if transaction.id != viewModel.recentTransactions.last?.id {
                            Divider().padding(.leading, FinanceSpacing.minTapTarget)
                        }
                    }
                }
                .padding()
                .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
            }
        }
    }

    private func transactionRow(_ transaction: TransactionItem) -> some View {
        HStack(spacing: FinanceSpacing.sm) {
            IconView(transaction.isExpense ? .expense : .income, size: 16)
                .foregroundStyle(transaction.isExpense ? FinanceColors.amountNegative : FinanceColors.amountPositive)
                .frame(width: 32, height: 32)
                .background((transaction.isExpense ? FinanceColors.amountNegative : FinanceColors.amountPositive).opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: FinanceSpacing.xxs) {
                Text(transaction.payee).font(.body).lineLimit(1)
                Text(transaction.category).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, FinanceSpacing.xxs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(transaction.accessibilityRowLabel(includeAccount: false))
    }
}

// MARK: - Loading Skeleton

/// A content-shaped placeholder shown during the dashboard's initial load.
///
/// Mirrors the real card stack and uses `.redacted(reason: .placeholder)` so
/// the layout doesn't shift when data arrives, reducing perceived latency.
/// The skeleton is hidden from VoiceOver and announces a single "Loading"
/// status instead. (#3582)
private struct DashboardSkeletonView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: FinanceSpacing.lg) {
                card(height: 96)
                card(height: 120)
                card(height: 110)
                HStack(spacing: FinanceSpacing.md) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: FinanceSpacing.Radius.lg)
                            .fill(.regularMaterial)
                            .frame(width: 80, height: 96)
                    }
                    Spacer(minLength: 0)
                }
                card(height: 160)
            }
            .padding(.horizontal)
            .padding(.bottom, FinanceSpacing.lg)
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "Loading"))
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func card(height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: FinanceSpacing.Radius.xl)
            .fill(.regularMaterial)
            .frame(maxWidth: .infinity)
            .frame(height: height)
    }
}

#Preview {
    DashboardView(viewModel: DashboardViewModel(
        accountRepository: RepositoryProvider.shared.accounts,
        transactionRepository: RepositoryProvider.shared.transactions,
        budgetRepository: RepositoryProvider.shared.budgets
    ))
    .environment(BiometricAuthManager())
}
