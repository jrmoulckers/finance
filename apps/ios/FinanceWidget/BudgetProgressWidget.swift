// SPDX-License-Identifier: BUSL-1.1
// BudgetProgressWidget.swift — Refs #380, #1608

import FinanceShared
import SwiftUI
import WidgetKit

struct BudgetWidgetEntry: TimelineEntry {
    let date: Date
    let budgets: [WidgetBudget]
    let rollup: WidgetBudgetRollup
    let maskingMode: WidgetMaskingMode
}

struct BudgetWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> BudgetWidgetEntry {
        let budgets = WidgetBudget.placeholders
        let rollup = WidgetBudgetRollup(
            budgets: budgets,
            totalSpentMinorUnits: budgets.reduce(0) { $0 + $1.spentMinorUnits },
            totalLimitMinorUnits: budgets.reduce(0) { $0 + $1.limitMinorUnits },
            currencyCode: "USD"
        )
        return .init(date: .now, budgets: budgets, rollup: rollup, maskingMode: .bucketed)
    }

    func getSnapshot(in context: Context, completion: @escaping (BudgetWidgetEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
        } else {
            completion(makeEntry())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgetWidgetEntry>) -> Void) {
        completion(Timeline(entries: [makeEntry()], policy: .atEnd))
    }

    private func makeEntry() -> BudgetWidgetEntry {
        let rollup = WidgetDataProvider.budgetRollup()
        return BudgetWidgetEntry(
            date: .now,
            budgets: rollup.budgets,
            rollup: rollup,
            maskingMode: WidgetDataProvider.maskingMode(for: BudgetProgressWidget.kind)
        )
    }
}

struct BudgetProgressWidget: Widget {
    static let kind = "BudgetProgressWidget"
    let kind = BudgetProgressWidget.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BudgetWidgetProvider()) { entry in
            BudgetProgressWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Budget Widgets", comment: "Widget"))
        .description(Text("Track category budgets from your local cache.", comment: "Widget description"))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

struct BudgetProgressWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BudgetWidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            smallView
        case .systemLarge:
            largeView
        default:
            mediumView
        }
    }

    private var smallView: some View {
        Group {
            if let budget = entry.budgets.first {
                Link(destination: FinanceWidgetDeepLinks.budgetCategoryURL(categoryId: budget.id)) {
                    VStack(alignment: .leading, spacing: 8) {
                        header(title: String(localized: "Budget"), icon: budget.icon)
                        Spacer(minLength: 4)
                        Gauge(value: min(budget.progress, 1.0)) {
                            Text(budget.name)
                        } currentValueLabel: {
                            Text(percentText(budget.progress))
                                .font(.caption.weight(.semibold))
                        }
                        .gaugeStyle(.accessoryCircular)
                        .tint(color(for: budget))
                        Text(budget.name)
                            .font(.headline)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(amountLine(for: budget))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding()
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(accessibilityLabel(for: budget))
                .accessibilityValue(accessibilityValue(for: budget))
            } else {
                emptyView
            }
        }
    }

    private var mediumView: some View {
        VStack(alignment: .leading, spacing: 8) {
            header(title: String(localized: "Top Budgets"), icon: "chart.pie.fill")
            if entry.budgets.isEmpty {
                emptyView
            } else {
                ForEach(Array(entry.budgets.prefix(3))) { budget in
                    Link(destination: FinanceWidgetDeepLinks.budgetCategoryURL(categoryId: budget.id)) {
                        budgetRow(budget, showAmount: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(accessibilityLabel(for: budget))
                    .accessibilityValue(accessibilityValue(for: budget))
                }
            }
        }
        .padding()
        .accessibilityElement(children: .contain)
    }

    private var largeView: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                header(title: String(localized: "Monthly Budget"), icon: "chart.pie.fill")
                Spacer()
                Text(rollupAmount)
                    .font(.headline.monospacedDigit())
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .accessibilityLabel(String(localized: "This month spend"))
                    .accessibilityValue(rollupVoiceOverAmount)
            }

            Gauge(value: min(entry.rollup.progress, 1.0)) {
                Text(String(localized: "All categories"))
            } currentValueLabel: {
                Text(percentText(entry.rollup.progress))
            }
            .tint(rollupColor)
            .accessibilityLabel(String(localized: "All categories budget progress"))
            .accessibilityValue(String(localized: "\(Int(entry.rollup.progress * 100)) percent used"))

            if entry.budgets.isEmpty {
                emptyView
            } else {
                ForEach(entry.budgets) { budget in
                    Link(destination: FinanceWidgetDeepLinks.budgetCategoryURL(categoryId: budget.id)) {
                        budgetRow(budget, showAmount: false)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(accessibilityLabel(for: budget))
                    .accessibilityValue(accessibilityValue(for: budget))
                }
            }
        }
        .padding()
        .accessibilityElement(children: .contain)
    }

    private func header(title: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .accessibilityAddTraits(.isHeader)
    }

    private var emptyView: some View {
        VStack(spacing: 6) {
            Image(systemName: "chart.pie")
                .font(.title3)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "No cached budgets"))
                .font(.caption.weight(.medium))
            Text(String(localized: "Open Finance to sync budgets."))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "No cached budgets"))
        .accessibilityValue(String(localized: "Open Finance to sync budgets."))
    }

    private func budgetRow(_ budget: WidgetBudget, showAmount: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: budget.icon)
                .font(.caption)
                .foregroundStyle(color(for: budget))
                .frame(width: 22, height: 22)
                .background(Circle().fill(color(for: budget).opacity(0.14)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(budget.name)
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(percentText(budget.progress))
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(color(for: budget))
                }
                ProgressView(value: min(budget.progress, 1.0))
                    .tint(color(for: budget))
                if showAmount {
                    Text(amountLine(for: budget))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
    }

    private var rollupAmount: String {
        WidgetCurrencyFormatter.format(
            minorUnits: entry.rollup.totalSpentMinorUnits,
            currencyCode: entry.rollup.currencyCode,
            mode: entry.maskingMode
        )
    }

    private var rollupVoiceOverAmount: String {
        WidgetCurrencyFormatter.formatForVoiceOver(
            minorUnits: entry.rollup.totalSpentMinorUnits,
            currencyCode: entry.rollup.currencyCode,
            mode: entry.maskingMode
        )
    }

    private var rollupColor: Color {
        entry.rollup.progress >= 1.0 ? FinanceWidgetColors.statusNegative : .accentColor
    }

    private func amountLine(for budget: WidgetBudget) -> String {
        let spent = WidgetCurrencyFormatter.format(
            minorUnits: budget.spentMinorUnits,
            currencyCode: budget.currencyCode,
            mode: entry.maskingMode,
            showCents: false
        )
        let limit = WidgetCurrencyFormatter.format(
            minorUnits: budget.limitMinorUnits,
            currencyCode: budget.currencyCode,
            mode: entry.maskingMode,
            showCents: false
        )
        return String(localized: "\(spent) of \(limit)")
    }

    private func percentText(_ progress: Double) -> String {
        String(localized: "\(Int(progress * 100))%")
    }

    private func color(for budget: WidgetBudget) -> Color {
        if budget.progress >= 1.0 { return FinanceWidgetColors.statusNegative }
        if budget.progress >= 0.75 { return FinanceWidgetColors.statusWarning }
        return FinanceWidgetColors.statusPositive
    }

    private func accessibilityLabel(for budget: WidgetBudget) -> String {
        String(localized: "\(budget.name) budget")
    }

    private func accessibilityValue(for budget: WidgetBudget) -> String {
        let spent = WidgetCurrencyFormatter.formatForVoiceOver(
            minorUnits: budget.spentMinorUnits,
            currencyCode: budget.currencyCode,
            mode: entry.maskingMode
        )
        let limit = WidgetCurrencyFormatter.formatForVoiceOver(
            minorUnits: budget.limitMinorUnits,
            currencyCode: budget.currencyCode,
            mode: entry.maskingMode
        )
        return String(localized: "\(Int(budget.progress * 100)) percent used, \(spent) of \(limit)")
    }
}
