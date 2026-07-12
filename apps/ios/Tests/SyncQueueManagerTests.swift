// SPDX-License-Identifier: BUSL-1.1

// SyncQueueManagerTests.swift
// FinanceTests
//
// Tests the offline queued-sync state machine: nothing is lost offline, and
// online runs transition each item honestly to synced/failed/conflicted
// (#2204).

import XCTest
@testable import FinanceApp

private struct StubUploader: SyncUploading {
    let outcome: SyncOutcome
    func upload(_ item: SyncQueueItem) async -> SyncOutcome { outcome }
}

private struct ByEntityUploader: SyncUploading {
    let outcomes: [String: SyncOutcome]
    func upload(_ item: SyncQueueItem) async -> SyncOutcome {
        outcomes[item.entityId] ?? .success
    }
}

final class SyncQueueManagerTests: XCTestCase {

    private func makeManager() -> SyncQueueManager {
        let suite = "sync-queue-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return SyncQueueManager(defaults: defaults, key: "queue")
    }

    func testEnqueueAddsSavedLocallyItem() {
        let manager = makeManager()
        manager.enqueue(entityType: "transaction", entityId: "t1", summary: "Coffee")
        XCTAssertEqual(manager.items.count, 1)
        XCTAssertEqual(manager.items.first?.status, .savedLocally)
        XCTAssertEqual(manager.pendingCount, 1)
    }

    func testOfflineRunQueuesButDoesNotLose() async {
        let manager = makeManager()
        manager.enqueue(entityType: "transaction", entityId: "t1", summary: "Coffee")

        let summary = await manager.processQueue(isConnected: false)

        XCTAssertFalse(summary.reachedNetwork)
        XCTAssertEqual(summary.stillPending, 1)
        XCTAssertEqual(manager.items.first?.status, .queued)
        XCTAssertEqual(manager.pendingCount, 1, "Offline must never drop a change")
    }

    func testOnlineRunSyncsSuccessfully() async {
        let manager = makeManager()
        manager.enqueue(entityType: "transaction", entityId: "t1", summary: "Coffee")

        let summary = await manager.processQueue(isConnected: true, using: StubUploader(outcome: .success))

        XCTAssertTrue(summary.reachedNetwork)
        XCTAssertEqual(summary.uploaded, 1)
        XCTAssertEqual(manager.syncedCount, 1)
        XCTAssertEqual(manager.pendingCount, 0)
    }

    func testFailureIsRecordedAndRetryable() async {
        let manager = makeManager()
        manager.enqueue(entityType: "transaction", entityId: "t1", summary: "Coffee")

        _ = await manager.processQueue(isConnected: true, using: StubUploader(outcome: .failure("timeout")))
        XCTAssertEqual(manager.failedCount, 1)
        XCTAssertTrue(manager.needsAttention)
        XCTAssertEqual(manager.items.first?.errorMessage, "timeout")
        XCTAssertEqual(manager.items.first?.retryCount, 1)

        manager.retryFailed()
        XCTAssertEqual(manager.items.first?.status, .queued)

        let retry = await manager.processQueue(isConnected: true, using: StubUploader(outcome: .success))
        XCTAssertEqual(retry.uploaded, 1)
        XCTAssertEqual(manager.failedCount, 0)
    }

    func testConflictIsSurfaced() async {
        let manager = makeManager()
        manager.enqueue(entityType: "transaction", entityId: "t1", summary: "Coffee")

        let summary = await manager.processQueue(isConnected: true, using: StubUploader(outcome: .conflict))
        XCTAssertEqual(summary.conflicted, 1)
        XCTAssertEqual(manager.conflictedCount, 1)
        XCTAssertTrue(manager.needsAttention)
    }

    func testClearSyncedRemovesOnlySyncedItems() async {
        let manager = makeManager()
        manager.enqueue(entityType: "transaction", entityId: "ok", summary: "Coffee")
        manager.enqueue(entityType: "transaction", entityId: "bad", summary: "Hostel")

        _ = await manager.processQueue(
            isConnected: true,
            using: ByEntityUploader(outcomes: ["ok": .success, "bad": .failure("nope")])
        )
        XCTAssertEqual(manager.syncedCount, 1)
        XCTAssertEqual(manager.failedCount, 1)

        manager.clearSynced()
        XCTAssertEqual(manager.syncedCount, 0)
        XCTAssertEqual(manager.failedCount, 1, "Failed items stay until resolved")
    }

    func testOfflineHeadlineIsHonest() {
        let summary = SyncRunSummary(reachedNetwork: false, uploaded: 0, failed: 0, conflicted: 0, stillPending: 3)
        XCTAssertTrue(summary.headline.localizedCaseInsensitiveContains("offline"))
    }
}
