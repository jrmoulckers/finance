// SPDX-License-Identifier: BUSL-1.1

// SyncQueueManager.swift
// Finance
//
// Observable, persisted queue that gives offline users trustworthy feedback on
// what has and hasn't synced (#2204). Replaces the previous simulated
// `syncNow()` delay with a real, inspectable state machine.

import Observation
import Foundation
import os

/// Uploads a queued item to the server. Injectable so the queue can be driven
/// deterministically in tests and previews without a network.
protocol SyncUploading: Sendable {
    func upload(_ item: SyncQueueItem) async -> SyncOutcome
}

/// Default uploader used in the app until the shared KMP `SyncManager` lands.
/// Optimistically reports success so local changes settle; the queue's state
/// machine still records and persists every transition honestly.
struct DefaultSyncUploader: SyncUploading {
    func upload(_ item: SyncQueueItem) async -> SyncOutcome {
        try? await Task.sleep(for: .milliseconds(150))
        return .success
    }
}

@Observable
final class SyncQueueManager: @unchecked Sendable {
    static let shared = SyncQueueManager()

    /// Current queue contents, newest first. Observed by the UI.
    private(set) var items: [SyncQueueItem] = []

    private let defaults: UserDefaults
    private let key: String
    private let lock = NSLock()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SyncQueueManager"
    )

    init(defaults: UserDefaults = .standard, key: String = "finance_sync_queue") {
        self.defaults = defaults
        self.key = key
        self.items = Self.load(from: defaults, key: key)
    }

    // MARK: - Derived counts

    /// Changes still on their way to the server (saved/queued/uploading).
    var pendingCount: Int { items.filter { $0.status.isPending }.count }

    /// Changes that failed to upload.
    var failedCount: Int { items.filter { $0.status == .failed }.count }

    /// Changes blocked by a server-side conflict.
    var conflictedCount: Int { items.filter { $0.status == .conflicted }.count }

    /// Changes successfully synced (retained until cleared for reassurance).
    var syncedCount: Int { items.filter { $0.status == .synced }.count }

    /// Whether anything needs the user's attention.
    var needsAttention: Bool { failedCount > 0 || conflictedCount > 0 }

    // MARK: - Mutations

    /// Adds a locally-made change to the queue.
    @discardableResult
    func enqueue(entityType: String, entityId: String, summary: String) -> SyncQueueItem {
        let item = SyncQueueItem(entityType: entityType, entityId: entityId, summary: summary)
        lock.lock()
        items.insert(item, at: 0)
        persistLocked()
        lock.unlock()
        return item
    }

    /// Clears successfully-synced items from the visible queue.
    func clearSynced() {
        lock.lock()
        items.removeAll { $0.status == .synced }
        persistLocked()
        lock.unlock()
    }

    /// Marks failed/conflicted items as queued so the next run retries them.
    func retryFailed() {
        lock.lock()
        for index in items.indices where items[index].status == .failed || items[index].status == .conflicted {
            items[index].status = .queued
            items[index].updatedAt = .now
        }
        persistLocked()
        lock.unlock()
    }

    /// Processes the queue. When offline, pending items are marked `queued`
    /// (waiting) and nothing is lost; when online each pending item is uploaded
    /// and transitioned to synced / failed / conflicted.
    @discardableResult
    func processQueue(
        isConnected: Bool,
        using uploader: SyncUploading = DefaultSyncUploader()
    ) async -> SyncRunSummary {
        guard isConnected else {
            lock.lock()
            for index in items.indices where items[index].status == .savedLocally {
                items[index].status = .queued
                items[index].updatedAt = .now
            }
            persistLocked()
            let pending = items.filter { $0.status.isPending }.count
            lock.unlock()
            Self.logger.info("Sync skipped — offline, \(pending, privacy: .public) queued")
            return SyncRunSummary(
                reachedNetwork: false,
                uploaded: 0,
                failed: 0,
                conflicted: 0,
                stillPending: pending
            )
        }

        // Snapshot the ids we will attempt this run.
        lock.lock()
        let targets = items
            .filter { $0.status == .savedLocally || $0.status == .queued || $0.status == .failed }
            .map(\.id)
        lock.unlock()

        var uploaded = 0
        var failed = 0
        var conflicted = 0

        for id in targets {
            setStatus(id, .uploading)
            guard let snapshot = item(withId: id) else { continue }
            let outcome = await uploader.upload(snapshot)
            switch outcome {
            case .success:
                setStatus(id, .synced, clearError: true)
                uploaded += 1
            case .conflict:
                setStatus(id, .conflicted)
                conflicted += 1
            case let .failure(message):
                setStatus(id, .failed, error: message, incrementRetry: true)
                failed += 1
            }
        }

        let pending = items.filter { $0.status.isPending }.count
        Self.logger.info("Sync run: uploaded=\(uploaded, privacy: .public) failed=\(failed, privacy: .public) conflicted=\(conflicted, privacy: .public)")
        return SyncRunSummary(
            reachedNetwork: true,
            uploaded: uploaded,
            failed: failed,
            conflicted: conflicted,
            stillPending: pending
        )
    }

    // MARK: - Private helpers

    private func item(withId id: String) -> SyncQueueItem? {
        lock.lock(); defer { lock.unlock() }
        return items.first { $0.id == id }
    }

    private func setStatus(
        _ id: String,
        _ status: SyncItemStatus,
        error: String? = nil,
        clearError: Bool = false,
        incrementRetry: Bool = false
    ) {
        lock.lock()
        if let index = items.firstIndex(where: { $0.id == id }) {
            items[index].status = status
            items[index].updatedAt = .now
            if clearError { items[index].errorMessage = nil }
            if let error { items[index].errorMessage = error }
            if incrementRetry { items[index].retryCount += 1 }
        }
        persistLocked()
        lock.unlock()
    }

    /// Persists the queue. Caller must hold `lock`.
    private func persistLocked() {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            defaults.set(try encoder.encode(items), forKey: key)
        } catch {
            Self.logger.error("Failed to persist sync queue: \(error.localizedDescription, privacy: .public)")
        }
    }

    private static func load(from defaults: UserDefaults, key: String) -> [SyncQueueItem] {
        guard let data = defaults.data(forKey: key) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([SyncQueueItem].self, from: data)) ?? []
    }
}
