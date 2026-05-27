// SPDX-License-Identifier: BUSL-1.1
// QuickEntryWidget.swift — Refs #380, #1605

import AppIntents
import FinanceShared
import SwiftUI
import WidgetKit

enum QuickEntryShortcut: String, AppEnum, CaseIterable {
    case none
    case lunch
    case coffee
    case groceries
    case gas

    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: LocalizedStringResource("Quick Entry Shortcut")
    )

    static let caseDisplayRepresentations: [QuickEntryShortcut: DisplayRepresentation] = [
        .none: DisplayRepresentation(title: LocalizedStringResource("Just Add")),
        .lunch: DisplayRepresentation(title: LocalizedStringResource("Log lunch"), image: .init(systemName: "fork.knife")),
        .coffee: DisplayRepresentation(title: LocalizedStringResource("Log coffee"), image: .init(systemName: "cup.and.saucer")),
        .groceries: DisplayRepresentation(title: LocalizedStringResource("Log groceries"), image: .init(systemName: "cart")),
        .gas: DisplayRepresentation(title: LocalizedStringResource("Log gas"), image: .init(systemName: "fuelpump")),
    ]

    var title: String {
        switch self {
        case .none: String(localized: "Add")
        case .lunch: String(localized: "Log lunch")
        case .coffee: String(localized: "Log coffee")
        case .groceries: String(localized: "Log groceries")
        case .gas: String(localized: "Log gas")
        }
    }

    var systemImage: String {
        switch self {
        case .none: "plus"
        case .lunch: "fork.knife"
        case .coffee: "cup.and.saucer"
        case .groceries: "cart"
        case .gas: "fuelpump"
        }
    }

    var deepLinkAction: String? {
        self == .none ? nil : rawValue
    }
}

struct QuickEntryWidgetIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Quick Entry"
    static let description = IntentDescription("Choose the single named quick-entry shortcut shown on the Lock Screen.")

    @Parameter(title: "Shortcut")
    var shortcut: QuickEntryShortcut

    init() {
        shortcut = .none
    }

    init(shortcut: QuickEntryShortcut) {
        self.shortcut = shortcut
    }
}

struct QuickEntryWidgetEntry: TimelineEntry {
    let date: Date
    let shortcut: QuickEntryShortcut
}

struct QuickEntryWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> QuickEntryWidgetEntry {
        .init(date: .now, shortcut: .none)
    }

    func snapshot(for configuration: QuickEntryWidgetIntent, in context: Context) async -> QuickEntryWidgetEntry {
        .init(date: .now, shortcut: configuration.shortcut)
    }

    func timeline(for configuration: QuickEntryWidgetIntent, in context: Context) async -> Timeline<QuickEntryWidgetEntry> {
        Timeline(entries: [.init(date: .now, shortcut: configuration.shortcut)], policy: .atEnd)
    }
}

struct QuickEntryWidget: Widget {
    static let kind = "QuickEntryWidget"
    let kind = QuickEntryWidget.kind

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: QuickEntryWidgetIntent.self,
            provider: QuickEntryWidgetProvider()
        ) { entry in
            QuickEntryWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName(Text("Lock Screen Quick Entry", comment: "Widget"))
        .description(Text("Open a biometric-gated transaction sheet without showing money on the Lock Screen.", comment: "Widget description"))
        .supportedFamilies([.accessoryCircular, .accessoryRectangular])
    }
}

struct QuickEntryWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: QuickEntryWidgetEntry

    var body: some View {
        Link(destination: FinanceWidgetDeepLinks.quickEntryURL(action: entry.shortcut.deepLinkAction)) {
            switch family {
            case .accessoryCircular:
                circularView
            default:
                rectangularView
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Open Finance quick entry"))
        .accessibilityValue(entry.shortcut.title)
        .accessibilityHint(String(localized: "Authenticates before showing the transaction amount field"))
    }

    private var circularView: some View {
        VStack(spacing: 2) {
            Image(systemName: "plus.circle.fill")
                .font(.title3)
                .accessibilityHidden(true)
            if entry.shortcut != .none {
                Image(systemName: entry.shortcut.systemImage)
                    .font(.caption2)
                    .accessibilityHidden(true)
            }
        }
        .widgetLabel {
            Text(entry.shortcut.title)
        }
    }

    private var rectangularView: some View {
        HStack(spacing: 6) {
            Image(systemName: "plus.circle.fill")
                .foregroundStyle(FinanceWidgetColors.interactive)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(String(localized: "Quick Entry"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(entry.shortcut.title)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}
