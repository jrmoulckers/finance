// SPDX-License-Identifier: BUSL-1.1

// SyncQueue.swift
// Finance
//
// Model types for trustworthy offline queued-sync feedback (#2204). A traveller
// logging expenses on a flight needs to see exactly which entries are saved
// locally, queued, uploading, failed, or conflicted — never wonder whether an
// expense was actually captured.

import SwiftUI

/// The lifecycle state of a locally-made change awaiting server sync.
enum SyncItemStatus: String, Codable, Sendable, CaseIterable {
    /// Persisted on-device, not yet added to the upload queue.
    case savedLocally
    /// In the queue, waiting for connectivity or its turn to upload.
    case queued
    /// Actively uploading right now.
    case uploading
    /// Upload failed and will be retried.
    case failed
    /// Server has a competing change that must be resolved.
    case conflicted
    /// Successfully synced to the server.
    case synced

    var displayName: String {
        switch self {
        case .savedLocally: String(localized: "Saved locally")
        case .queued: String(localized: "Queued")
        case .uploading: String(localized: "Uploading")
        case .failed: String(localized: "Failed")
        case .conflicted: String(localized: "Conflict")
        case .synced: String(localized: "Synced")
        }
    }

    /// SF Symbol paired with text (never colour-only) for accessibility.
    var systemImage: String {
        switch self {
        case .savedLocally: "internaldrive"
        case .queued: "clock.arrow.circlepath"
        case .uploading: "arrow.up.circle"
        case .failed: "exclamationmark.arrow.triangle.2.circlepath"
        case .conflicted: "exclamationmark.triangle"
        case .synced: "checkmark.icloud"
        }
    }

    var tintColor: Color {
        switch self {
        case .savedLocally, .queued: .secondary
        case .uploading: .blue
        case .failed: .red
        case .conflicted: .orange
        case .synced: .green
        }
    }

    /// Whether this state still needs to reach the server.
    var isPending: Bool {
        switch self {
        case .savedLocally, .queued, .uploading: true
        case .failed, .conflicted, .synced: false
        }
    }

    /// Whether this state requires the user's attention.
    var needsAttention: Bool { self == .failed || self == .conflicted }
}

/// A single queued change with enough context for the user to trust it.
struct SyncQueueItem: Identifiable, Codable, Sendable, Equatable {
    let id: String
    let entityType: String
    let entityId: String
    let summary: String
    var status: SyncItemStatus
    let createdAt: Date
    var updatedAt: Date
    var retryCount: Int
    var errorMessage: String?

    init(
        id: String = UUID().uuidString,
        entityType: String,
        entityId: String,
        summary: String,
        status: SyncItemStatus = .savedLocally,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        retryCount: Int = 0,
        errorMessage: String? = nil
    ) {
        self.id = id
        self.entityType = entityType
        self.entityId = entityId
        self.summary = summary
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.retryCount = retryCount
        self.errorMessage = errorMessage
    }
}

/// Result of attempting to upload one queued item.
enum SyncOutcome: Equatable, Sendable {
    case success
    case conflict
    case failure(String)
}

/// Summary of a single `processQueue` run, surfaced to the UI so the user gets
/// an honest, specific result rather than a spinner that always "succeeds".
struct SyncRunSummary: Equatable, Sendable {
    let reachedNetwork: Bool
    let uploaded: Int
    let failed: Int
    let conflicted: Int
    let stillPending: Int

    /// A short, honest headline for the run.
    var headline: String {
        guard reachedNetwork else {
            return String(localized: "Offline — \(stillPending) change(s) queued and will sync when you're back online.")
        }
        if failed == 0, conflicted == 0 {
            return uploaded == 0
                ? String(localized: "Everything is already up to date.")
                : String(localized: "Synced \(uploaded) change(s).")
        }
        return String(localized: "Synced \(uploaded), \(failed) failed, \(conflicted) need review.")
    }
}
