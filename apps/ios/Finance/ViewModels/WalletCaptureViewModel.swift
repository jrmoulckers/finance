// SPDX-License-Identifier: BUSL-1.1

// WalletCaptureViewModel.swift
// Finance
//
// Drives the Wallet-aware capture review inbox (#2171). Loads recent card
// activity from a WalletActivityProviding source, cleans/recognizes each
// merchant, flags likely duplicates against existing transactions, and lets an
// Apple Pay-heavy user confirm imports with a single tap instead of full
// manual re-entry. Imported items are persisted through the normal transaction
// repository and queued for sync so offline feedback stays trustworthy (#2204).

import Observation
import Foundation
import os

@Observable
final class WalletCaptureViewModel {
    private let provider: WalletActivityProviding
    private let transactionRepository: TransactionRepository
    private let syncQueue: SyncQueueManager

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "WalletCaptureViewModel"
    )

    var candidates: [WalletTransactionCandidate] = []
    var isLoading = false
    var importedCount = 0
    var errorMessage: String?

    private(set) var displayCurrencyCode = CurrencyPreferences.displayCurrencyCode()

    init(
        provider: WalletActivityProviding = SimulatedWalletActivityProvider(),
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        syncQueue: SyncQueueManager = .shared
    ) {
        self.provider = provider
        self.transactionRepository = transactionRepository
        self.syncQueue = syncQueue
    }

    /// Whether there is nothing left to review.
    var isEmpty: Bool { candidates.isEmpty }

    /// Candidates that are not flagged as likely duplicates.
    var nonDuplicateCandidates: [WalletTransactionCandidate] {
        candidates.filter { !$0.isLikelyDuplicate }
    }

    /// Number of candidates flagged as likely duplicates.
    var duplicateCount: Int {
        candidates.filter(\.isLikelyDuplicate).count
    }

    /// Loads recent activity and annotates duplicates against existing history.
    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        displayCurrencyCode = CurrencyPreferences.displayCurrencyCode()

        let fetched = await provider.recentActivity(displayCurrencyCode: displayCurrencyCode)

        var existing: [TransactionItem] = []
        do {
            existing = try await transactionRepository.getTransactions()
        } catch {
            Self.logger.error("Wallet capture history load failed: \(error.localizedDescription, privacy: .public)")
        }

        candidates = WalletDuplicateDetector.annotate(candidates: fetched, existing: existing)
    }

    /// Imports a single candidate as an expense and removes it from the inbox.
    @discardableResult
    func importCandidate(_ candidate: WalletTransactionCandidate) async -> Bool {
        let transaction = makeTransaction(from: candidate)
        do {
            try await transactionRepository.createTransaction(transaction)
            syncQueue.enqueue(
                entityType: "transaction",
                entityId: transaction.id,
                summary: "\(candidate.merchant) — Apple Pay"
            )
            candidates.removeAll { $0.id == candidate.id }
            importedCount += 1
            return true
        } catch {
            Self.logger.error("Wallet candidate import failed: \(error.localizedDescription, privacy: .public)")
            errorMessage = error.localizedDescription
            return false
        }
    }

    /// Imports every non-duplicate candidate in one pass.
    func importAllNonDuplicates() async {
        for candidate in nonDuplicateCandidates {
            _ = await importCandidate(candidate)
        }
    }

    /// Dismisses a candidate without importing it.
    func dismiss(_ candidate: WalletTransactionCandidate) {
        candidates.removeAll { $0.id == candidate.id }
    }

    /// Builds a transaction from a reviewed candidate. Expenses are stored with
    /// a negative amount, and the purchase instant + current timezone are
    /// preserved so cross-border reporting stays correct (#2206).
    private func makeTransaction(from candidate: WalletTransactionCandidate) -> TransactionItem {
        TransactionItem(
            id: UUID().uuidString,
            payee: candidate.merchant,
            category: candidate.suggestedCategory ?? "",
            amountMinorUnits: -candidate.amountMinorUnits,
            currencyCode: candidate.currencyCode,
            date: candidate.date,
            type: .expense,
            tagNames: ["apple-pay"],
            timestamp: candidate.date,
            timeZoneIdentifier: TimeZone.current.identifier
        )
    }
}
