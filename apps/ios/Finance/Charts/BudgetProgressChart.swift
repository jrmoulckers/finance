// SPDX-License-Identifier: BUSL-1.1

// BudgetProgressChart.swift
// Finance
//
// Gauge / ring chart showing budget utilisation for a single budget.
// Uses the IBM CVD-safe palette for colour-blind accessibility.
// Refs #28

import SwiftUI

// MARK: - Data Model

/// Represents the current utilisation state for one budget.
struct BudgetProgress: Identifiable, Sendable {
    let id = UUID()
    let name: String
    /// Amount spent so far (dollars, not cents).
    let spent: Double
    /// Total budgeted amount (dollars, not cents).
    let budgeted: Double
    /// Zero-based index used for CVD-safe colour assignment.
    let colorIndex: Int

    /// Fraction spent (clamped to 0...1 for the gauge).
    var fraction: Double {
        guard budgeted > 0 else { return 0 }
        return min(max(spent / budgeted, 0), 1)
    }

    /// True when spending exceeds the budget.
    var isOverBudget: Bool { spent > budgeted }
}

// MARK: - Single Ring View

/// A single budget ring rendered as a Gauge.
struct BudgetRing: View {
    let progress: BudgetProgress
    let currencyCode: String

    var body: some View {
        Gauge(value: progress.fraction) {
            Text(progress.name)
                .font(.caption)
        } currentValueLabel: {
            Text(percentText)
                .font(.caption2)
                .fontWeight(.semibold)
        } minimumValueLabel: {
            Text("0")
                .font(.caption2)
        } maximumValueLabel: {
            Text(formattedCurrency(progress.budgeted))
                .font(.caption2)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(ringGradient)
        .accessibilityLabel(progress.name)
        .accessibilityValue(
            String(localized: "\(percentText) spent, \(formattedCurrency(progress.spent)) of \(formattedCurrency(progress.budgeted))")
        )
    }

    // MARK: - Helpers

    private var percentText: String {
        let pct = Int((progress.fraction * 100).rounded())
        return "\(pct)%"
    }

    private var ringGradient: some ShapeStyle {
        if progress.isOverBudget {
            return AnyShapeStyle(Color.red)
        }
        return AnyShapeStyle(
            ChartColorPalette.color(at: progress.colorIndex)
        )
    }

    private func formattedCurrency(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value))
            ?? "\(currencyCode) \(Int(value))"
    }
}

// MARK: - Collection View

/// Displays multiple budget rings in a responsive grid.
struct BudgetProgressChart: View {
    let budgets: [BudgetProgress]
    let currencyCode: String

    private let columns = [
        GridItem(.adaptive(minimum: 100, maximum: 160), spacing: 16)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Budget Progress"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(budgets) { budget in
                    BudgetRing(progress: budget, currencyCode: currencyCode)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Budget utilisation gauges"))
        }
        .padding()
    }
}

// MARK: - Preview

#Preview("Budget Progress") {
    BudgetProgressChart(
        budgets: [
            BudgetProgress(name: "Food", spent: 420, budgeted: 600, colorIndex: 0),
            BudgetProgress(name: "Transport", spent: 290, budgeted: 300, colorIndex: 1),
            BudgetProgress(name: "Entertainment", spent: 200, budgeted: 150, colorIndex: 2),
            BudgetProgress(name: "Utilities", spent: 110, budgeted: 250, colorIndex: 3),
        ],
        currencyCode: "USD"
    )
}
