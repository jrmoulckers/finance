// SPDX-License-Identifier: BUSL-1.1
// BalanceWidget.swift — Refs #380
import SwiftUI
import WidgetKit
struct BalanceWidgetEntry: TimelineEntry { let date: Date; let balance: WidgetBalance }
struct BalanceWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> BalanceWidgetEntry { .init(date:.now,balance:.placeholder) }
    func getSnapshot(in context: Context, completion: @escaping (BalanceWidgetEntry) -> Void) { completion(.init(date:.now,balance:WidgetDataProvider.readBalance())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceWidgetEntry>) -> Void) { completion(Timeline(entries:[.init(date:.now,balance:WidgetDataProvider.readBalance())],policy:.after(Calendar.current.date(byAdding:.minute,value:30,to:.now)!))) }
}
struct BalanceWidget: Widget {
    let kind = "BalanceWidget"; var body: some WidgetConfiguration { StaticConfiguration(kind:kind,provider:BalanceWidgetProvider()){entry in BalanceWidgetView(entry:entry).containerBackground(.fill.tertiary,for:.widget)}.configurationDisplayName(Text("Balance",comment:"Widget")).description(Text("See your total balance at a glance.",comment:"Desc")).supportedFamilies([.systemSmall,.accessoryCircular,.accessoryRectangular,.accessoryInline]) }
}
struct BalanceWidgetView: View {
    @Environment(\.widgetFamily) var family; let entry: BalanceWidgetEntry
    var body: some View { switch family { case .systemSmall: smallView; case .accessoryCircular: circView; case .accessoryRectangular: rectView; case .accessoryInline: inlView; default: smallView } }
    private var smallView: some View { VStack(alignment:.leading,spacing:8){HStack(spacing:4){Image(systemName:"dollarsign.circle.fill").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true);Text("Balance",comment:"Hdr").font(.caption).foregroundStyle(.secondary)};Spacer();Text(fmtBal).font(.system(.title2,design:.rounded,weight:.bold)).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1);HStack(spacing:4){Image(systemName:entry.balance.isTrendingUp ? "arrow.up.right":"arrow.down.right").font(.caption2).fontWeight(.bold).foregroundStyle(tc).accessibilityHidden(true);Text(td).font(.caption2).foregroundStyle(tc)}}.frame(maxWidth:.infinity,alignment:.leading).accessibilityElement(children:.combine).accessibilityLabel(vo) }
    private var circView: some View { VStack(spacing:1){Image(systemName:"dollarsign.circle").font(.caption).accessibilityHidden(true);Text(cb).font(.caption2).fontWeight(.semibold).monospacedDigit().minimumScaleFactor(0.6)}.accessibilityLabel(vo) }
    private var rectView: some View { HStack{VStack(alignment:.leading,spacing:2){Text(entry.balance.accountName).font(.caption2).foregroundStyle(.secondary).lineLimit(1);Text(fmtBal).font(.caption).fontWeight(.bold).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)};Spacer()}.accessibilityElement(children:.combine).accessibilityLabel(vo) }
    private var inlView: some View { Text(fmtNc).monospacedDigit().accessibilityLabel(vo) }
    private var fmtBal: String { WidgetCurrencyFormatter.format(minorUnits:entry.balance.totalMinorUnits,currencyCode:entry.balance.currencyCode) }
    private var fmtNc: String { WidgetCurrencyFormatter.format(minorUnits:entry.balance.totalMinorUnits,currencyCode:entry.balance.currencyCode,showCents:false) }
    private var cb: String { WidgetCurrencyFormatter.formatCompact(minorUnits:entry.balance.totalMinorUnits,currencyCode:entry.balance.currencyCode) }
    private var tc: Color { entry.balance.isTrendingUp ? FinanceWidgetColors.amountPositive:FinanceWidgetColors.amountNegative }
    private var td: String { let d=entry.balance.totalMinorUnits-entry.balance.previousMonthMinorUnits; let f=WidgetCurrencyFormatter.format(minorUnits:abs(d),currencyCode:entry.balance.currencyCode,showCents:false); return entry.balance.isTrendingUp ? String(localized:"+\(f) vs last month"):String(localized:"-\(f) vs last month") }
    private var vo: String { let b=WidgetCurrencyFormatter.formatForVoiceOver(minorUnits:entry.balance.totalMinorUnits,currencyCode:entry.balance.currencyCode); return String(localized:"Balance: \(b)") }
}