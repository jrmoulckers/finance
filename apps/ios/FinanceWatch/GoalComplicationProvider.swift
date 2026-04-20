// SPDX-License-Identifier: BUSL-1.1

// GoalComplicationProvider.swift
// FinanceWatch
//
// WidgetKit complication that shows savings goal progress on the watch face.
// Displays the primary active goal's progress as a gauge.
// Refs #266

import SwiftUI
import WidgetKit

// MARK: - Timeline Entry

/// Timeline entry for the goal progress complication.
struct GoalComplicationEntry: TimelineEntry {
    let date: Date
    let goalName: String
    let currentMinorUnits: Int64
    let targetMinorUnits: Int64
    let currencyCode: String

    /// Fraction of goal achieved (0.0–1.0).
    var fraction: Double {
        guard targetMinorUnits > 0 else { return 0 }
        return min(
            max(Double(currentMinorUnits) / Double(targetMinorUnits), 0),
            1.0
        )
    }

    /// Raw progress — can exceed 1.0 if goal is overachieved.
    var rawProgress: Double {
        guard targetMinorUnits > 0 else { return 0 }
        return Double(currentMinorUnits) / Double(targetMinorUnits)
    }

    var isComplete: Bool { currentMinorUnits >= targetMinorUnits }

    static let placeholder = GoalComplicationEntry(
        date: .now,
        goalName: String(localized: "Savings Goal"),
        currentMinorUnits: 7_500_00,
        targetMinorUnits: 10_000_00,
        currencyCode: "USD"
    )
}

// MARK: - Data Keys

enum GoalComplicationDataKey {
    static let goalName = "complication.goalName"
    static let goalCurrentMinorUnits = "complication.goalCurrent"
    static let goalTargetMinorUnits = "complication.goalTarget"
}

// MARK: - Timeline Provider

/// Reads the primary goal from App Group shared defaults
/// and provides it to the complication timeline.
struct GoalComplicationProvider: TimelineProvider {

    func placeholder(in context: Context) -> GoalComplicationEntry {
        .placeholder
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (GoalComplicationEntry) -> Void
    ) {
        completion(currentEntry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<GoalComplicationEntry>) -> Void
    ) {
        let nextUpdate = Calendar.current.date(
            byAdding: .hour, value: 1, to: .now
        ) ?? .now.addingTimeInterval(3600)
        completion(Timeline(
            entries: [currentEntry()],
            policy: .after(nextUpdate)
        ))
    }

    private func currentEntry() -> GoalComplicationEntry {
        guard let defaults = UserDefaults(
            suiteName: WatchConstants.appGroupIdentifier
        ) else {
            return .placeholder
        }

        let name = defaults.string(
            forKey: GoalComplicationDataKey.goalName
        ) ?? GoalComplicationEntry.placeholder.goalName

        let current = defaults.object(
            forKey: GoalComplicationDataKey.goalCurrentMinorUnits
        ) as? Int64 ?? GoalComplicationEntry.placeholder.currentMinorUnits

        let target = defaults.object(
            forKey: GoalComplicationDataKey.goalTargetMinorUnits
        ) as? Int64 ?? GoalComplicationEntry.placeholder.targetMinorUnits

        let currency = defaults.string(
            forKey: ComplicationDataKey.currencyCode
        ) ?? "USD"

        return GoalComplicationEntry(
            date: .now,
            goalName: name,
            currentMinorUnits: current,
            targetMinorUnits: target,
            currencyCode: currency
        )
    }
}

// MARK: - Widget

/// Goal progress complication for the watch face.
///
/// Shows progress toward a savings goal using a gauge.
/// Supports circular, rectangular, inline, and corner families.
struct GoalComplication: Widget {
    let kind = "GoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: GoalComplicationProvider()
        ) { entry in
            GoalComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Goal Progress"))
        .description(Text("Track progress toward your savings goal."))
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}

// MARK: - Views

struct GoalComplicationView: View {
    @Environment(\.widgetFamily) var family
    let entry: GoalComplicationEntry

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
            Image(systemName: entry.isComplete ? "checkmark.circle.fill" : "target")
                .font(.caption2)
                .accessibilityHidden(true)
        } currentValueLabel: {
            Text(percentText)
                .font(.system(.caption2, design: .rounded))
                .fontWeight(.bold)
        }
        .gaugeStyle(.accessoryCircular)
        .tint(gaugeGradient)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Rectangular

    private var rectangularView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.goalName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(formattedCurrent)
                        .font(.caption)
                        .fontWeight(.bold)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)

                    Text(String(localized: "of \(formattedTarget)"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    if entry.isComplete {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                            .accessibilityHidden(true)
                    }
                }

                Gauge(value: entry.fraction) {
                    EmptyView()
                }
                .gaugeStyle(.linearCapacity)
                .tint(gaugeGradient)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Inline

    private var inlineView: some View {
        Text("\(entry.goalName) \(percentText)")
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Corner

    private var cornerView: some View {
        Text(percentText)
            .font(.caption)
            .fontWeight(.semibold)
            .widgetLabel {
                Gauge(value: entry.fraction) {
                    Text(entry.goalName)
                }
                .gaugeStyle(.linearCapacity)
                .tint(gaugeGradient)
            }
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Formatting

    private var percentText: String {
        "\(Int((entry.rawProgress * 100).rounded()))%"
    }

    private var gaugeGradient: some ShapeStyle {
        entry.isComplete ? AnyShapeStyle(.green) : AnyShapeStyle(.blue)
    }

    private var formattedCurrent: String {
        formatCurrency(minorUnits: entry.currentMinorUnits)
    }

    private var formattedTarget: String {
        formatCurrency(minorUnits: entry.targetMinorUnits)
    }

    private func formatCurrency(minorUnits: Int64) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = entry.currencyCode
        formatter.maximumFractionDigits = 0
        let value = Double(minorUnits) / 100.0
        return formatter.string(
            from: NSNumber(value: value)
        ) ?? "\(entry.currencyCode) \(minorUnits / 100)"
    }

    private var accessibilityDescription: String {
        if entry.isComplete {
            return String(
                localized: "\(entry.goalName) goal complete: \(formattedCurrent) saved"
            )
        }
        return String(
            localized: "\(entry.goalName) goal: \(percentText) complete, \(formattedCurrent) of \(formattedTarget)"
        )
    }
}
