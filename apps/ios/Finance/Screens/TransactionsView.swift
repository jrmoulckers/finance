// SPDX-License-Identifier: BUSL-1.1

// TransactionsView.swift
// Finance
//
// Date-grouped transaction list with search, swipe actions, and pull-to-refresh.

import SwiftUI

// MARK: - View Model

@Observable
@MainActor
final class TransactionsViewModel {
    var transactions: [TransactionListItem] = []
    var isLoading = false
    var searchText = ""
    var showingCreateTransaction = false

    struct TransactionListItem: Identifiable, Sendable {
        let id: String
        let payee: String
        let category: String
        let accountName: String
        let amountMinorUnits: Int64
        let currencyCode: String
        let date: Date
        let type: TransactionTypeUI
        let status: TransactionStatusUI
    }

    enum TransactionTypeUI: String, Sendable {
        case expense, income, transfer
        var systemImage: String {
            switch self {
            case .expense: "arrow.up.right"
            case .income: "arrow.down.left"
            case .transfer: "arrow.left.arrow.right"
            }
        }
        var color: Color {
            switch self {
            case .expense: .red
            case .income: .green
            case .transfer: .blue
            }
        }
    }

    enum TransactionStatusUI: String, Sendable {
        case pending, cleared, reconciled, voided
        var displayName: String {
            switch self {
            case .pending: String(localized: "Pending")
            case .cleared: String(localized: "Cleared")
            case .reconciled: String(localized: "Reconciled")
            case .voided: String(localized: "Void")
            }
        }
    }

    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let transactions: [TransactionListItem]
    }

    var filteredTransactions: [TransactionListItem] {
        guard !searchText.isEmpty else { return transactions }
        return transactions.filter {
            $0.payee.localizedCaseInsensitiveContains(searchText) ||
            $0.category.localizedCaseInsensitiveContains(searchText) ||
            $0.accountName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var groupedTransactions: [DateGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: filteredTransactions) { calendar.startOfDay(for: $0.date) }
        return grouped.sorted { $0.key > $1.key }
            .map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) }
    }

    func loadTransactions() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Replace with KMP shared logic via Swift Export bridge
        transactions = [
            TransactionListItem(id: "t1", payee: "Whole Foods", category: String(localized: "Groceries"), accountName: "Main Checking", amountMinorUnits: -85_40, currencyCode: "USD", date: .now, type: .expense, status: .cleared),
            TransactionListItem(id: "t2", payee: "Payroll", category: String(localized: "Income"), accountName: "Main Checking", amountMinorUnits: 4_250_00, currencyCode: "USD", date: .now, type: .income, status: .cleared),
            TransactionListItem(id: "t3", payee: "Netflix", category: String(localized: "Entertainment"), accountName: "Travel Card", amountMinorUnits: -15_99, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -1, to: .now)!, type: .expense, status: .cleared),
            TransactionListItem(id: "t4", payee: "Transfer to Savings", category: String(localized: "Transfer"), accountName: "Main Checking", amountMinorUnits: -500_00, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -1, to: .now)!, type: .transfer, status: .cleared),
            TransactionListItem(id: "t5", payee: "Shell Gas", category: String(localized: "Transport"), accountName: "Travel Card", amountMinorUnits: -45_00, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -2, to: .now)!, type: .expense, status: .pending),
            TransactionListItem(id: "t6", payee: "Starbucks", category: String(localized: "Dining Out"), accountName: "Main Checking", amountMinorUnits: -6_75, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -3, to: .now)!, type: .expense, status: .cleared),
            TransactionListItem(id: "t7", payee: "Amazon", category: String(localized: "Shopping"), accountName: "Travel Card", amountMinorUnits: -129_99, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -4, to: .now)!, type: .expense, status: .reconciled),
        ]
    }

    func deleteTransaction(id: String) async {
        transactions.removeAll { $0.id == id }
    }
}

// MARK: - View

struct TransactionsView: View {
    @State private var viewModel = TransactionsViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.filteredTransactions.isEmpty && !viewModel.isLoading {
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

    private func transactionRow(_ transaction: TransactionsViewModel.TransactionListItem) -> some View {
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

#Preview { TransactionsView() }
