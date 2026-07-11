// SPDX-License-Identifier: BUSL-1.1

// TripBudgetStore.swift
// Finance
//
// Persistence for trip/country budgets (#2205). Trip budgets are an iOS-side
// planning construct layered over the existing transaction data, so they are
// stored locally as JSON in UserDefaults — the same lightweight, offline-first
// pattern used by other iOS preferences. This keeps the feature self-contained
// within apps/ios while the shared KMP budgeting model remains read-only.

import Foundation
import os

/// Abstraction over trip-budget persistence so ViewModels and tests can inject
/// an in-memory implementation.
protocol TripBudgetStoring: Sendable {
    /// Returns all stored trip budgets.
    func all() -> [TripBudget]

    /// Inserts or updates a trip budget by id.
    func upsert(_ trip: TripBudget)

    /// Removes a trip budget by id.
    func remove(id: String)
}

extension TripBudgetStoring {
    /// Active (non-archived) trips, sorted by start date descending.
    func activeTrips() -> [TripBudget] {
        all().filter { !$0.isArchived }.sorted { $0.startDate > $1.startDate }
    }

    /// Archived trips, sorted by end date descending.
    func archivedTrips() -> [TripBudget] {
        all().filter(\.isArchived).sorted { $0.endDate > $1.endDate }
    }
}

/// UserDefaults-backed JSON store for trip budgets.
final class TripBudgetStore: TripBudgetStoring, @unchecked Sendable {
    static let shared = TripBudgetStore()

    private let defaults: UserDefaults
    private let key: String
    private let queue = DispatchQueue(label: "com.finance.TripBudgetStore")

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TripBudgetStore"
    )

    init(defaults: UserDefaults = .standard, key: String = "finance_trip_budgets") {
        self.defaults = defaults
        self.key = key
    }

    func all() -> [TripBudget] {
        queue.sync {
            guard let data = defaults.data(forKey: key) else { return [] }
            do {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                return try decoder.decode([TripBudget].self, from: data)
            } catch {
                Self.logger.error("Failed to decode trip budgets: \(error.localizedDescription, privacy: .public)")
                return []
            }
        }
    }

    func upsert(_ trip: TripBudget) {
        queue.sync {
            var trips = decode()
            if let index = trips.firstIndex(where: { $0.id == trip.id }) {
                trips[index] = trip
            } else {
                trips.append(trip)
            }
            persist(trips)
        }
    }

    func remove(id: String) {
        queue.sync {
            var trips = decode()
            trips.removeAll { $0.id == id }
            persist(trips)
        }
    }

    // MARK: - Private

    private func decode() -> [TripBudget] {
        guard let data = defaults.data(forKey: key) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([TripBudget].self, from: data)) ?? []
    }

    private func persist(_ trips: [TripBudget]) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            defaults.set(try encoder.encode(trips), forKey: key)
        } catch {
            Self.logger.error("Failed to encode trip budgets: \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// In-memory store for previews and tests.
final class InMemoryTripBudgetStore: TripBudgetStoring, @unchecked Sendable {
    private let queue = DispatchQueue(label: "com.finance.InMemoryTripBudgetStore")
    private var trips: [String: TripBudget]

    init(trips: [TripBudget] = []) {
        self.trips = Dictionary(uniqueKeysWithValues: trips.map { ($0.id, $0) })
    }

    func all() -> [TripBudget] { queue.sync { Array(trips.values) } }

    func upsert(_ trip: TripBudget) { queue.sync { trips[trip.id] = trip } }

    func remove(id: String) { queue.sync { trips[id] = nil } }
}
