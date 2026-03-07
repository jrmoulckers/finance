// SpendingChart.swift
// Finance
//
// Bar chart showing spending by category using Swift Charts.
// Uses the IBM CVD-safe palette for colour-blind accessibility.
// Refs #28

import Charts
import SwiftUI

// MARK: - Data Model

/// A single spending entry for one category in a given period.
struct CategorySpending: Identifiable, Sendable {
    let id = UUID()
    let category: String
    /// Amount in the user's display currency (dollars, not cents).
    let amount: Double
    /// Zero-based index used to pick a CVD-safe color.
    let colorIndex: Int
}

// MARK: - View

/// A bar chart that visualises spending by category.
///
/// Bars are coloured using ChartColorPalette (IBM CVD-safe) and each bar
/// carries an accessibility label so VoiceOver can announce the data.
struct SpendingChart: View {
    let data: [CategorySpending]
    let currencyCode: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Spending by Category"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            Chart(data) { item in
                BarMark(
                    x: .value(String(localized: "Category"), item.category),
                    y: .value(String(localized: "Amount"), item.amount)
                )
                .foregroundStyle(ChartColorPalette.color(at: item.colorIndex))
                .accessibilityLabel(item.category)
                .accessibilityValue(
                    formattedCurrency(item.amount)
                )
            }
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisValueLabel {
                        if let doubleValue = value.as(Double.self) {
                            Text(formattedCurrency(doubleValue))
                                .font(.caption2)
                        }
                    }
                    AxisGridLine()
                }
            }
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel()
                        .font(.caption)
                }
            }
            .frame(minHeight: 220)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Spending by category bar chart"))
        }
        .padding()
    }

    // MARK: - Helpers

    private func formattedCurrency(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value))
            ?? "\(currencyCode) \(Int(value))"
    }
}

// MARK: - Preview

#Preview("Spending Chart") {
    SpendingChart(
        data: [
            CategorySpending(category: "Food", amount: 520, colorIndex: 0),
            CategorySpending(category: "Transport", amount: 310, colorIndex: 1),
            CategorySpending(category: "Entertainment", amount: 180, colorIndex: 2),
            CategorySpending(category: "Utilities", amount: 275, colorIndex: 3),
            CategorySpending(category: "Shopping", amount: 430, colorIndex: 4),
            CategorySpending(category: "Health", amount: 140, colorIndex: 5),
        ],
        currencyCode: "USD"
    )
}
