// SPDX-License-Identifier: BUSL-1.1
// BudgetProgressWidget.swift — Refs #380
import SwiftUI
import WidgetKit
struct BudgetWidgetEntry: TimelineEntry { let date: Date; let budgets: [WidgetBudget] }
struct BudgetWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> BudgetWidgetEntry { .init(date:.now,budgets:WidgetBudget.placeholders) }
    func getSnapshot(in context: Context, completion: @escaping (BudgetWidgetEntry) -> Void) { completion(.init(date:.now,budgets:WidgetDataProvider.readBudgets(limit:3))) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgetWidgetEntry>) -> Void) { completion(Timeline(entries:[.init(date:.now,budgets:WidgetDataProvider.readBudgets(limit:3))],policy:.after(Calendar.current.date(byAdding:.minute,value:30,to:.now)!))) }
}
struct BudgetProgressWidget: Widget { let kind = "BudgetProgressWidget"; var body: some WidgetConfiguration { StaticConfiguration(kind:kind,provider:BudgetWidgetProvider()){entry in BudgetProgressWidgetView(entry:entry).containerBackground(.fill.tertiary,for:.widget)}.configurationDisplayName(Text("Budget Progress",comment:"Widget")).description(Text("Track spending against budget limits.",comment:"Desc")).supportedFamilies([.systemMedium,.accessoryCircular]) } }
struct BudgetProgressWidgetView: View {
    @Environment(\.widgetFamily) var family; let entry: BudgetWidgetEntry
    var body: some View { switch family { case .systemMedium: medView; case .accessoryCircular: circView; default: medView } }
    private var medView: some View { VStack(alignment:.leading,spacing:8){HStack(spacing:4){Image(systemName:"chart.pie.fill").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true);Text("Budget Progress",comment:"Hdr").font(.caption).foregroundStyle(.secondary)};if entry.budgets.isEmpty{Text("No budgets set up yet.",comment:"Empty").font(.caption).foregroundStyle(.secondary).frame(maxWidth:.infinity,maxHeight:.infinity)}else{HStack(spacing:16){ForEach(Array(entry.budgets.prefix(3))){b in gv(b)}}.frame(maxWidth:.infinity)}}.accessibilityElement(children:.contain) }
    private var circView: some View { let b=entry.budgets.first ?? WidgetBudget.placeholders[0]; return Gauge(value:min(b.progress,1.0),label:{Image(systemName:b.icon).accessibilityHidden(true)}).gaugeStyle(.accessoryCircular).accessibilityLabel(vl(b)) }
    private func gv(_ b: WidgetBudget) -> some View { VStack(spacing:4){Gauge(value:min(b.progress,1.0),label:{EmptyView()}){Image(systemName:b.icon).font(.caption2).foregroundStyle(gc(b)).accessibilityHidden(true)}.gaugeStyle(.accessoryCircular).tint(gc(b));Text(b.name).font(.caption2).lineLimit(1).minimumScaleFactor(0.7);Text("\(Int(min(b.progress*100,999)))%").font(.system(.caption2,design:.rounded)).fontWeight(.semibold).monospacedDigit().foregroundStyle(gc(b))}.accessibilityElement(children:.combine).accessibilityLabel(vl(b)) }
    private func gc(_ b: WidgetBudget) -> Color { b.progress>=1.0 ? FinanceWidgetColors.statusNegative : b.progress>=0.75 ? FinanceWidgetColors.statusWarning : FinanceWidgetColors.statusPositive }
    private func vl(_ b: WidgetBudget) -> String { String(localized:"\(b.name): \(Int(b.progress*100)) percent, \(b.isOverBudget ? "over":"within") budget") }
}