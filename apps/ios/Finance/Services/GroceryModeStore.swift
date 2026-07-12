// SPDX-License-Identifier: BUSL-1.1

// GroceryModeStore.swift
// Finance
//
// Persists the small set of inputs behind grocery-store "can I afford this?"
// mode: cash on hand, bills reserved before payday, and an optional pinned
// category budget. All affordability math is delegated to `SafeToSpendCalculator`.
//
// References: #2199

import FinanceShared
import Foundation
import Observation

@Observable
final class GroceryModeStore {
    private let defaults: UserDefaults

    private enum Key {
        static let cleared = "grocery.clearedCashMinorUnits"
        static let reserved = "grocery.billsBeforePaydayMinorUnits"
        static let pinnedName = "grocery.pinnedCategoryName"
        static let pinnedRemaining = "grocery.pinnedCategoryRemainingMinorUnits"
        static let hasPinned = "grocery.hasPinnedCategory"
        static let currency = "grocery.currencyCode"
    }

    /// Cash available right now (entered by the user), minor units.
    var clearedCashMinorUnits: Int64 {
        didSet { defaults.set(clearedCashMinorUnits, forKey: Key.cleared) }
    }

    /// Critical bills landing before the next payday to hold back, minor units.
    var billsBeforePaydayMinorUnits: Int64 {
        didSet { defaults.set(billsBeforePaydayMinorUnits, forKey: Key.reserved) }
    }

    /// Optional pinned high-frequency category (e.g. Groceries).
    var pinnedCategoryName: String? {
        didSet {
            defaults.set(pinnedCategoryName, forKey: Key.pinnedName)
            defaults.set(pinnedCategoryName != nil, forKey: Key.hasPinned)
        }
    }

    /// Remaining budget for the pinned category, minor units.
    var pinnedCategoryRemainingMinorUnits: Int64 {
        didSet { defaults.set(pinnedCategoryRemainingMinorUnits, forKey: Key.pinnedRemaining) }
    }

    var currencyCode: String {
        didSet { defaults.set(currencyCode, forKey: Key.currency) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.clearedCashMinorUnits = Int64(defaults.integer(forKey: Key.cleared))
        self.billsBeforePaydayMinorUnits = Int64(defaults.integer(forKey: Key.reserved))
        self.pinnedCategoryRemainingMinorUnits = Int64(defaults.integer(forKey: Key.pinnedRemaining))
        self.currencyCode = defaults.string(forKey: Key.currency) ?? "USD"
        self.pinnedCategoryName = defaults.bool(forKey: Key.hasPinned)
            ? defaults.string(forKey: Key.pinnedName)
            : nil
    }

    /// Computes the safe-to-spend summary for the given payday.
    func result(nextPayday: Date, referenceDate: Date = Date()) -> SafeToSpendResult {
        let obligations: [SafeToSpendObligation]
        if billsBeforePaydayMinorUnits > 0 {
            obligations = [
                SafeToSpendObligation(
                    amountMinorUnits: billsBeforePaydayMinorUnits,
                    dueDate: nextPayday,
                    isCritical: true
                )
            ]
        } else {
            obligations = []
        }

        let input = SafeToSpendInput(
            clearedCashMinorUnits: clearedCashMinorUnits,
            nextPaydayDate: nextPayday,
            obligations: obligations,
            pinnedCategoryRemainingMinorUnits: pinnedCategoryName == nil ? nil : pinnedCategoryRemainingMinorUnits,
            pinnedCategoryName: pinnedCategoryName,
            currencyCode: currencyCode,
            referenceDate: referenceDate
        )
        return SafeToSpendCalculator.evaluate(input)
    }
}
