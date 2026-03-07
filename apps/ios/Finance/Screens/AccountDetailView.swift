// AccountDetailView.swift
// Finance
//
// Account detail screen showing balance, info, and transaction history.

import SwiftUI

// MARK: - View Model

@Observable
@MainActor
final class AccountDetailViewModel {
    var transactions: [TransactionRow] = []
    var isLoading = false

    struct TransactionRow: Identifiable {
        let id: String
        let payee: String
        let category: String
        let amountMinorUnits: Int64
        let currencyCode: String
        let date: Date
        let isExpense: Bool
    }

    struct DateGroup: Identifiable {
        let id: String
        let date: Date
        let transactions: [TransactionRow]
    }

    var groupedTransactions: [DateGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: transactions) { calendar.startOfDay(for: $0.date) }
        return grouped
            .sorted { $0.key > $1.key }
            .map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) }
    }

    func loadTransactions(accountId: String) async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Replace with KMP shared logic via Swift Export bridge
        transactions = [
            TransactionRow(id: "t1", payee: "Whole Foods", category: String(localized: "Groceries"), amountMinorUnits: -85_40, currencyCode: "USD", date: .now, isExpense: true),
            TransactionRow(id: "t2", payee: "Shell Gas", category: String(localized: "Transport"), amountMinorUnits: -45_00, currencyCode: "USD", date: .now, isExpense: true),
            TransactionRow(id: "t3", payee: "Direct Deposit", category: String(localized: "Income"), amountMinorUnits: 4_250_00, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -1, to: .now)!, isExpense: false),
            TransactionRow(id: "t4", payee: "Amazon", category: String(localized: "Shopping"), amountMinorUnits: -129_99, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -2, to: .now)!, isExpense: true),
            TransactionRow(id: "t5", payee: "Starbucks", category: String(localized: "Dining Out"), amountMinorUnits: -6_75, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -2, to: .now)!, isExpense: true),
        ]
    }
}

// MARK: - View

struct AccountDetailView: View {
    let account: AccountsViewModel.AccountItem
    @State private var viewModel = AccountDetailViewModel()

    var body: some View {
        List {
            accountHeader
            ForEach(viewModel.groupedTransactions) { group in
                Section {
                    ForEach(group.transactions) { transaction in
                        transactionRow(transaction)
                    }
                } header: {
                    Text(group.date, style: .date)
                }
            }
            if viewModel.transactions.isEmpty && !viewModel.isLoading {
                Section {
                    EmptyStateView(
                        systemImage: "arrow.left.arrow.right",
                        title: String(localized: "No Transactions"),
                        message: String(localized: "Transactions for this account will appear here.")
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(account.name)
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await viewModel.loadTransactions(accountId: account.id) }
        .task { await viewModel.loadTransactions(accountId: account.id) }
    }

    private var accountHeader: some View {
        Section {
            VStack(spacing: 8) {
                Image(systemName: account.icon)
                    .font(.largeTitle).foregroundStyle(.blue)
                    .frame(width: 64, height: 64)
                    .background(Color.blue.opacity(0.1), in: Circle())
                Text(String(localized: "Current Balance"))
                    .font(.subheadline).foregroundStyle(.secondary)
                CurrencyLabel(amountInMinorUnits: account.balanceMinorUnits, currencyCode: account.currencyCode, showSign: false, font: .title.bold())
                Text(account.type.displayName)
                    .font(.caption).foregroundStyle(.secondary)
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(.quaternary, in: Capsule())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "\(account.name), \(account.type.displayName)"))
        }
    }

    private func transactionRow(_ transaction: AccountDetailViewModel.TransactionRow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.isExpense ? "arrow.up.right" : "arrow.down.left")
                .font(.caption)
                .foregroundStyle(transaction.isExpense ? .red : .green)
                .frame(width: 28, height: 28)
                .background((transaction.isExpense ? Color.red : Color.green).opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.payee).font(.body).lineLimit(1)
                Text(transaction.category).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.payee), \(transaction.category)")
    }
}

#Preview {
    NavigationStack {
        AccountDetailView(account: AccountsViewModel.AccountItem(
            id: "preview-1", name: "Main Checking", balanceMinorUnits: 12_450_00,
            currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false
        ))
    }
}
