// SPDX-License-Identifier: BUSL-1.1

// BudgetComplicationProvider.swift
// FinanceWatch
//
// WidgetKit complication that shows budget utilization on the watch face.
// Displays the most critical budget (highest utilization) as a gauge.
// Refs #266

import SwiftUI
import WidgetKit

// MARK: - Timeline Entry

/// Timeline entry for the budget complication.
struct BudgetComplicationEntry: TimelineEntry {
    let date: Date
    let budgetName: String
    let spentMinorUnits: Int64
    let budgetedMinorUnits: Int64
    let currencyCode: String

    /// Fraction of budget consumed (0.0–1.0+).
    var fraction: Double {
        guard budgetedMinorUnits > 0 else { return 0 }
        return min(max(Double(spentMinorUnits) / Double(budgetedMinorUnits), 0), 1.0)
    }

    /// Raw progress unclamped for determining over-budget state.
    var rawProgress: Double {
        guard budgetedMinorUnits > 0 else { return 0 }
        return Double(spentMinorUnits) / Double(budgetedMinorUnits)
    }

    var isOverBudget: Bool { spentMinorUnits > budgetedMinorUnits }

    static let placeholder = BudgetComplicationEntry(
        date: .now,
        budgetName: String(localized: "Budget"),
        spentMinorUnits: 320_00,
        budgetedMinorUnits: 500_00,
        currencyCode: "USD"
    )
}

// MARK: - Timeline Provider

/// Reads the most critical budget from the shared App Group defaults
/// and provides it to the complication timeline.
struct BudgetComplicationProvider: TimelineProvider {

    func placeholder(in context: Context) -> BudgetComplicationEntry {
        .placeholder
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (BudgetComplicationEntry) -> Void
    ) {
        completion(currentEntry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<BudgetComplicationEntry>) -> Void
    ) {
        let nextUpdate = Calendar.current.date(
            byAdding: .minute, value: 30, to: .now
        ) ?? .now.addingTimeInterval(1800)
        completion(Timeline(
            entries: [currentEntry()],
            policy: .after(nextUpdate)
        ))
    }

    /// Reads budget data from the App Group shared defaults and selects
    /// the budget with the highest utilization percentage.
    private func currentEntry() -> BudgetComplicationEntry {
        guard let defaults = UserDefaults(
            suiteName: WatchConstants.appGroupIdentifier
        ) else {
            return .placeholder
        }

        guard let data = defaults.data(
            forKey: BudgetComplicationDataKey.budgets
        ) else {
            return .placeholder
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        guard let budgets = try? decoder.decode(
            [ComplicationBudget].self, from: data
        ), let critical = budgets.max(by: {
            $0.progress < $1.progress
        }) else {
            return .placeholder
        }

        return BudgetComplicationEntry(
            date: .now,
            budgetName: critical.name,
            spentMinorUnits: critical.spentMinorUnits,
            budgetedMinorUnits: critical.budgetedMinorUnits,
            currencyCode: defaults.string(
                forKey: ComplicationDataKey.currencyCode
            ) ?? "USD"
        )
    }
}

// MARK: - Complication Budget Model

/// Lightweight Codable model for budget data stored in App Group defaults.
struct ComplicationBudget: Codable, Sendable {
    let id: String
    let name: String
    let spentMinorUnits: Int64
    let budgetedMinorUnits: Int64

    var progress: Double {
        guard budgetedMinorUnits > 0 else { return 0 }
        return Double(spentMinorUnits) / Double(budgetedMinorUnits)
    }
}

// MARK: - Data Keys

enum BudgetComplicationDataKey {
    static let budgets = "complication.budgets"
}

// MARK: - Widget

/// Budget utilization complication for the watch face.
///
/// Supports circular, rectangular, inline, and corner families.
/// Shows a gauge with the most critical budget's utilization.
struct BudgetComplication: Widget {
    let kind = "BudgetComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: BudgetComplicationProvider()
        ) { entry in
            BudgetComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Budget Status"))
        .description(Text("Shows your most critical budget utilization."))
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}

// MARK: - Views

struct BudgetComplicationView: View {
    @Environment(\.widgetFamily) var family
    let entry: BudgetComplicationEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            circularView
        case .accessoryRectangular:
            rectangularView
        case .accessoryInline:
            inlineView
        case .accessoryCorner:
            cornerView
        default:
            circularView
        }
    }

    // MARK: Circular

    private var circularView: some View {
        Gauge(value: entry.fraction) {
            Image(systemName: "chart.pie")
                .font(.caption2)
                .accessibilityHidden(true)
        } currentValueLabel: {
            Text(percentText)
                .font(.system(.caption2, design: .rounded))
                .fontWeight(.bold)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(gaugeColor)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Rectangular

    private var rectangularView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.budgetName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(percentText)
                        .font(.caption)
                        .fontWeight(.bold)

                    if entry.isOverBudget {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(.red)
                            .accessibilityHidden(true)
                    }
                }

                Gauge(value: entry.fraction) {
                    EmptyView()
                }
                .gaugeStyle(.linearCapacity)
                .tint(gaugeColor)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Inline

    private var inlineView: some View {
        Text("\(entry.budgetName) \(percentText)")
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Corner

    private var cornerView: some View {
        Text(percentText)
            .font(.caption)
            .fontWeight(.semibold)
            .widgetLabel {
                Gauge(value: entry.fraction) {
                    Text(entry.budgetName)
                }
                .gaugeStyle(.linearCapacity)
                .tint(gaugeColor)
            }
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Helpers

    private var percentText: String {
        "\(Int((entry.rawProgress * 100).rounded()))%"
    }

    private var gaugeColor: Color {
        if entry.rawProgress >= 1.0 { return .red }
        if entry.rawProgress >= 0.75 { return .orange }
        return .green
    }

    private var accessibilityDescription: String {
        if entry.isOverBudget {
            return String(
                localized: "\(entry.budgetName) budget: over budget at \(percentText)"
            )
        }
        return String(
            localized: "\(entry.budgetName) budget: \(percentText) used"
        )
    }
}
