// SPDX-License-Identifier: BUSL-1.1

// PredictionChart.swift
// Finance
//
// Line chart with confidence intervals for spending predictions.
// Uses the IBM CVD-safe palette and supports VoiceOver audio graphs.
//
// References: #269

import Charts
import SwiftUI

/// A chart showing historical spending and predicted future spending
/// with confidence interval bands.
struct PredictionChart: View {
    let historicalData: [TrendDataPoint]
    let predictions: [TrendPrediction]
    let currencyCode: String

    @State private var selectedDate: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Spending Forecast"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            Chart {
                // Historical data
                ForEach(historicalData) { point in
                    LineMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Amount"), point.value)
                    )
                    .foregroundStyle(ChartColorPalette.blue)
                    .interpolationMethod(.catmullRom)
                    .accessibilityLabel(point.series)
                    .accessibilityValue(formattedCurrency(point.value))
                }

                // Prediction confidence band
                ForEach(predictions) { prediction in
                    AreaMark(
                        x: .value(String(localized: "Date"), prediction.date),
                        yStart: .value(
                            String(localized: "Lower"),
                            Double(prediction.lowerBoundMinorUnits) / 100.0
                        ),
                        yEnd: .value(
                            String(localized: "Upper"),
                            Double(prediction.upperBoundMinorUnits) / 100.0
                        )
                    )
                    .foregroundStyle(ChartColorPalette.purple.opacity(0.15))
                    .accessibilityHidden(true)
                }

                // Prediction line
                ForEach(predictions) { prediction in
                    LineMark(
                        x: .value(String(localized: "Date"), prediction.date),
                        y: .value(
                            String(localized: "Predicted"),
                            Double(prediction.predictedMinorUnits) / 100.0
                        )
                    )
                    .foregroundStyle(ChartColorPalette.purple)
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [6, 4]))
                    .accessibilityLabel(String(localized: "Predicted spending"))
                    .accessibilityValue(
                        formattedCurrency(Double(prediction.predictedMinorUnits) / 100.0)
                    )
                }

                // Selection indicator
                if let selectedDate {
                    RuleMark(x: .value(String(localized: "Selected"), selectedDate))
                        .foregroundStyle(.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        .accessibilityHidden(true)
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
            .drawingGroup()
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Spending forecast chart with predictions"))
        }
        .padding()
    }

    // MARK: - Helpers

    private static let currencyFormatters = PredictionCurrencyFormatterCache()

    private func formattedCurrency(_ value: Double) -> String {
        Self.currencyFormatters.format(value, currencyCode: currencyCode)
    }
}

/// Thread-safe cache for prediction chart currency formatters.
private final class PredictionCurrencyFormatterCache: @unchecked Sendable {
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

#Preview("Prediction Chart") {
    let calendar = Calendar.current
    let today = Date.now
    let historical: [TrendDataPoint] = (0..<6).map { i in
        TrendDataPoint(
            date: calendar.date(byAdding: .month, value: -5 + i, to: today)!,
            value: 3_500 + Double.random(in: -400...400),
            series: "Spending"
        )
    }
    let predictions: [TrendPrediction] = (1...3).map { i in
        TrendPrediction(
            date: calendar.date(byAdding: .month, value: i, to: today)!,
            predictedMinorUnits: Int64(380_000 + i * 10_000),
            upperBoundMinorUnits: Int64(420_000 + i * 15_000),
            lowerBoundMinorUnits: Int64(340_000 + i * 5_000),
            confidencePercent: 95 - Double(i) * 5
        )
    }

    PredictionChart(
        historicalData: historical,
        predictions: predictions,
        currencyCode: "USD"
    )
}
