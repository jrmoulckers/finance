// SPDX-License-Identifier: BUSL-1.1
// RecentTransactionsView.swift - Recent transactions. Refs #30, #649
import SwiftUI
struct RecentTransactionsView: View {
    let manager: WatchConnectivityManager
    var body: some View {
        Group {
            if manager.recentTransactions.isEmpty { emptyState } else { transactionList }
        }.navigationTitle(String(localized: "Recent"))
    }
    private var transactionList: some View {
        List(manager.recentTransactions.prefix(5)) { tx in
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tx.payee).font(.caption).fontWeight(.medium).lineLimit(1)
                    Text(tx.category).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(formattedAmount(tx)).font(.caption).fontWeight(.semibold).foregroundStyle(tx.isExpense ? .red : .green)
                    Text(tx.date, style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
            }.accessibilityElement(children: .combine)
             .accessibilityLabel("\(tx.payee), \(tx.category), \(formattedAmount(tx)), \(formattedDate(tx.date))")
        }.listStyle(.carousel)
    }
    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.and.arrow.forward").font(.title3).foregroundStyle(.secondary).accessibilityHidden(true)
            Text(String(localized: "Open Finance on iPhone")).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
         .accessibilityLabel(String(localized: "Open Finance on iPhone to sync transactions"))
    }
    private func formattedAmount(_ tx: WatchTransaction) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = manager.currencyCode; f.maximumFractionDigits = 2
        let signed = tx.isExpense ? -abs(tx.amountMinorUnits) : abs(tx.amountMinorUnits)
        return f.string(from: NSNumber(value: Double(signed) / 100.0)) ?? "\(manager.currencyCode) \(Double(signed)/100.0)"
    }
    private func formattedDate(_ date: Date) -> String { date.formatted(.relative(presentation: .named)) }
}
#Preview("Recent Transactions") { let m = WatchConnectivityManager(); RecentTransactionsView(manager: m) }

