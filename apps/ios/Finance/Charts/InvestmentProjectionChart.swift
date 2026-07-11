// SPDX-License-Identifier: BUSL-1.1

// InvestmentProjectionChart.swift
// Finance
//
// A compound-growth projection chart for a portfolio. Plots the projected total
// balance as a solid line and the cumulative contributed principal as a dashed
// line, so the shaded gap between them makes market growth legible at a glance.
//
// VoiceOver users step through each yearly point with the adjustable rotor
// (swipe up/down) — no drag gesture required (#2115).
//
// References: #2118, #2116, #2115, #2113

import Charts
import SwiftUI

/// A line chart of a compound-growth projection: total value versus contributed
/// principal, sampled once per year. Values are in minor units.
struct InvestmentProjectionChart: View {
    let points: [ProjectionPoint]
    let currencyCode: String

    @State private var selectedIndex: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Chart {
                ForEach(points) { point in
                    LineMark(
                        x: .value(String(localized: "Year"), point.date),
                        y: .value(String(localized: "Value"), Double(point.valueMinorUnits) / 100.0),
                        series: .value(String(localized: "Series"), "value")
                    )
                    .foregroundStyle(ChartColorPalette.blue)
                    .interpolationMethod(.monotone)

                    AreaMark(
                        x: .value(String(localized: "Year"), point.date),
                        yStart: .value(String(localized: "Contributed"), Double(point.contributedMinorUnits) / 100.0),
                        yEnd: .value(String(localized: "Value"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .foregroundStyle(ChartColorPalette.blue.opacity(0.12))
                    .accessibilityHidden(true)

                    LineMark(
                        x: .value(String(localized: "Year"), point.date),
                        y: .value(String(localized: "Contributed"), Double(point.contributedMinorUnits) / 100.0),
                        series: .value(String(localized: "Series"), "contributed")
                    )
                    .foregroundStyle(ChartColorPalette.gold)
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
                }

                if let index = selectedIndex, points.indices.contains(index) {
                    let point = points[index]
                    RuleMark(x: .value(String(localized: "Selected"), point.date))
                        .foregroundStyle(.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        .accessibilityHidden(true)
                    PointMark(
                        x: .value(String(localized: "Year"), point.date),
                        y: .value(String(localized: "Value"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .symbolSize(60)
                    .foregroundStyle(ChartColorPalette.blue)
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
                    AxisValueLabel(format: .dateTime.year())
                        .font(.caption2)
                    AxisGridLine()
                }
            }
            .frame(minHeight: 200)
            .drawingGroup()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "Investment growth projection chart"))
            .accessibilityValue(accessibilityValueText)
            .accessibilityHint(String(localized: "Swipe up or down with one finger to move through each projected year"))
            .accessibilityAdjustableAction { direction in
                stepSelection(direction)
            }

            ChartDataTable(
                summary: chartSummary,
                rows: chartRows,
                tableLabel: String(localized: "Projection data table")
            )
        }
    }

    // MARK: - VoiceOver Navigation (#2115)

    private var accessibilityValueText: String {
        guard let index = selectedIndex, points.indices.contains(index) else {
            return chartSummary
        }
        let point = points[index]
        let value = formattedCurrency(point.valueMinorUnits)
        let growth = formattedCurrency(point.growthMinorUnits)
        return String(localized: "\(formattedYear(point.date)), value \(value), of which growth \(growth)")
    }

    private func stepSelection(_ direction: AccessibilityAdjustmentDirection) {
        guard !points.isEmpty else { return }
        switch direction {
        case .increment:
            selectedIndex = min((selectedIndex ?? -1) + 1, points.count - 1)
        case .decrement:
            selectedIndex = max((selectedIndex ?? 0) - 1, 0)
        @unknown default:
            break
        }
    }

    // MARK: - Text Alternative (#2113)

    private var chartSummary: String {
        guard let first = points.first, let last = points.last, points.count > 1 else {
            return String(localized: "No projection available.")
        }
        let startValue = formattedCurrency(first.valueMinorUnits)
        let endValue = formattedCurrency(last.valueMinorUnits)
        let contributed = formattedCurrency(last.contributedMinorUnits)
        let growth = formattedCurrency(last.growthMinorUnits)
        return String(localized: "Projection from \(startValue) to \(endValue) over \(points.count - 1) years, with \(contributed) contributed and \(growth) of projected growth.")
    }

    private var chartRows: [ChartDataRow] {
        points.map { point in
            ChartDataRow(
                label: formattedYear(point.date),
                value: String(localized: "\(formattedCurrency(point.valueMinorUnits)) (contributed \(formattedCurrency(point.contributedMinorUnits)))")
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

    private func formattedYear(_ date: Date) -> String {
        date.formatted(.dateTime.year())
    }
}
