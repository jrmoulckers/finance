// SPDX-License-Identifier: BUSL-1.1

// TransactionItem+Accessibility.swift
// Finance
// References: #2117
//
// Bridges the unified `TransactionItem` model to the shared, fully-tested
// `TransactionAccessibility` label builder so every transaction row announces
// amount, direction, payee, category, account, date, and status in one
// coherent VoiceOver element.

import FinanceShared
import Foundation

extension TransactionTypeUI {
    /// Maps the visual transaction type to a spoken accessibility direction.
    var accessibilityDirection: TransactionAccessibility.Direction {
        switch self {
        case .income: .income
        case .expense: .expense
        case .transfer: .transfer
        }
    }
}

extension TransactionStatusUI {
    /// Status text announced to VoiceOver. The normal `.cleared` state is
    /// omitted (empty) to keep announcements concise; pending, reconciled,
    /// and voided states are surfaced because they change the meaning of the
    /// row.
    var accessibilityStatusDescription: String {
        switch self {
        case .cleared: ""
        default: displayName
        }
    }
}

extension TransactionItem {
    /// Display-ready fragments for the shared VoiceOver label builder.
    ///
    /// - Parameter includeAccount: Pass `false` for compact contexts (e.g. the
    ///   Dashboard recent list) where the account name is not shown.
    func accessibilityRowComponents(includeAccount: Bool = true) -> TransactionAccessibility.RowComponents {
        let formatted = TransactionAccessibility.formattedAmount(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode
        )
        let amountDescription = TransactionAccessibility.amountDescription(
            direction: type.accessibilityDirection,
            formattedAmount: formatted
        )
        return TransactionAccessibility.RowComponents(
            amountDescription: amountDescription,
            payee: payee,
            category: category,
            accountName: includeAccount ? accountName : "",
            date: date.formatted(date: .abbreviated, time: .omitted),
            statusDescription: status.accessibilityStatusDescription,
            isRecurring: isRecurring,
            tagNames: tags.map(\.displayName)
        )
    }

    /// The fully composed VoiceOver label for a transaction row.
    func accessibilityRowLabel(includeAccount: Bool = true) -> String {
        TransactionAccessibility.rowLabel(accessibilityRowComponents(includeAccount: includeAccount))
    }
}

// TODO(human): Validate the composed announcement on a physical device with
// VoiceOver enabled — confirm that swiping a transaction row reads a single
// coherent label (amount + direction, payee, category, account, date, status)
// without the CurrencyLabel child being announced separately, that group
// (date-section) context is preserved while swiping, and that swipe actions
// remain reachable via the rotor. Automated unit tests cover the label-builder
// string output but cannot exercise the live VoiceOver focus engine.

