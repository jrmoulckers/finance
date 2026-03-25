// SPDX-License-Identifier: BUSL-1.1
// ComplicationProvider.swift - WidgetKit balance complication. Refs #30, #649
import SwiftUI
import WidgetKit
struct BalanceTimelineEntry: TimelineEntry { let date: Date; let balanceMinorUnits: Int64; let currencyCode: String }
struct BalanceComplicationProvider: TimelineProvider {
    func placeholder(in c: Context) -> BalanceTimelineEntry { BalanceTimelineEntry(date: .now, balanceMinorUnits: 0, currencyCode: "USD") }
    func getSnapshot(in c: Context, completion: @escaping (BalanceTimelineEntry) -> Void) { completion(currentEntry()) }
    func getTimeline(in c: Context, completion: @escaping (Timeline<BalanceTimelineEntry>) -> Void) {
        completion(Timeline(entries: [currentEntry()], policy: .after(Calendar.current.date(byAdding: .minute, value: 30, to: .now)!)))
    }
    private func currentEntry() -> BalanceTimelineEntry {
        let d = UserDefaults(suiteName: WatchConstants.appGroupIdentifier)
        return BalanceTimelineEntry(date: .now, balanceMinorUnits: Int64(d?.integer(forKey: ComplicationDataKey.balanceMinorUnits) ?? 0), currencyCode: d?.string(forKey: ComplicationDataKey.currencyCode) ?? "USD")
    }
}
struct BalanceComplication: Widget {
    let kind = "BalanceComplication"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceComplicationProvider()) { entry in
            BalanceComplicationView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }.configurationDisplayName(Text("Balance")).description(Text("Shows your current total balance."))
         .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}
struct BalanceComplicationView: View {
    @Environment(\.widgetFamily) var family; let entry: BalanceTimelineEntry
    var body: some View {
        switch family {
        case .accessoryCircular: circularView; case .accessoryRectangular: rectangularView
        case .accessoryInline: inlineView; case .accessoryCorner: cornerView; default: circularView
        }
    }
    private var circularView: some View {
        VStack(spacing: 1) { Image(systemName: "dollarsign.circle").font(.caption).accessibilityHidden(true)
            Text(compactBalance).font(.caption2).fontWeight(.semibold).minimumScaleFactor(0.6)
        }.accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }
    private var rectangularView: some View {
        HStack { VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "Balance")).font(.caption2).foregroundStyle(.secondary)
            Text(formattedBalance).font(.caption).fontWeight(.bold).minimumScaleFactor(0.6).lineLimit(1)
        }; Spacer() }.accessibilityElement(children: .combine).accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }
    private var inlineView: some View { Text(formattedBalance).accessibilityLabel(String(localized: "Balance: \(formattedBalance)")) }
    private var cornerView: some View {
        Text(compactBalance).font(.caption).fontWeight(.semibold)
            .widgetLabel { Text(String(localized: "Balance")) }.accessibilityLabel(String(localized: "Balance: \(formattedBalance)"))
    }
    private var formattedBalance: String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = entry.currencyCode; f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: Double(entry.balanceMinorUnits) / 100.0)) ?? "\(entry.currencyCode) \(entry.balanceMinorUnits / 100)"
    }
    private var compactBalance: String {
        let v = Double(entry.balanceMinorUnits) / 100.0; let a = Swift.abs(v); let s = v < 0 ? "-" : ""; let sym = currencySymbol
        if a >= 1_000_000 { return "\(s)\(sym)\(String(format: "%.1fM", a/1_000_000))" }
        else if a >= 1_000 { return "\(s)\(sym)\(String(format: "%.1fK", a/1_000))" }
        else { return "\(s)\(sym)\(Int(a))" }
    }
    private var currencySymbol: String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = entry.currencyCode; f.locale = .current; return f.currencySymbol ?? "$"
    }
}

