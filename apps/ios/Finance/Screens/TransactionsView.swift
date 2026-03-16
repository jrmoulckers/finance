// SPDX-License-Identifier: BUSL-1.1

// TransactionsView.swift
// Finance
//
// Date-grouped transaction list with search, swipe actions, and pull-to-refresh.

import SwiftUI

// MARK: - View

struct TransactionsView: View {
    @State private var viewModel: TransactionsViewModel

    init(viewModel: TransactionsViewModel = TransactionsViewModel(repository: MockTransactionRepository())) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.transactions.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.filteredTransactions.isEmpty && !viewModel.isLoading {
                    if viewModel.searchText.isEmpty {
                        EmptyStateView(
                            systemImage: "arrow.left.arrow.right",
                            title: String(localized: "No Transactions"),
                            message: String(localized: "Add your first transaction to start tracking your spending."),
                            actionLabel: String(localized: "Add Transaction"),
                            action: { viewModel.showingCreateTransaction = true }
                        )
                    } else {
                        ContentUnavailableView.search(text: viewModel.searchText)
                    }
                } else {
                    transactionsList
                }
            }
            .navigationTitle(String(localized: "Transactions"))
            .searchable(text: $viewModel.searchText, prompt: String(localized: "Search by payee, category, or account"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showingCreateTransaction = true } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(String(localized: "Add transaction"))
                    .accessibilityHint(String(localized: "Opens a form to create a new transaction"))
                }
            }
            .sheet(isPresented: $viewModel.showingCreateTransaction) { TransactionCreateView() }
            .refreshable { await viewModel.loadTransactions() }
            .task { await viewModel.loadTransactions() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadTransactions() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private var transactionsList: some View {
        List {
            ForEach(viewModel.groupedTransactions) { group in
                Section {
                    ForEach(group.transactions) { transaction in
                        transactionRow(transaction)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { await viewModel.deleteTransaction(id: transaction.id) }
                                } label: {
                                    Label(String(localized: "Delete"), systemImage: "trash")
                                }
                                .accessibilityLabel(String(localized: "Delete transaction"))
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button {
                                    // TODO: Navigate to edit flow
                                } label: {
                                    Label(String(localized: "Edit"), systemImage: "pencil")
                                }
                                .tint(.blue)
                                .accessibilityLabel(String(localized: "Edit transaction"))
                            }
                    }
                } header: {
                    Text(group.date, style: .date)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func transactionRow(_ transaction: TransactionItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.type.systemImage)
                .font(.caption).foregroundStyle(transaction.type.color)
                .frame(width: 32, height: 32)
                .background(transaction.type.color.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(transaction.payee).font(.body).lineLimit(1)
                    if transaction.status == .pending {
                        Text(transaction.status.displayName)
                            .font(.caption2).foregroundStyle(.orange)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.orange.opacity(0.1), in: Capsule())
                    }
                }
                HStack(spacing: 4) {
                    Text(transaction.category)
                    Text("·")
                    Text(transaction.accountName)
                }
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.payee), \(transaction.category), \(transaction.accountName)")
        .accessibilityHint(String(localized: "Swipe for edit and delete actions"))
    }
}

#Preview { TransactionsView(viewModel: TransactionsViewModel(repository: MockTransactionRepository())) }
