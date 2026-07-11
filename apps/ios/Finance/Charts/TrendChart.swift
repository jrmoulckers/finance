// SPDX-License-Identifier: BUSL-1.1

// TrendChart.swift
// Finance
//
// Line chart for net-worth or spending trends over time.
// Uses the IBM CVD-safe palette for colour-blind accessibility.
// Refs #28

import Charts
import SwiftUI

// MARK: - Data Model

/// A single data point on a trend line.
struct TrendDataPoint: Identifiable, Sendable {
    let id = UUID()
    let date: Date
    /// Value in the user's display currency (dollars).
    let value: Double
    /// The name of the series this point belongs to (e.g. "Net Worth", "Spending").
    let series: String
}

// MARK: - View

/// A line chart that renders one or more financial trend series over time.
///
/// Each series is assigned a colour from ChartColorPalette.
/// Interactive selection via chartOverlay lets users tap/drag to inspect values.
struct TrendChart: View {
    let data: [TrendDataPoint]
    let currencyCode: String

    @State private var selectedDate: Date?
    @State private var selectedIndex: Int?

    /// Unique series names, preserving first-occurrence order.
    private var seriesNames: [String] {
        var seen = Set<String>()
        return data.compactMap { point in
            if seen.insert(point.series).inserted {
                return point.series
            }
            return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Trend"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            Chart(data) { point in
                LineMark(
                    x: .value(String(localized: "Date"), point.date),
                    y: .value(String(localized: "Amount"), point.value)
                )
                .foregroundStyle(
                    colorForSeries(point.series)
                )
                .symbol(by: .value(String(localized: "Series"), point.series))
                .interpolationMethod(.catmullRom)
                .accessibilityLabel(point.series)
                .accessibilityValue(
                    "\(formattedDate(point.date)), \(formattedCurrency(point.value))"
                )

                AreaMark(
                    x: .value(String(localized: "Date"), point.date),
                    y: .value(String(localized: "Amount"), point.value)
                )
                .foregroundStyle(
                    colorForSeries(point.series).opacity(0.1)
                )

                if let selectedDate,
                   Calendar.current.isDate(point.date, inSameDayAs: selectedDate),
                   point.series == seriesNames.first {
                    RuleMark(x: .value(String(localized: "Selected"), selectedDate))
                        .foregroundStyle(.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        .accessibilityHidden(true)

                    PointMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Amount"), point.value)
                    )
                    .symbolSize(60)
                    .foregroundStyle(colorForSeries(point.series))
                    .accessibilityLabel(
                        String(localized: "Selected: \(point.series)")
                    )
                    .accessibilityValue(formattedCurrency(point.value))
                }
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
                AxisMarks(values: .stride(by: .month)) { _ in
                    AxisValueLabel(format: .dateTime.month(.abbreviated))
                        .font(.caption2)
                    AxisGridLine()
                }
            }
            .chartOverlay { proxy in
                GeometryReader { geometry in
                    Rectangle()
                        .fill(.clear)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { drag in
                                    let origin = geometry[proxy.plotFrame!].origin
                                    let x = drag.location.x - origin.x
                                    if let date: Date = proxy.value(atX: x) {
                                        selectedDate = date
                                    }
                                }
                                .onEnded { _ in
                                    selectedDate = nil
                                }
                        )
                }
            }
            .frame(minHeight: 220)
            .drawingGroup()  // Rasterise into a single Metal layer for 60 FPS scrolling
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "Financial trend line chart"))
            .accessibilityValue(accessibilityValueText)
            .accessibilityHint(String(localized: "Swipe up or down with one finger to move through data points"))
            .accessibilityAdjustableAction { direction in
                stepSelection(direction)
            }

            ChartDataTable(
                summary: chartSummary,
                rows: chartRows,
                tableLabel: String(localized: "Trend data table")
            )
        }
        .padding()
    }

    // MARK: - VoiceOver Point Navigation (#2115)
    //
    // VoiceOver users move point-by-point with the standard adjustable rotor
    // (swipe up/down) instead of the touch-drag gesture, which is unusable
    // without sight. Each step announces the date and value — and, for
    // multi-series charts, the series — and mirrors the selection visually.

    /// Spoken value for the chart: the current point when one is selected,
    /// otherwise the full trend summary.
    private var accessibilityValueText: String {
        guard let index = selectedIndex, data.indices.contains(index) else {
            return chartSummary
        }
        let point = data[index]
        if seriesNames.count > 1 {
            return "\(point.series), \(formattedDate(point.date)), \(formattedCurrency(point.value))"
        }
        return "\(formattedDate(point.date)), \(formattedCurrency(point.value))"
    }

    /// Advances or rewinds the selected point in response to the VoiceOver
    /// adjustable action, keeping the visual selection in sync.
    private func stepSelection(_ direction: AccessibilityAdjustmentDirection) {
        guard !data.isEmpty else { return }
        switch direction {
        case .increment:
            selectedIndex = min((selectedIndex ?? -1) + 1, data.count - 1)
        case .decrement:
            selectedIndex = max((selectedIndex ?? 0) - 1, 0)
        @unknown default:
            break
        }
        if let index = selectedIndex, data.indices.contains(index) {
            selectedDate = data[index].date
        }
    }

    // MARK: - Text Alternative (#2113)

    /// Spoken summary describing the date range and, per series, the latest,
    /// highest, and lowest values so VoiceOver users get the trend in text.
    private var chartSummary: String {
        guard let firstDate = data.map(\.date).min(),
              let lastDate = data.map(\.date).max() else {
            return String(localized: "No trend data available.")
        }
        let range = "\(formattedDate(firstDate)) to \(formattedDate(lastDate))"
        let parts = seriesNames.map { name -> String in
            let values = data.filter { $0.series == name }.map(\.value)
            let latest = data.last(where: { $0.series == name })?.value ?? 0
            let high = values.max() ?? 0
            let low = values.min() ?? 0
            return String(localized: "\(name): latest \(formattedCurrency(latest)), high \(formattedCurrency(high)), low \(formattedCurrency(low)).")
        }
        return String(localized: "Trend from \(range). ") + parts.joined(separator: " ")
    }

    /// One row per data point, kept in the same order as the chart.
    private var chartRows: [ChartDataRow] {
        data.map { point in
            ChartDataRow(
                label: seriesNames.count > 1
                    ? "\(point.series), \(formattedDate(point.date))"
                    : formattedDate(point.date),
                value: formattedCurrency(point.value)
            )
        }
    }

    // MARK: - Helpers

    private func colorForSeries(_ series: String) -> Color {
        let index = seriesNames.firstIndex(of: series) ?? 0
        return ChartColorPalette.color(at: index)
    }

    /// Cached currency formatter — avoids allocating a new
    /// `NumberFormatter` on every chart render / axis label.
    private static let currencyFormatters = TrendCurrencyFormatterCache()

    private func formattedCurrency(_ value: Double) -> String {
        Self.currencyFormatters.format(value, currencyCode: currencyCode)
    }

    private func formattedDate(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }
}

/// Thread-safe cache for trend chart currency formatters.
private final class TrendCurrencyFormatterCache: @unchecked Sendable {
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

#Preview("Trend Chart - Net Worth") {
    let calendar = Calendar.current
    let today = Date.now
    let points: [TrendDataPoint] = (0..<12).map { monthOffset in
        let date = calendar.date(byAdding: .month, value: -11 + monthOffset, to: today)!
        return TrendDataPoint(
            date: date,
            value: 12_000 + Double(monthOffset) * 850 + Double.random(in: -200...200),
            series: "Net Worth"
        )
    }

    TrendChart(data: points, currencyCode: "USD")
}

#Preview("Trend Chart - Multi-Series") {
    let calendar = Calendar.current
    let today = Date.now
    let income: [TrendDataPoint] = (0..<6).map { i in
        TrendDataPoint(
            date: calendar.date(byAdding: .month, value: -5 + i, to: today)!,
            value: 5_000 + Double.random(in: -300...300),
            series: "Income"
        )
    }
    let spending: [TrendDataPoint] = (0..<6).map { i in
        TrendDataPoint(
            date: calendar.date(byAdding: .month, value: -5 + i, to: today)!,
            value: 3_500 + Double.random(in: -400...400),
            series: "Spending"
        )
    }

    TrendChart(data: income + spending, currencyCode: "USD")
}
