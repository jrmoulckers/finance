// SPDX-License-Identifier: BUSL-1.1

// SpendingComplicationProvider.swift
// FinanceWatch
//
// WidgetKit complication that shows today's total spending on the watch face.
// Reads pre-computed spending data from the shared App Group defaults
// written by the iPhone app's WatchDataSender.
// Refs #266

import SwiftUI
import WidgetKit

// MARK: - Timeline Entry

/// Timeline entry for the today's spending complication.
struct SpendingComplicationEntry: TimelineEntry {
    let date: Date
    let spentTodayMinorUnits: Int64
    let dailyTargetMinorUnits: Int64
    let currencyCode: String
    let transactionCount: Int

    /// Fraction of daily target spent (0.0–1.0+).
    var fraction: Double {
        guard dailyTargetMinorUnits > 0 else { return 0 }
        return min(
            max(Double(spentTodayMinorUnits) / Double(dailyTargetMinorUnits), 0),
            1.0
        )
    }

    /// Raw progress unclamped — used for over-target detection.
    var rawProgress: Double {
        guard dailyTargetMinorUnits > 0 else { return 0 }
        return Double(spentTodayMinorUnits) / Double(dailyTargetMinorUnits)
    }

    var isOverTarget: Bool {
        spentTodayMinorUnits > dailyTargetMinorUnits && dailyTargetMinorUnits > 0
    }

    static let placeholder = SpendingComplicationEntry(
        date: .now,
        spentTodayMinorUnits: 42_50,
        dailyTargetMinorUnits: 100_00,
        currencyCode: "USD",
        transactionCount: 3
    )
}

// MARK: - Data Keys

enum SpendingComplicationDataKey {
    static let spentTodayMinorUnits = "complication.spentToday"
    static let dailyTargetMinorUnits = "complication.dailyTarget"
    static let transactionCount = "complication.transactionCount"
}

// MARK: - Timeline Provider

/// Reads today's spending data from App Group shared defaults
/// and provides it to the complication timeline.
struct SpendingComplicationProvider: TimelineProvider {

    func placeholder(in context: Context) -> SpendingComplicationEntry {
        .placeholder
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (SpendingComplicationEntry) -> Void
    ) {
        completion(currentEntry())
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<SpendingComplicationEntry>) -> Void
    ) {
        let nextUpdate = Calendar.current.date(
            byAdding: .minute, value: 15, to: .now
        ) ?? .now.addingTimeInterval(900)
        completion(Timeline(
            entries: [currentEntry()],
            policy: .after(nextUpdate)
        ))
    }

    private func currentEntry() -> SpendingComplicationEntry {
        guard let defaults = UserDefaults(
            suiteName: WatchConstants.appGroupIdentifier
        ) else {
            return .placeholder
        }

        let spent = defaults.object(
            forKey: SpendingComplicationDataKey.spentTodayMinorUnits
        ) as? Int64 ?? SpendingComplicationEntry.placeholder.spentTodayMinorUnits

        let target = defaults.object(
            forKey: SpendingComplicationDataKey.dailyTargetMinorUnits
        ) as? Int64 ?? SpendingComplicationEntry.placeholder.dailyTargetMinorUnits

        let count = defaults.integer(
            forKey: SpendingComplicationDataKey.transactionCount
        )

        let currency = defaults.string(
            forKey: ComplicationDataKey.currencyCode
        ) ?? "USD"

        return SpendingComplicationEntry(
            date: .now,
            spentTodayMinorUnits: spent,
            dailyTargetMinorUnits: target,
            currencyCode: currency,
            transactionCount: count
        )
    }
}

// MARK: - Widget

/// Today's spending complication for the watch face.
///
/// Shows how much has been spent today relative to a daily target.
/// Supports circular, rectangular, inline, and corner families.
struct SpendingComplication: Widget {
    let kind = "SpendingComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: SpendingComplicationProvider()
        ) { entry in
            SpendingComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Today's Spending"))
        .description(Text("Shows how much you've spent today."))
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}

// MARK: - Views

struct SpendingComplicationView: View {
    @Environment(\.widgetFamily) var family
    let entry: SpendingComplicationEntry

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
        VStack(spacing: 1) {
            Image(systemName: "creditcard")
                .font(.caption)
                .accessibilityHidden(true)

            Text(compactAmount)
                .font(.caption2)
                .fontWeight(.semibold)
                .minimumScaleFactor(0.6)
        }
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Rectangular

    private var rectangularView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "Today's Spending"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Text(formattedAmount)
                    .font(.caption)
                    .fontWeight(.bold)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)

                if entry.dailyTargetMinorUnits > 0 {
                    Gauge(value: entry.fraction) {
                        EmptyView()
                    }
                    .gaugeStyle(.linearCapacity)
                    .tint(gaugeColor)
                }
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Inline

    private var inlineView: some View {
        Text(String(localized: "Spent: \(formattedAmount)"))
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Corner

    private var cornerView: some View {
        Text(compactAmount)
            .font(.caption)
            .fontWeight(.semibold)
            .widgetLabel {
                Text(String(localized: "Spent Today"))
            }
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: Formatting

    private var formattedAmount: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = entry.currencyCode
        formatter.maximumFractionDigits = 0
        let value = Double(entry.spentTodayMinorUnits) / 100.0
        return formatter.string(
            from: NSNumber(value: value)
        ) ?? "\(entry.currencyCode) \(entry.spentTodayMinorUnits / 100)"
    }

    private var compactAmount: String {
        let value = Double(entry.spentTodayMinorUnits) / 100.0
        let absValue = Swift.abs(value)
        let symbol = currencySymbol

        if absValue >= 1_000 {
            return "\(symbol)\(String(format: "%.1fK", absValue / 1_000))"
        }
        return "\(symbol)\(Int(absValue))"
    }

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = entry.currencyCode
        formatter.locale = .current
        return formatter.currencySymbol ?? "$"
    }

    private var gaugeColor: Color {
        if entry.rawProgress >= 1.0 { return .red }
        if entry.rawProgress >= 0.75 { return .orange }
        return .green
    }

    private var accessibilityDescription: String {
        let countLabel = entry.transactionCount == 1
            ? String(localized: "1 transaction")
            : String(localized: "\(entry.transactionCount) transactions")

        if entry.isOverTarget {
            return String(
                localized: "Spent \(formattedAmount) today across \(countLabel), over daily target"
            )
        }
        return String(
            localized: "Spent \(formattedAmount) today across \(countLabel)"
        )
    }
}
