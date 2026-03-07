// CategoryBreakdownChart.swift
// Finance
//
// Donut / pie chart showing the proportional breakdown of spending by category.
// Uses the IBM CVD-safe palette for colour-blind accessibility.
// Refs #28

import Charts
import SwiftUI

// MARK: - Data Model

/// A single slice in the category breakdown chart.
struct CategorySlice: Identifiable, Sendable {
    let id = UUID()
    let category: String
    /// Amount in the user's display currency (dollars).
    let amount: Double
    /// Zero-based index for CVD-safe colour assignment.
    let colorIndex: Int
}

// MARK: - View

/// A donut chart showing proportional spending per category.
///
/// Tapping a slice highlights it and shows a detail callout.
struct CategoryBreakdownChart: View {
    let data: [CategorySlice]
    let currencyCode: String

    @State private var selectedCategory: String?

    private var totalSpending: Double {
        data.reduce(0) { $0 + $1.amount }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Category Breakdown"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            Chart(data) { slice in
                SectorMark(
                    angle: .value(String(localized: "Amount"), slice.amount),
                    innerRadius: .ratio(0.6),
                    angularInset: 1.5
                )
                .cornerRadius(4)
                .foregroundStyle(ChartColorPalette.color(at: slice.colorIndex))
                .opacity(selectedCategory == nil || selectedCategory == slice.category ? 1 : 0.4)
                .accessibilityLabel(slice.category)
                .accessibilityValue(
                    "\(formattedCurrency(slice.amount)), \(percentageText(for: slice))"
                )
            }
            .chartAngleSelection(value: $selectedAngle)
            .frame(minHeight: 240)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Category breakdown donut chart"))

            // Legend
            legendView
        }
        .padding()
        .onChange(of: selectedAngle) { _, newValue in
            withAnimation(.easeInOut(duration: 0.15)) {
                selectedCategory = categoryForAngle(newValue)
            }
        }
    }

    // MARK: - Angle Selection

    @State private var selectedAngle: Double?

    private func categoryForAngle(_ angle: Double?) -> String? {
        guard let angle else { return nil }
        var cumulative: Double = 0
        for slice in data {
            cumulative += slice.amount
            if angle <= cumulative {
                return slice.category
            }
        }
        return data.last?.category
    }

    // MARK: - Legend

    private var legendView: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 130, maximum: 200))],
            alignment: .leading,
            spacing: 6
        ) {
            ForEach(data) { slice in
                HStack(spacing: 6) {
                    Circle()
                        .fill(ChartColorPalette.color(at: slice.colorIndex))
                        .frame(width: 10, height: 10)
                        .accessibilityHidden(true)

                    Text(slice.category)
                        .font(.caption)
                        .lineLimit(1)

                    Spacer()

                    Text(percentageText(for: slice))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    "\(slice.category), \(formattedCurrency(slice.amount)), \(percentageText(for: slice))"
                )
            }
        }
    }

    // MARK: - Helpers

    private func percentageText(for slice: CategorySlice) -> String {
        guard totalSpending > 0 else { return "0%" }
        let pct = Int(((slice.amount / totalSpending) * 100).rounded())
        return "\(pct)%"
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

// MARK: - Preview

#Preview("Category Breakdown") {
    CategoryBreakdownChart(
        data: [
            CategorySlice(category: "Food & Dining", amount: 520, colorIndex: 0),
            CategorySlice(category: "Transport", amount: 310, colorIndex: 1),
            CategorySlice(category: "Entertainment", amount: 180, colorIndex: 2),
            CategorySlice(category: "Utilities", amount: 275, colorIndex: 3),
            CategorySlice(category: "Shopping", amount: 430, colorIndex: 4),
            CategorySlice(category: "Health", amount: 140, colorIndex: 5),
        ],
        currencyCode: "USD"
    )
}
