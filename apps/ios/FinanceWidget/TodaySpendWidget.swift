// SPDX-License-Identifier: BUSL-1.1
// TodaySpendWidget.swift — Refs #2159
//
// Glance-first "Today Spend / Fun Money" widget. Reads a precomputed
// `TodaySpendSummary` from the app-group cache (never the network), applies a
// budget-aware refresh cadence, and surfaces staleness so the number stays
// trustworthy. All money respects the user's widget privacy masking mode.

import FinanceShared
import SwiftUI
import WidgetKit

struct TodaySpendEntry: TimelineEntry {
    let date: Date
    let summary: TodaySpendSummary
    let maskingMode: WidgetMaskingMode
    let isStale: Bool
}

struct TodaySpendProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodaySpendEntry {
        TodaySpendEntry(
            date: .now,
            summary: .placeholder,
            maskingMode: .bucketed,
            isStale: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TodaySpendEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
        } else {
            completion(makeEntry())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodaySpendEntry>) -> Void) {
        let now = Date.now
        let entry = makeEntry(now: now)
        // Budget-aware cadence: refresh sooner when fun money is running low.
        let nextRefresh = TodaySpendRefreshPolicy.nextRefreshDate(after: now, summary: entry.summary)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func makeEntry(now: Date = .now) -> TodaySpendEntry {
        let summary = WidgetDataProvider.readTodaySpend()
        return TodaySpendEntry(
            date: now,
            summary: summary,
            maskingMode: WidgetDataProvider.maskingMode(for: TodaySpendWidget.kind),
            isStale: TodaySpendFreshness.isStale(updatedAt: summary.updatedAt, now: now)
        )
    }
}

struct TodaySpendWidget: Widget {
    static let kind = "TodaySpendWidget"
    let kind = TodaySpendWidget.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodaySpendProvider()) { entry in
            TodaySpendWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Today Spend", comment: "Widget"))
        .description(Text("Today's spending and the fun money you have left.", comment: "Widget description"))
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

struct TodaySpendWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodaySpendEntry

    var body: some View {
        Link(destination: FinanceWidgetDeepLinks.quickEntryURL(action: nil)) {
            switch family {
            case .systemMedium:
                mediumView
            default:
                smallView
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(accessibilityValue)
    }

    // MARK: - Small

    private var smallView: some View {
        VStack(alignment: .leading, spacing: FinanceWidgetSpacing.xs) {
            header(title: String(localized: "Today"), icon: "calendar")
            Text(todaySpentText)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .monospacedDigit()
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Spacer(minLength: FinanceWidgetSpacing.xxs)
            funMoneyChip
            staleFootnote
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
    }

    // MARK: - Medium

    private var mediumView: some View {
        HStack(alignment: .top, spacing: FinanceWidgetSpacing.md) {
            VStack(alignment: .leading, spacing: FinanceWidgetSpacing.xs) {
                header(title: String(localized: "Today"), icon: "calendar")
                Text(todaySpentText)
                    .font(.system(.title, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Spacer(minLength: 0)
                staleFootnote
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: FinanceWidgetSpacing.xs) {
                header(title: String(localized: "Fun money"), icon: "sparkles")
                Text(funMoneyText)
                    .font(.system(.title3, design: .rounded, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .foregroundStyle(funMoneyColor)
                if entry.summary.hasDiscretionaryBudget {
                    ProgressView(value: entry.summary.funMoneyProgress)
                        .tint(funMoneyColor)
                    Text(funMoneyCaption)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    Text(String(localized: "Set a fun budget in Finance"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding()
    }

    // MARK: - Components

    private func header(title: String, icon: String) -> some View {
        HStack(spacing: FinanceWidgetSpacing.xxs) {
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

    private var funMoneyChip: some View {
        HStack(spacing: FinanceWidgetSpacing.xxs) {
            Image(systemName: entry.summary.isOverFunBudget ? "exclamationmark.triangle.fill" : "sparkles")
                .font(.caption2)
                .accessibilityHidden(true)
            Text(funMoneyText)
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(funMoneyColor)
        .padding(.horizontal, FinanceWidgetSpacing.xs)
        .padding(.vertical, FinanceWidgetSpacing.xxs)
        .background(
            Capsule().fill(funMoneyColor.opacity(0.14))
        )
    }

    @ViewBuilder
    private var staleFootnote: some View {
        if entry.isStale {
            Text(String(localized: "Open Finance to refresh"))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Formatting

    private var todaySpentText: String {
        WidgetCurrencyFormatter.format(
            minorUnits: entry.summary.todaySpentMinorUnits,
            currencyCode: entry.summary.currencyCode,
            mode: entry.maskingMode
        )
    }

    private var funMoneyText: String {
        guard entry.summary.hasDiscretionaryBudget else {
            return String(localized: "—")
        }
        let amount = WidgetCurrencyFormatter.format(
            minorUnits: abs(entry.summary.funMoneyRemainingMinorUnits),
            currencyCode: entry.summary.currencyCode,
            mode: entry.maskingMode,
            showCents: false
        )
        return entry.summary.isOverFunBudget
            ? String(localized: "\(amount) over")
            : String(localized: "\(amount) left")
    }

    private var funMoneyCaption: String {
        String(localized: "\(Int(entry.summary.funMoneyProgress * 100))% of fun budget used")
    }

    private var funMoneyColor: Color {
        if entry.summary.isOverFunBudget { return FinanceWidgetColors.statusNegative }
        if entry.summary.funMoneyProgress >= TodaySpendRefreshPolicy.lowBudgetThreshold {
            return FinanceWidgetColors.statusWarning
        }
        return FinanceWidgetColors.statusPositive
    }

    // MARK: - Accessibility

    private var accessibilityLabel: String {
        String(localized: "Today's spending and fun money")
    }

    private var accessibilityValue: String {
        let spent = WidgetCurrencyFormatter.formatForVoiceOver(
            minorUnits: entry.summary.todaySpentMinorUnits,
            currencyCode: entry.summary.currencyCode,
            mode: entry.maskingMode
        )
        let spentPart = String(localized: "Spent \(spent) today")

        guard entry.summary.hasDiscretionaryBudget else {
            return entry.isStale
                ? String(localized: "\(spentPart). Data may be out of date, open Finance to refresh.")
                : spentPart
        }

        let fun = WidgetCurrencyFormatter.formatForVoiceOver(
            minorUnits: abs(entry.summary.funMoneyRemainingMinorUnits),
            currencyCode: entry.summary.currencyCode,
            mode: entry.maskingMode
        )
        let funPart = entry.summary.isOverFunBudget
            ? String(localized: "\(fun) over your fun budget")
            : String(localized: "\(fun) of fun money left")

        let combined = String(localized: "\(spentPart). \(funPart).")
        return entry.isStale
            ? String(localized: "\(combined) Data may be out of date, open Finance to refresh.")
            : combined
    }
}
