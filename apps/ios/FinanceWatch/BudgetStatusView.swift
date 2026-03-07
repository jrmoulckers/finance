// BudgetStatusView.swift
// FinanceWatch
//
// Top-3 budget utilisation rings displayed on Apple Watch.
// Uses compact Gauge views with haptic alerts for over-budget items.
// Refs #30

import SwiftUI
import WatchKit

struct BudgetStatusView: View {
    let manager: WatchConnectivityManager

    @State private var hasPlayedHaptic = false

    var body: some View {
        Group {
            if manager.budgetStatuses.isEmpty {
                emptyState
            } else {
                budgetRings
            }
        }
        .navigationTitle(String(localized: "Budgets"))
        .task {
            await playOverBudgetHaptic()
        }
    }

    private var budgetRings: some View {
        VStack(spacing: 12) {
            Text(String(localized: "Budget Status"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: 8) {
                ForEach(
                    Array(manager.budgetStatuses.prefix(3).enumerated()),
                    id: \.element.id
                ) { index, status in
                    budgetGauge(status: status, colorIndex: index)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func budgetGauge(status: WatchBudgetStatus, colorIndex: Int) -> some View {
        VStack(spacing: 4) {
            Gauge(value: status.fraction) {
                // Intentionally empty - label below
            } currentValueLabel: {
                Text(percentText(status))
                    .font(.system(.caption2, design: .rounded))
                    .fontWeight(.bold)
            }
            .gaugeStyle(.accessoryCircular)
            .tint(status.isOverBudget ? .red : tintColor(for: colorIndex))

            Text(status.name)
                .font(.system(.caption2))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(status.name)
        .accessibilityValue(
            String(localized: "\(percentText(status)) spent, \(formattedCurrency(status.spent)) of \(formattedCurrency(status.budgeted))")
        )
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.pie")
                .font(.title3)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "No budgets set"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel(String(localized: "No budgets set"))
    }

    private func playOverBudgetHaptic() async {
        guard !hasPlayedHaptic else { return }
        let hasOverBudget = manager.budgetStatuses.contains { $0.isOverBudget }
        if hasOverBudget {
            WKInterfaceDevice.current().play(.notification)
            hasPlayedHaptic = true
        }
    }

    private func tintColor(for index: Int) -> Color {
        let colors: [Color] = [.blue, .purple, .teal]
        return colors[index % colors.count]
    }

    private func percentText(_ status: WatchBudgetStatus) -> String {
        let pct = Int((status.fraction * 100).rounded())
        return "\(pct)%"
    }

    private func formattedCurrency(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = manager.currencyCode
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value))
            ?? "\(manager.currencyCode) \(Int(value))"
    }
}

#Preview("Budget Status") {
    let manager = WatchConnectivityManager()
    BudgetStatusView(manager: manager)
}
