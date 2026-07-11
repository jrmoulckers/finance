// SPDX-License-Identifier: BUSL-1.1

// ChartDataTable.swift
// Finance
//
// A reusable, VoiceOver-friendly text alternative for charts: a spoken summary
// plus a browsable data table so non-visual users get the same information a
// chart conveys.
// Refs #2113

import SwiftUI

// MARK: - Data Row

/// A single labeled row in a chart's text-alternative data table.
struct ChartDataRow: Identifiable, Sendable {
    let id = UUID()
    let label: String
    let value: String

    init(label: String, value: String) {
        self.label = label
        self.value = value
    }
}

// MARK: - View

/// A reusable text alternative for a chart.
///
/// Renders a spoken `summary` (date range, totals, extremes, forecast ranges,
/// …) followed by a collapsible data table of `rows`. Sighted users can leave
/// it collapsed; VoiceOver users get the full data in the **same swipe order**
/// as the chart. This mirrors the existing report data-table pattern so every
/// analytics and investment chart can offer a non-visual equivalent. (#2113)
struct ChartDataTable: View {
    let summary: String
    let rows: [ChartDataRow]
    var tableLabel: String

    @State private var isExpanded = false

    init(
        summary: String,
        rows: [ChartDataRow],
        tableLabel: String = String(localized: "Chart data table")
    ) {
        self.summary = summary
        self.rows = rows
        self.tableLabel = tableLabel
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(summary)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(summary)

            if !rows.isEmpty {
                DisclosureGroup(isExpanded: $isExpanded) {
                    VStack(spacing: 0) {
                        ForEach(rows) { row in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(row.label)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 8)
                                Text(row.value)
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .multilineTextAlignment(.trailing)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.vertical, 6)
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("\(row.label), \(row.value)")

                            if row.id != rows.last?.id {
                                Divider()
                            }
                        }
                    }
                    .padding(.top, 4)
                } label: {
                    Text(String(localized: "View data table"))
                        .font(.footnote.weight(.medium))
                }
                .accessibilityLabel(tableLabel)
                .accessibilityHint(String(localized: "Shows the underlying chart values as text"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Preview

#Preview("Chart Data Table") {
    ChartDataTable(
        summary: "Spending from Jan to Jun totalled $12,340. Highest: March at $2,510. Lowest: January at $1,420.",
        rows: [
            ChartDataRow(label: "January", value: "$1,420"),
            ChartDataRow(label: "February", value: "$1,980"),
            ChartDataRow(label: "March", value: "$2,510"),
            ChartDataRow(label: "April", value: "$2,010"),
            ChartDataRow(label: "May", value: "$2,000"),
            ChartDataRow(label: "June", value: "$2,420"),
        ]
    )
    .padding()
}
