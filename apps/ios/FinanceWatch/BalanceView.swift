// SPDX-License-Identifier: BUSL-1.1

// BalanceView.swift
// FinanceWatch
//
// Displays the total account balance at a glance on Apple Watch.
// Data is provided by the WatchConnectivityManager from the paired iPhone.
// Refs #30

import SwiftUI

struct BalanceView: View {
    let manager: WatchConnectivityManager

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "banknote")
                .font(.title2)
                .foregroundStyle(.teal)
                .accessibilityHidden(true)

            Text(String(localized: "Total Balance"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)

            Text(formattedBalance)
                .font(.title2)
                .fontWeight(.bold)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .accessibilityLabel(
                    String(localized: "Total balance: \(formattedBalance)")
                )

            if !manager.hasReceivedData {
                Text(String(localized: "Waiting for data from iPhone..."))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var formattedBalance: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = manager.currencyCode
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: manager.totalBalance))
            ?? "\(manager.currencyCode) \(manager.totalBalance)"
    }
}

#Preview("Balance View") {
    let manager = WatchConnectivityManager()
    BalanceView(manager: manager)
}
