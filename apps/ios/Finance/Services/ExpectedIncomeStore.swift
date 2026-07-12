// SPDX-License-Identifier: BUSL-1.1

// ExpectedIncomeStore.swift
// Finance
//
// Persists expected (not-yet-cleared) income — child support, freelance
// invoices, reimbursements — separately from cleared cash, so single parents
// relying on late or unreliable deposits never plan against money that hasn't
// arrived. All computation is delegated to `ExpectedIncomeCalculator`.
//
// References: #2193

import FinanceShared
import Foundation
import os
import Observation

@Observable
final class ExpectedIncomeStore {
    private let defaults: UserDefaults

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ExpectedIncomeStore"
    )

    private enum Key {
        static let items = "expectedIncome.items"
        static let clearedCash = "expectedIncome.clearedCashMinorUnits"
        static let currency = "expectedIncome.currencyCode"
    }

    /// The tracked expected deposits, persisted as JSON.
    var items: [ExpectedIncome] {
        didSet { persistItems() }
    }

    /// Cash the household already has cleared, entered by the user, minor units.
    var clearedCashMinorUnits: Int64 {
        didSet { defaults.set(clearedCashMinorUnits, forKey: Key.clearedCash) }
    }

    /// ISO currency code for display.
    var currencyCode: String {
        didSet { defaults.set(currencyCode, forKey: Key.currency) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.clearedCashMinorUnits = Int64(defaults.integer(forKey: Key.clearedCash))
        self.currencyCode = defaults.string(forKey: Key.currency) ?? "USD"

        if let data = defaults.data(forKey: Key.items),
           let decoded = try? JSONDecoder().decode([ExpectedIncome].self, from: data) {
            self.items = decoded.sorted { $0.expectedDate < $1.expectedDate }
        } else {
            self.items = []
        }
    }

    // MARK: - Derived

    /// The honest cleared / expected / at-risk cash split.
    func breakdown(asOf now: Date = Date()) -> CashBreakdown {
        ExpectedIncomeCalculator.breakdown(
            clearedCashMinorUnits: clearedCashMinorUnits,
            expectedIncomes: items,
            currencyCode: currencyCode,
            asOf: now
        )
    }

    /// Overdue deposits that should surface a gentle nudge.
    func overdue(asOf now: Date = Date()) -> [ExpectedIncome] {
        ExpectedIncomeCalculator.overdue(items, asOf: now)
    }

    // MARK: - Mutations

    func add(_ income: ExpectedIncome) {
        items.append(income)
        items.sort { $0.expectedDate < $1.expectedDate }
    }

    func update(_ income: ExpectedIncome) {
        guard let index = items.firstIndex(where: { $0.id == income.id }) else { return }
        items[index] = income
        items.sort { $0.expectedDate < $1.expectedDate }
    }

    func remove(id: String) {
        items.removeAll { $0.id == id }
    }

    /// Replaces an item with a copy carrying a new status (and optional receipt).
    func setStatus(id: String, status: ExpectedIncomeStatus, receivedMinorUnits: Int64? = nil) {
        guard let existing = items.first(where: { $0.id == id }) else { return }
        let updated = ExpectedIncome(
            id: existing.id,
            source: existing.source,
            amountMinorUnits: existing.amountMinorUnits,
            receivedMinorUnits: receivedMinorUnits ?? existing.receivedMinorUnits,
            expectedDate: existing.expectedDate,
            reliability: existing.reliability,
            status: status
        )
        update(updated)
    }

    private func persistItems() {
        do {
            let data = try JSONEncoder().encode(items)
            defaults.set(data, forKey: Key.items)
        } catch {
            Self.logger.error("Failed to persist expected income: \(error.localizedDescription, privacy: .public)")
        }
    }
}
