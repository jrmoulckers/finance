// SPDX-License-Identifier: BUSL-1.1

// DashboardView.swift
// Finance
//
// Main dashboard screen showing net worth, spending summary, budget health,
// and recent transactions. Supports pull-to-refresh for data sync.

import SwiftUI

// MARK: - View

struct DashboardView: View {
    @State private var viewModel: DashboardViewModel

    init(viewModel: DashboardViewModel = DashboardViewModel(
        accountRepository: MockAccountRepository(),
        transactionRepository: MockTransactionRepository(),
        budgetRepository: MockBudgetRepository()
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    netWorthCard
                    spendingSummaryCard
                    budgetHealthSection
                    recentTransactionsSection
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
            .navigationTitle(String(localized: "Dashboard"))
            .refreshable { await viewModel.loadDashboard() }
            .task { await viewModel.loadDashboard() }
            .errorAlert(
                errorMessage: Bindable(viewModel).errorMessage,
                retryAction: { await viewModel.loadDashboard() }
            )
        }
    }

    // MARK: - Net Worth Card

    private var netWorthCard: some View {
        VStack(spacing: 8) {
            Text(String(localized: "Net Worth"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            CurrencyLabel(
                amountInMinorUnits: viewModel.netWorth,
                currencyCode: viewModel.currencyCode,
                showSign: false,
                font: .largeTitle.bold()
            )
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Net Worth"))
    }

    // MARK: - Spending Summary

    private var spendingSummaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "This Month"))
                .font(.headline)
            HStack(spacing: 16) {
                summaryColumn(title: String(localized: "Income"), amount: viewModel.monthlyIncome)
                Divider().frame(height: 44)
                summaryColumn(title: String(localized: "Expenses"), amount: viewModel.monthlyExpenses)
                Divider().frame(height: 44)
                summaryColumn(title: String(localized: "Net"), amount: viewModel.monthlyIncome - viewModel.monthlyExpenses)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Monthly spending summary"))
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
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Budget Health")).font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 16) {
                    ForEach(viewModel.budgets) { budget in
                        budgetHealthCard(budget)
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }

    private func budgetHealthCard(_ budget: BudgetItem) -> some View {
        VStack(spacing: 8) {
            ProgressRing(progress: budget.progress, lineWidth: 6, progressColor: budget.progressColor, size: 60)
            Text(budget.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(width: 80)
        .padding(.vertical, 12).padding(.horizontal, 8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(budget.name)
        .accessibilityValue(String(localized: "\(Int(budget.progress * 100)) percent of budget used"))
    }

    // MARK: - Recent Transactions

    private var recentTransactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
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
                            Divider().padding(.leading, 44)
                        }
                    }
                }
                .padding()
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    private func transactionRow(_ transaction: TransactionItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.isExpense ? "arrow.up.right" : "arrow.down.left")
                .font(.body)
                .foregroundStyle(transaction.isExpense ? .red : .green)
                .frame(width: 32, height: 32)
                .background((transaction.isExpense ? Color.red : Color.green).opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.payee).font(.body).lineLimit(1)
                Text(transaction.category).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.payee), \(transaction.category)")
    }
}

#Preview {
    DashboardView(viewModel: DashboardViewModel(
        accountRepository: MockAccountRepository(),
        transactionRepository: MockTransactionRepository(),
        budgetRepository: MockBudgetRepository()
    ))
}
