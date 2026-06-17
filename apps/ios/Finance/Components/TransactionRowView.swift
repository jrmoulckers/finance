// SPDX-License-Identifier: BUSL-1.1

// TransactionRowView.swift
// Finance
// References: #646

import SwiftUI

struct TransactionRowView: View, Equatable {
    let transaction: TransactionItem

    static func == (lhs: TransactionRowView, rhs: TransactionRowView) -> Bool { lhs.transaction == rhs.transaction }

    var body: some View {
        HStack(spacing: 12) {
            IconView(transaction.type.iconToken, size: 16)
                .foregroundStyle(transaction.type.color)
                .frame(width: 32, height: 32).background(transaction.type.color.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(transaction.payee).font(.body).lineLimit(1)
                    if transaction.isRecurring { IconView(.recurring, size: 12).foregroundStyle(.secondary).accessibilityLabel(String(localized: "Recurring")) }
                    if transaction.status == .pending { Text(transaction.status.displayName).font(.caption2).foregroundStyle(.orange).padding(.horizontal, 6).padding(.vertical, 2).background(.orange.opacity(0.1), in: Capsule()) }
                }
                HStack(spacing: 4) { Text(transaction.category); Text("·"); Text(transaction.accountName) }.font(.caption).foregroundStyle(.secondary).lineLimit(1)
                // Show up to 2 tags inline
                if !transaction.tags.isEmpty {
                    TagsRow(tags: transaction.tags, maxVisible: 2)
                }
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold()).contentTransition(.numericText())
        }.padding(.vertical, 2).accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabelText)
        .accessibilityHint(String(localized: "Tap to view details. Swipe for more actions."))
    }

    private var accessibilityLabelText: String {
        var label = [transaction.payee, transaction.category, transaction.accountName].joined(separator: ", ")
        if !transaction.tags.isEmpty {
            let tagNames = transaction.tags.map(\.displayName).joined(separator: ", ")
            label += ", " + String(localized: "Tags: \(tagNames)")
        }
        return label
    }
}
