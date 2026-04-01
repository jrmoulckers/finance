// SPDX-License-Identifier: BUSL-1.1
// QuickEntryWidget.swift — Refs #380
import AppIntents
import SwiftUI
import WidgetKit
struct AddQuickExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Quick Expense"; static var description = IntentDescription("Record a quick expense.")
    @Parameter(title:"Amount") var amountMinorUnits: Int; @Parameter(title:"Label") var displayLabel: String
    init(){amountMinorUnits=500;displayLabel="$5"}; init(amountMinorUnits:Int,displayLabel:String){self.amountMinorUnits=amountMinorUnits;self.displayLabel=displayLabel}
    func perform() async throws -> some IntentResult { let d=UserDefaults(suiteName:WidgetDataKeys.suiteName); let e=QuickExpenseEntry(id:UUID().uuidString,amountMinorUnits:Int64(amountMinorUnits),currencyCode:"USD",categoryId:"other",createdAt:Date()); var p=[QuickExpenseEntry](); if let data=d?.data(forKey:QuickExpenseEntry.storageKey){let dec=JSONDecoder();dec.dateDecodingStrategy = .iso8601;p=(try? dec.decode([QuickExpenseEntry].self,from:data)) ?? []}; p.append(e); let enc=JSONEncoder();enc.dateEncodingStrategy = .iso8601; if let data=try? enc.encode(p){d?.set(data,forKey:QuickExpenseEntry.storageKey)}; return .result() }
}
struct QuickExpenseEntry: Codable, Sendable { let id: String; let amountMinorUnits: Int64; let currencyCode: String; let categoryId: String; let createdAt: Date; static let storageKey = "widget.quickExpenses" }
struct QuickEntryWidgetEntry: TimelineEntry { let date: Date }
struct QuickEntryWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickEntryWidgetEntry { .init(date:.now) }; func getSnapshot(in context: Context, completion: @escaping (QuickEntryWidgetEntry) -> Void) { completion(.init(date:.now)) }; func getTimeline(in context: Context, completion: @escaping (Timeline<QuickEntryWidgetEntry>) -> Void) { completion(Timeline(entries:[.init(date:.now)],policy:.after(Calendar.current.date(byAdding:.hour,value:1,to:.now)!))) }
}
struct QuickEntryWidget: Widget { let kind = "QuickEntryWidget"; var body: some WidgetConfiguration { StaticConfiguration(kind:kind,provider:QuickEntryWidgetProvider()){entry in QuickEntryWidgetView(entry:entry).containerBackground(.fill.tertiary,for:.widget)}.configurationDisplayName(Text("Quick Expense",comment:"Widget")).description(Text("Quickly record an expense.",comment:"Desc")).supportedFamilies([.systemSmall]) } }
struct QuickEntryWidgetView: View {
    let entry: QuickEntryWidgetEntry; private let presets:[(amount:Int,label:String)]=[(500,"$5"),(1_000,"$10"),(2_500,"$25")]
    var body: some View { VStack(spacing:8){HStack(spacing:4){Image(systemName:"plus.circle.fill").font(.caption).foregroundStyle(FinanceWidgetColors.interactive).accessibilityHidden(true);Text("Add Expense",comment:"Hdr").font(.caption).fontWeight(.medium).foregroundStyle(.secondary)};Spacer();VStack(spacing:4){ForEach(presets,id:\.amount){p in Button(intent:AddQuickExpenseIntent(amountMinorUnits:p.amount,displayLabel:p.label)){Text(p.label).font(.system(.callout,design:.rounded,weight:.semibold)).monospacedDigit().frame(maxWidth:.infinity).padding(.vertical,4)}.buttonStyle(.borderedProminent).tint(FinanceWidgetColors.interactive).accessibilityLabel(String(localized:"Add \(p.label) expense"))}}}.accessibilityElement(children:.contain) }
}