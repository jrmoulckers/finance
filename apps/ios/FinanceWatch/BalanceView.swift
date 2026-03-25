// SPDX-License-Identifier: BUSL-1.1
// BalanceView.swift - Total balance at a glance. Refs #30, #649
import SwiftUI
struct BalanceView: View {
    let manager: WatchConnectivityManager
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Image(systemName: "banknote").font(.title2).foregroundStyle(.teal).accessibilityHidden(true)
                Text(String(localized: "Total Balance")).font(.caption).foregroundStyle(.secondary).accessibilityAddTraits(.isHeader)
                Text(formattedBalance).font(.title2).fontWeight(.bold).minimumScaleFactor(0.5).lineLimit(1)
                    .accessibilityLabel(String(localized: "Total balance: \(formattedBalance)"))
                if let lastUpdated = manager.lastUpdated {
                    Text(String(localized: "Updated \(lastUpdated, style: .relative) ago"))
                        .font(.caption2).foregroundStyle(.secondary)
                }
                if !manager.hasReceivedData {
                    Text(String(localized: "Waiting for data from iPhone...")).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }.refreshable { manager.requestRefresh() }.accessibilityElement(children: .combine)
    }
    private var formattedBalance: String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = manager.currencyCode; f.maximumFractionDigits = 2
        let v = Double(manager.balanceMinorUnits) / 100.0
        return f.string(from: NSNumber(value: v)) ?? "\(manager.currencyCode) \(v)"
    }
}
#Preview("Balance View") { let m = WatchConnectivityManager(); BalanceView(manager: m) }

