// RecentTransactionsView.swift
// FinanceWatch
//
// Compact list of the 5 most recent transactions on Apple Watch.
// Refs #30

import SwiftUI

struct RecentTransactionsView: View {
    let manager: WatchConnectivityManager

    var body: some View {
        Group {
            if manager.recentTransactions.isEmpty {
                emptyState
            } else {
                transactionList
            }
        }
        .navigationTitle(String(localized: "Recent"))
    }

    private var transactionList: some View {
        List(manager.recentTransactions.prefix(5)) { tx in
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tx.payee)
                        .font(.caption)
                        .fontWeight(.medium)
                        .lineLimit(1)
                    Text(tx.category)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(formattedAmount(tx))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(tx.isExpense ? .red : .green)
                    Text(tx.date, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "\(tx.payee), \(tx.category), \(formattedAmount(tx)), \(formattedDate(tx.date))"
            )
        }
        .listStyle(.carousel)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.title3)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "No recent transactions"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel(String(localized: "No recent transactions"))
    }

    private func formattedAmount(_ tx: WatchTransaction) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = manager.currencyCode
        formatter.maximumFractionDigits = 2
        let value = tx.isExpense ? -abs(tx.amount) : abs(tx.amount)
        return formatter.string(from: NSNumber(value: value))
            ?? "\(manager.currencyCode) \(value)"
    }

    private func formattedDate(_ date: Date) -> String {
        date.formatted(.relative(presentation: .named))
    }
}

#Preview("Recent Transactions") {
    let manager = WatchConnectivityManager()
    RecentTransactionsView(manager: manager)
}
