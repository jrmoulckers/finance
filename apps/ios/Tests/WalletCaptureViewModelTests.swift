// SPDX-License-Identifier: BUSL-1.1

// WalletCaptureViewModelTests.swift
// FinanceTests
//
// Tests the Wallet capture review inbox: activity loads, duplicates are
// flagged against existing history, and one-tap import persists a transaction
// and queues it for sync (#2171, #2204).

import XCTest
@testable import FinanceApp

final class WalletCaptureViewModelTests: XCTestCase {

    private func makeSyncQueue() -> SyncQueueManager {
        let suite = "wallet-vm-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return SyncQueueManager(defaults: defaults, key: "queue")
    }

    @MainActor
    func testLoadPopulatesCandidates() async {
        let repo = StubTransactionRepository()
        let vm = WalletCaptureViewModel(
            provider: SimulatedWalletActivityProvider(),
            transactionRepository: repo,
            syncQueue: makeSyncQueue()
        )

        await vm.load()

        XCTAssertFalse(vm.isEmpty)
        XCTAssertGreaterThan(vm.candidates.count, 0)
    }

    @MainActor
    func testImportPersistsTransactionAndQueuesSync() async {
        let repo = StubTransactionRepository()
        let queue = makeSyncQueue()
        let vm = WalletCaptureViewModel(
            provider: SimulatedWalletActivityProvider(),
            transactionRepository: repo,
            syncQueue: queue
        )
        await vm.load()
        let target = vm.candidates.first!

        let ok = await vm.importCandidate(target)

        XCTAssertTrue(ok)
        XCTAssertEqual(repo.createdTransactions.count, 1)
        let created = repo.createdTransactions[0]
        XCTAssertLessThan(created.amountMinorUnits, 0, "Imported purchases are expenses")
        XCTAssertEqual(created.type, .expense)
        XCTAssertTrue(created.hasPreservedTimeZone, "Import preserves instant + timezone")
        XCTAssertTrue(created.tagNames.contains("apple-pay"))
        XCTAssertEqual(queue.items.count, 1)
        XCTAssertFalse(vm.candidates.contains { $0.id == target.id }, "Imported candidate leaves the inbox")
        XCTAssertEqual(vm.importedCount, 1)
    }

    @MainActor
    func testDismissRemovesWithoutImporting() async {
        let repo = StubTransactionRepository()
        let vm = WalletCaptureViewModel(
            provider: SimulatedWalletActivityProvider(),
            transactionRepository: repo,
            syncQueue: makeSyncQueue()
        )
        await vm.load()
        let target = vm.candidates.first!

        vm.dismiss(target)

        XCTAssertFalse(vm.candidates.contains { $0.id == target.id })
        XCTAssertEqual(repo.createdTransactions.count, 0)
    }

    @MainActor
    func testDuplicatesFlaggedAgainstExistingHistory() async {
        let now = Date()
        let repo = StubTransactionRepository()
        // Seed history that duplicates one simulated candidate: Uber trip 1830.
        repo.transactionsToReturn = [
            TransactionItem(
                id: "seed",
                payee: "Uber Trip",
                category: "Transport",
                amountMinorUnits: -1830,
                currencyCode: CurrencyPreferences.displayCurrencyCode(),
                date: now,
                type: .expense
            )
        ]
        let vm = WalletCaptureViewModel(
            provider: SimulatedWalletActivityProvider(now: now),
            transactionRepository: repo,
            syncQueue: makeSyncQueue()
        )

        await vm.load()

        XCTAssertGreaterThan(vm.duplicateCount, 0, "The matching Uber trip should be flagged as duplicate")
        XCTAssertLessThan(vm.nonDuplicateCandidates.count, vm.candidates.count)
    }
}
