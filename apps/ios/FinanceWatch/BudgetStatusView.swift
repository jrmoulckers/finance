// SPDX-License-Identifier: BUSL-1.1
// BudgetStatusView.swift - Budget gauge rings. Refs #30, #649
import SwiftUI
import WatchKit
struct BudgetStatusView: View {
    let manager: WatchConnectivityManager
    @State private var hasPlayedHaptic = false
    var body: some View {
        Group {
            if manager.budgetStatuses.isEmpty { emptyState } else { budgetRings }
        }.navigationTitle(String(localized: "Budgets")).task { await playOverBudgetHaptic() }
    }
    private var budgetRings: some View {
        VStack(spacing: 12) {
            Text(String(localized: "Budget Status")).font(.caption).foregroundStyle(.secondary).accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                ForEach(Array(manager.budgetStatuses.prefix(3).enumerated()), id: \.element.id) { i, s in budgetGauge(status: s, colorIndex: i) }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    private func budgetGauge(status: WatchBudgetStatus, colorIndex: Int) -> some View {
        VStack(spacing: 4) {
            Gauge(value: status.fraction) { } currentValueLabel: {
                Text(percentText(status)).font(.system(.caption2, design: .rounded)).fontWeight(.bold)
            }.gaugeStyle(.accessoryCircular).tint(status.isOverBudget ? .red : tintColor(for: colorIndex))
            Text(status.name).font(.system(.caption2)).lineLimit(1).minimumScaleFactor(0.7)
        }.accessibilityElement(children: .combine).accessibilityLabel(status.name)
         .accessibilityValue(String(localized: "\(percentText(status)) spent, \(formattedCurrency(status.spentMinorUnits)) of \(formattedCurrency(status.budgetedMinorUnits))"))
    }
    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.pie").font(.title3).foregroundStyle(.secondary).accessibilityHidden(true)
            Text(String(localized: "No budgets set")).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity, maxHeight: .infinity).accessibilityLabel(String(localized: "No budgets set"))
    }
    private func playOverBudgetHaptic() async {
        guard !hasPlayedHaptic, manager.budgetStatuses.contains(where: { $0.isOverBudget }) else { return }
        WKInterfaceDevice.current().play(.notification); hasPlayedHaptic = true
    }
    private func tintColor(for i: Int) -> Color { [Color.blue, .purple, .teal][i % 3] }
    private func percentText(_ s: WatchBudgetStatus) -> String { "\(Int((s.fraction * 100).rounded()))%" }
    private func formattedCurrency(_ u: Int64) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = manager.currencyCode; f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: Double(u) / 100.0)) ?? "\(manager.currencyCode) \(u / 100)"
    }
}
#Preview("Budget Status") { let m = WatchConnectivityManager(); BudgetStatusView(manager: m) }

