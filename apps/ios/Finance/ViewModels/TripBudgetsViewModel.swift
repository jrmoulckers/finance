// SPDX-License-Identifier: BUSL-1.1

// TripBudgetsViewModel.swift
// Finance
//
// Drives the trip/country budgets screen: loads trips from the store, measures
// spend against them from the transaction history, and supports archiving when
// a trip ends without losing historical reporting (#2205).

import Observation
import Foundation
import os

@Observable
final class TripBudgetsViewModel {
    private let store: TripBudgetStoring
    private let transactionRepository: TransactionRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TripBudgetsViewModel"
    )

    var activeTrips: [TripBudget] = []
    var archivedTrips: [TripBudget] = []
    var isLoading = false
    var showingCreate = false
    var editingTrip: TripBudget?

    /// Active display currency, used for empty-state copy and roll-up hints.
    private(set) var displayCurrencyCode = CurrencyPreferences.displayCurrencyCode()

    private var transactions: [TransactionItem] = []
    private var progressByTrip: [String: TripBudgetProgress] = [:]

    init(
        store: TripBudgetStoring = TripBudgetStore.shared,
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions
    ) {
        self.store = store
        self.transactionRepository = transactionRepository
    }

    /// Whether there are no trips at all (active or archived).
    var isEmpty: Bool { activeTrips.isEmpty && archivedTrips.isEmpty }

    /// Loads transactions and recomputes progress for every trip.
    func load() async {
        isLoading = true
        defer { isLoading = false }

        displayCurrencyCode = CurrencyPreferences.displayCurrencyCode()
        do {
            transactions = try await transactionRepository.getTransactions()
        } catch {
            Self.logger.error("Trip budgets transaction load failed: \(error.localizedDescription, privacy: .public)")
            transactions = []
        }
        refresh()
    }

    /// Recomputes derived state from the store and cached transactions.
    private func refresh() {
        activeTrips = store.activeTrips()
        archivedTrips = store.archivedTrips()

        var map: [String: TripBudgetProgress] = [:]
        for trip in activeTrips + archivedTrips {
            map[trip.id] = TripBudgetCalculator.progress(for: trip, in: transactions)
        }
        progressByTrip = map
    }

    /// Spend progress for a trip (zero when not yet computed).
    func progress(for trip: TripBudget) -> TripBudgetProgress {
        progressByTrip[trip.id] ?? .zero
    }

    /// Persists a new or edited trip and recomputes progress.
    func save(_ trip: TripBudget) {
        store.upsert(trip)
        refresh()
    }

    /// Archives a trip so it drops out of the active list but is retained for
    /// historical reporting.
    func archive(_ trip: TripBudget) {
        var updated = trip
        updated.isArchived = true
        store.upsert(updated)
        refresh()
    }

    /// Restores an archived trip to the active list.
    func unarchive(_ trip: TripBudget) {
        var updated = trip
        updated.isArchived = false
        store.upsert(updated)
        refresh()
    }

    /// Permanently deletes a trip.
    func delete(_ trip: TripBudget) {
        store.remove(id: trip.id)
        refresh()
    }
}
