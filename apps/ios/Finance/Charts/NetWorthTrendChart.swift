// SPDX-License-Identifier: BUSL-1.1

// NetWorthTrendChart.swift
// Finance
//
// A clean, minimalist net-worth growth chart with an optional forward
// projection band. Reconstructed history is drawn as a solid line with a soft
// area fill; the projection continues as a dashed line so the "known past" and
// "estimated future" are visually distinct without relying on colour alone.
//
// VoiceOver users step through every point with the adjustable rotor (swipe
// up/down) — no drag gesture required — satisfying #2115.
//
// References: #2116, #2115, #2113

import Charts
import SwiftUI

/// A net-worth growth line chart with reconstructed history and a dashed
/// forward projection. Values are supplied in minor units.
struct NetWorthTrendChart: View {
    let history: [NetWorthTrendPoint]
    let projection: [NetWorthTrendPoint]
    let currencyCode: String

    @State private var selectedIndex: Int?

    /// History followed by projection, in chart order, for point navigation.
    private var orderedPoints: [NetWorthTrendPoint] { history + projection }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Chart {
                ForEach(history) { point in
                    LineMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Net Worth"), Double(point.valueMinorUnits) / 100.0),
                        series: .value(String(localized: "Series"), "history")
                    )
                    .foregroundStyle(ChartColorPalette.teal)
                    .interpolationMethod(.catmullRom)

                    AreaMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Net Worth"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [ChartColorPalette.teal.opacity(0.25), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .accessibilityHidden(true)
                }

                ForEach(projection) { point in
                    LineMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Net Worth"), Double(point.valueMinorUnits) / 100.0),
                        series: .value(String(localized: "Series"), "projection")
                    )
                    .foregroundStyle(ChartColorPalette.purple)
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [6, 4]))
                }

                if let index = selectedIndex, orderedPoints.indices.contains(index) {
                    let point = orderedPoints[index]
                    RuleMark(x: .value(String(localized: "Selected"), point.date))
                        .foregroundStyle(.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        .accessibilityHidden(true)
                    PointMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Net Worth"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .symbolSize(60)
                    .foregroundStyle(point.isProjected ? ChartColorPalette.purple : ChartColorPalette.teal)
                    .accessibilityHidden(true)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisValueLabel {
                        if let doubleValue = value.as(Double.self) {
                            Text(formattedAxis(doubleValue))
                                .font(.caption2)
                        }
                    }
                    AxisGridLine()
                }
            }
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel(format: .dateTime.month(.abbreviated))
                        .font(.caption2)
                    AxisGridLine()
                }
            }
            .frame(minHeight: 200)
            .drawingGroup()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "Net worth growth chart"))
            .accessibilityValue(accessibilityValueText)
            .accessibilityHint(String(localized: "Swipe up or down with one finger to move through months"))
            .accessibilityAdjustableAction { direction in
                stepSelection(direction)
            }

            ChartDataTable(
                summary: chartSummary,
                rows: chartRows,
                tableLabel: String(localized: "Net worth data table")
            )
        }
    }

    // MARK: - VoiceOver Navigation (#2115)

    private var accessibilityValueText: String {
        guard let index = selectedIndex, orderedPoints.indices.contains(index) else {
            return chartSummary
        }
        let point = orderedPoints[index]
        let qualifier = point.isProjected
            ? String(localized: "projected")
            : String(localized: "actual")
        return "\(formattedDate(point.date)), \(formattedCurrency(point.valueMinorUnits)), \(qualifier)"
    }

    private func stepSelection(_ direction: AccessibilityAdjustmentDirection) {
        guard !orderedPoints.isEmpty else { return }
        switch direction {
        case .increment:
            selectedIndex = min((selectedIndex ?? -1) + 1, orderedPoints.count - 1)
        case .decrement:
            selectedIndex = max((selectedIndex ?? 0) - 1, 0)
        @unknown default:
            break
        }
    }

    // MARK: - Text Alternative (#2113)

    private var chartSummary: String {
        guard let first = history.first ?? projection.first,
              let last = projection.last ?? history.last else {
            return String(localized: "No net worth history available.")
        }
        let start = formattedCurrency(first.valueMinorUnits)
        let end = formattedCurrency(last.valueMinorUnits)
        let range = "\(formattedDate(first.date)) to \(formattedDate(last.date))"
        if projection.isEmpty {
            return String(localized: "Net worth from \(range), \(start) to \(end).")
        }
        return String(localized: "Net worth from \(range), \(start) to a projected \(end).")
    }

    private var chartRows: [ChartDataRow] {
        orderedPoints.map { point in
            ChartDataRow(
                label: point.isProjected
                    ? String(localized: "\(formattedDate(point.date)) (projected)")
                    : formattedDate(point.date),
                value: formattedCurrency(point.valueMinorUnits)
            )
        }
    }

    // MARK: - Formatting

    private func formattedCurrency(_ minorUnits: Int64) -> String {
        CurrencyLabel.formatted(minorUnits: minorUnits, currencyCode: currencyCode)
    }

    private func formattedAxis(_ value: Double) -> String {
        let thousands = value / 1000.0
        return "\(Int(thousands.rounded()))k"
    }

    private func formattedDate(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).year())
    }
}
