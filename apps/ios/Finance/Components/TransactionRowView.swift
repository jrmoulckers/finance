// SPDX-License-Identifier: BUSL-1.1

// TransactionRowView.swift
// Finance
// References: #646

import SwiftUI

struct TransactionRowView: View, Equatable {
    let transaction: TransactionItem

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    static func == (lhs: TransactionRowView, rhs: TransactionRowView) -> Bool { lhs.transaction == rhs.transaction }

    private var amountLabel: some View {
        CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
            .contentTransition(.numericText())
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IconView(transaction.type.iconToken, size: 16)
                .foregroundStyle(transaction.type.color)
                .frame(width: 32, height: 32).background(transaction.type.color.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(transaction.payee)
                        .font(.body)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        .fixedSize(horizontal: false, vertical: true)
                    if transaction.isRecurring { IconView(.recurring, size: 12).foregroundStyle(.secondary).accessibilityLabel(String(localized: "Recurring")) }
                    if transaction.status == .pending { Text(transaction.status.displayName).font(.caption2).foregroundStyle(FinanceColors.statusWarning).padding(.horizontal, 6).padding(.vertical, 2).background(FinanceColors.statusWarning.opacity(0.1), in: Capsule()) }
                }
                HStack(spacing: 4) { Text(transaction.category); Text("·"); Text(transaction.accountName) }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    .fixedSize(horizontal: false, vertical: true)
                // Show up to 2 tags inline
                if !transaction.tags.isEmpty {
                    TagsRow(tags: transaction.tags, maxVisible: 2)
                }
                // At accessibility text sizes the trailing amount would be
                // cramped, so stack it below the details instead. (#2119)
                if dynamicTypeSize.isAccessibilitySize {
                    amountLabel
                }
            }
            if !dynamicTypeSize.isAccessibilitySize {
                Spacer()
                amountLabel
            }
        }.padding(.vertical, 2).accessibilityElement(children: .combine)
        .accessibilityLabel(transaction.accessibilityRowLabel())
        .accessibilityHint(String(localized: "Tap to view details. Swipe for more actions."))
    }
}
