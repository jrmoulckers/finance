// SPDX-License-Identifier: BUSL-1.1

// ComplicationProvider.swift
// FinanceWatch
//
// WidgetKit complication showing the user's current balance on the watch face.
// Updates via a timeline provider that reads from the WatchConnectivity context.
// Refs #30

import SwiftUI
import WidgetKit

// MARK: - Timeline Entry

struct BalanceTimelineEntry: TimelineEntry {
    let date: Date
    let balance: Double
    let currencyCode: String
}

// MARK: - Timeline Provider

/// Reads the latest balance from shared UserDefaults (App Group).
/// Note: Only non-sensitive display data (formatted balance) is stored here.
/// Tokens and credentials remain in Keychain access groups.
struct BalanceComplicationProvider: TimelineProvider {
    private static let suiteName = "group.com.finance.watch"
    private static let balanceKey = "complication.totalBalance"
    private static let currencyKey = "complication.currencyCode"

    func placeholder(in context: Context) -> BalanceTimelineEntry {
        BalanceTimelineEntry(date: .now, balance: 0, currencyCode: "USD")
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceTimelineEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceTimelineEntry>) -> Void) {
        let entry = currentEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: .now)!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func currentEntry() -> BalanceTimelineEntry {
        let defaults = UserDefaults(suiteName: Self.suiteName)
        let balance = defaults?.double(forKey: Self.balanceKey) ?? 0
        let currency = defaults?.string(forKey: Self.currencyKey) ?? "USD"
        return BalanceTimelineEntry(date: .now, balance: balance, currencyCode: currency)
    }
}

// MARK: - Widget

struct BalanceComplication: Widget {
    let kind = "BalanceComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceComplicationProvider()) { entry in
            BalanceComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Balance"))
        .description(Text("Shows your current total balance."))
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}

struct BalanceComplicationView: View {
    @Environment(\.widgetFamily) var family
    let entry: BalanceTimelineEntry

    var body: some View {
        switch family {
        case .accessoryCircular: circularView
        case .accessoryRectangular: rectangularView
        case .accessoryInline: inlineView
        case .accessoryCorner: cornerView
        default: circularView
        }
    }

    private var circularView: some View {
        VStack(spacing: 1) {
            Image(systemName: "dollarsign.circle")
                .font(.caption)
                .accessibilityHidden(true)
            Text(compactBalance)
                .font(.caption2)
                .fontWeight(.semibold)
                .minimumScaleFactor(0.6)
        }
        .accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }

    private var rectangularView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "Balance"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(formattedBalance)
                    .font(.caption)
                    .fontWeight(.bold)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }

    private var inlineView: some View {
        Text("\(formattedBalance)")
            .accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }

    private var cornerView: some View {
        Text(compactBalance)
            .font(.caption)
            .fontWeight(.semibold)
            .widgetLabel {
                Text(String(localized: "Balance"))
            }
            .accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }

    private var formattedBalance: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = entry.currencyCode
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: entry.balance))
            ?? "\(entry.currencyCode) \(Int(entry.balance))"
    }

    private var compactBalance: String {
        let absVal = Swift.abs(entry.balance)
        let sign = entry.balance < 0 ? "-" : ""
        let symbol = currencySymbol
        if absVal >= 1_000_000 {
            return "\(sign)\(symbol)\(String(format: "%.1fM", absVal / 1_000_000))"
        } else if absVal >= 1_000 {
            return "\(sign)\(symbol)\(String(format: "%.1fK", absVal / 1_000))"
        } else {
            return "\(sign)\(symbol)\(Int(absVal))"
        }
    }

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = entry.currencyCode
        formatter.locale = .current
        return formatter.currencySymbol ?? "$"
    }
}

#Preview("Circular", as: .accessoryCircular) {
    BalanceComplication()
} timeline: {
    BalanceTimelineEntry(date: .now, balance: 24_850, currencyCode: "USD")
    BalanceTimelineEntry(date: .now, balance: 1_250_000, currencyCode: "USD")
}

#Preview("Rectangular", as: .accessoryRectangular) {
    BalanceComplication()
} timeline: {
    BalanceTimelineEntry(date: .now, balance: 24_850, currencyCode: "USD")
}

#Preview("Inline", as: .accessoryInline) {
    BalanceComplication()
} timeline: {
    BalanceTimelineEntry(date: .now, balance: 24_850, currencyCode: "USD")
}
