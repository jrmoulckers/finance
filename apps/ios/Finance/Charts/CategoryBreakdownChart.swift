// SPDX-License-Identifier: BUSL-1.1

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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
            .drawingGroup()  // Rasterise into a single Metal layer for 60 FPS scrolling
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Category breakdown donut chart"))

            // Legend
            legendView

            ChartDataTable(
                summary: breakdownSummary,
                rows: breakdownRows,
                tableLabel: String(localized: "Category breakdown data table")
            )
        }
        .padding()
        .onChange(of: selectedAngle) { _, newValue in
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.15)) {
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
                        .fixedSize(horizontal: false, vertical: true)

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

    /// Spoken summary of the breakdown: total spend, category count, and the
    /// largest category, for VoiceOver users. (#2113)
    private var breakdownSummary: String {
        guard !data.isEmpty else {
            return String(localized: "No spending data available.")
        }
        let total = formattedCurrency(totalSpending)
        let largest = data.max { $0.amount < $1.amount }
        if let largest {
            return String(localized: "Spending across \(data.count) categories totalling \(total). Largest: \(largest.category) at \(formattedCurrency(largest.amount)), \(percentageText(for: largest)).")
        }
        return String(localized: "Spending across \(data.count) categories totalling \(total).")
    }

    /// One row per category slice, in the same order as the chart. (#2113)
    private var breakdownRows: [ChartDataRow] {
        data.map { slice in
            ChartDataRow(
                label: slice.category,
                value: "\(formattedCurrency(slice.amount)) (\(percentageText(for: slice)))"
            )
        }
    }

    private func percentageText(for slice: CategorySlice) -> String {
        guard totalSpending > 0 else { return "0%" }
        let pct = Int(((slice.amount / totalSpending) * 100).rounded())
        return "\(pct)%"
    }

    /// Cached currency formatter — avoids allocating a new
    /// `NumberFormatter` on every chart render.
    private static let currencyFormatters = BreakdownCurrencyFormatterCache()

    private func formattedCurrency(_ value: Double) -> String {
        Self.currencyFormatters.format(value, currencyCode: currencyCode)
    }
}

/// Thread-safe cache for breakdown chart currency formatters.
private final class BreakdownCurrencyFormatterCache: @unchecked Sendable {
    private var cache: [String: NumberFormatter] = [:]
    private let lock = NSLock()

    func format(_ value: Double, currencyCode: String) -> String {
        let formatter: NumberFormatter = {
            lock.lock()
            defer { lock.unlock() }
            if let cached = cache[currencyCode] { return cached }
            let f = NumberFormatter()
            f.numberStyle = .currency
            f.currencyCode = currencyCode
            f.maximumFractionDigits = 0
            cache[currencyCode] = f
            return f
        }()
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
