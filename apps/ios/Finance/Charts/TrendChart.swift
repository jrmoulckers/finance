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
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Financial trend line chart"))
        }
        .padding()
    }

    // MARK: - Helpers

    private func colorForSeries(_ series: String) -> Color {
        let index = seriesNames.firstIndex(of: series) ?? 0
        return ChartColorPalette.color(at: index)
    }

    private func formattedCurrency(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: value))
            ?? "\(currencyCode) \(Int(value))"
    }

    private func formattedDate(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
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
