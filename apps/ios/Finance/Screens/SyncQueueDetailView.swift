// SPDX-License-Identifier: BUSL-1.1

// SyncQueueDetailView.swift
// Finance
//
// Per-change sync status list so offline users can trust exactly what is saved
// locally, queued, uploading, failed, or conflicted (#2204).

import SwiftUI

struct SyncQueueDetailView: View {
    let items: [SyncQueueItem]
    let onClearSynced: () -> Void

    var body: some View {
        List {
            if items.contains(where: { $0.status == .synced }) {
                Section {
                    Button(role: .destructive) {
                        onClearSynced()
                    } label: {
                        Label(String(localized: "Clear Synced"), systemImage: "checkmark.circle")
                    }
                    .accessibilityHint(String(localized: "Removes synced items from this list"))
                }
            }

            Section {
                ForEach(items) { item in
                    row(item)
                }
            } footer: {
                Text(String(localized: "Changes are stored on this device first, then uploaded. Nothing is lost while you're offline."))
            }
        }
        .navigationTitle(String(localized: "Sync Queue"))
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if items.isEmpty {
                ContentUnavailableView(
                    String(localized: "Nothing Queued"),
                    systemImage: "checkmark.icloud",
                    description: Text(String(localized: "All your changes are synced."))
                )
            }
        }
    }

    private func row(_ item: SyncQueueItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: item.status.systemImage)
                .foregroundStyle(item.status.tintColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.summary)
                    .font(.body)
                Text(item.status.displayName)
                    .font(.caption)
                    .foregroundStyle(item.status.tintColor)
                if let error = item.errorMessage {
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if item.retryCount > 0 {
                Text(String(localized: "Retry \(item.retryCount)"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.summary), \(item.status.displayName)")
    }
}

#Preview {
    NavigationStack {
        SyncQueueDetailView(
            items: [
                SyncQueueItem(entityType: "transaction", entityId: "t1", summary: "Coffee — ฿120", status: .queued),
                SyncQueueItem(entityType: "transaction", entityId: "t2", summary: "Hostel — ฿850", status: .failed, errorMessage: "Timed out"),
                SyncQueueItem(entityType: "transaction", entityId: "t3", summary: "SIM card — ฿300", status: .synced),
            ],
            onClearSynced: {}
        )
    }
}
