// SPDX-License-Identifier: BUSL-1.1

// TransactionFilters.swift
// Finance
//
// Filter criteria for transaction lists. Supports date range presets,
// transaction type toggles, category selection, and amount range.

import Foundation

/// Filter criteria applied to transaction lists.
///
/// Designed as a value type so SwiftUI can detect mutations via `@Binding`.
/// The ``apply(to:)`` method chains all active filter dimensions in order:
/// date range → transaction type → category → amount range.
struct TransactionFilters: Equatable, Sendable {

    // MARK: - Date Preset

    /// Quick-select date range presets.
    enum DatePreset: String, CaseIterable, Sendable {
        case today
        case thisWeek
        case thisMonth
        case thisYear
        case allTime
        case custom

        var displayName: String {
            switch self {
            case .today:     String(localized: "Today")
            case .thisWeek:  String(localized: "This Week")
            case .thisMonth: String(localized: "This Month")
            case .thisYear:  String(localized: "This Year")
            case .allTime:   String(localized: "All Time")
            case .custom:    String(localized: "Custom")
            }
        }
    }

    // MARK: - Properties

    var datePreset: DatePreset = .allTime
    var customStartDate: Date = Calendar.current.date(byAdding: .month, value: -1, to: .now) ?? .now
    var customEndDate: Date = .now

    var includeExpenses: Bool = true
    var includeIncome: Bool = true
    var includeTransfers: Bool = true

    /// Selected category names. An empty set means "all categories".
    var selectedCategories: Set<String> = []

    /// Minimum amount (stored as string for `TextField` binding).
    var minAmount: String = ""
    /// Maximum amount (stored as string for `TextField` binding).
    var maxAmount: String = ""

    // MARK: - Computed

    /// Whether any non-default filter is active.
    var isActive: Bool { self != .default }

    /// Number of active filter dimensions (for badge count).
    var activeCount: Int {
        var count = 0
        if datePreset != .allTime { count += 1 }
        if !includeExpenses || !includeIncome || !includeTransfers { count += 1 }
        if !selectedCategories.isEmpty { count += 1 }
        if !minAmount.isEmpty || !maxAmount.isEmpty { count += 1 }
        return count
    }

    /// The default (no-filter) state.
    static let `default` = TransactionFilters()

    // MARK: - Filtering

    /// Apply all active filters to a transaction list.
    func apply(to transactions: [TransactionItem]) -> [TransactionItem] {
        var result = transactions

        // 1. Date range
        result = filterByDate(result)

        // 2. Transaction type
        result = filterByType(result)

        // 3. Category
        result = filterByCategory(result)

        // 4. Amount range
        result = filterByAmount(result)

        return result
    }

    // MARK: - Chip Labels

    /// Human-readable labels for each active filter dimension,
    /// used by the chip bar in the transactions list.
    var activeChipLabels: [FilterChip] {
        var chips: [FilterChip] = []

        if datePreset != .allTime {
            if datePreset == .custom {
                let formatter = DateFormatter()
                formatter.dateStyle = .short
                let label = "\(formatter.string(from: customStartDate)) – \(formatter.string(from: customEndDate))"
                chips.append(FilterChip(id: "date", label: label))
            } else {
                chips.append(FilterChip(id: "date", label: datePreset.displayName))
            }
        }

        if !includeExpenses || !includeIncome || !includeTransfers {
            var included: [String] = []
            if includeExpenses  { included.append(TransactionTypeUI.expense.displayName) }
            if includeIncome    { included.append(TransactionTypeUI.income.displayName) }
            if includeTransfers { included.append(TransactionTypeUI.transfer.displayName) }
            let label = included.joined(separator: ", ")
            chips.append(FilterChip(id: "type", label: label))
        }

        if !selectedCategories.isEmpty {
            let label = selectedCategories.sorted().joined(separator: ", ")
            chips.append(FilterChip(id: "category", label: label))
        }

        if !minAmount.isEmpty || !maxAmount.isEmpty {
            var parts: [String] = []
            if !minAmount.isEmpty {
                parts.append("$\(minAmount)")
            }
            parts.append("–")
            if !maxAmount.isEmpty {
                parts.append("$\(maxAmount)")
            }
            chips.append(FilterChip(id: "amount", label: parts.joined(separator: " ")))
        }

        return chips
    }

    /// Remove the filter dimension identified by a chip.
    mutating func removeChip(_ chip: FilterChip) {
        switch chip.id {
        case "date":
            datePreset = .allTime
        case "type":
            includeExpenses = true
            includeIncome = true
            includeTransfers = true
        case "category":
            selectedCategories = []
        case "amount":
            minAmount = ""
            maxAmount = ""
        default:
            break
        }
    }

    // MARK: - Private Helpers

    private func filterByDate(_ items: [TransactionItem]) -> [TransactionItem] {
        let calendar = Calendar.current
        let now = Date.now

        let range: (start: Date, end: Date)

        switch datePreset {
        case .allTime:
            return items
        case .today:
            let start = calendar.startOfDay(for: now)
            let end = calendar.date(byAdding: .day, value: 1, to: start) ?? now
            range = (start, end)
        case .thisWeek:
            guard let weekInterval = calendar.dateInterval(of: .weekOfYear, for: now) else { return items }
            range = (weekInterval.start, weekInterval.end)
        case .thisMonth:
            guard let monthInterval = calendar.dateInterval(of: .month, for: now) else { return items }
            range = (monthInterval.start, monthInterval.end)
        case .thisYear:
            guard let yearInterval = calendar.dateInterval(of: .year, for: now) else { return items }
            range = (yearInterval.start, yearInterval.end)
        case .custom:
            let start = calendar.startOfDay(for: customStartDate)
            // Include the whole end day
            let end = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: customEndDate)) ?? customEndDate
            range = (start, end)
        }

        return items.filter { $0.date >= range.start && $0.date < range.end }
    }

    private func filterByType(_ items: [TransactionItem]) -> [TransactionItem] {
        if includeExpenses && includeIncome && includeTransfers { return items }

        return items.filter { item in
            switch item.type {
            case .expense:  return includeExpenses
            case .income:   return includeIncome
            case .transfer: return includeTransfers
            }
        }
    }

    private func filterByCategory(_ items: [TransactionItem]) -> [TransactionItem] {
        guard !selectedCategories.isEmpty else { return items }
        return items.filter { selectedCategories.contains($0.category) }
    }

    private func filterByAmount(_ items: [TransactionItem]) -> [TransactionItem] {
        let minValue = Decimal(string: minAmount)
        let maxValue = Decimal(string: maxAmount)

        guard minValue != nil || maxValue != nil else { return items }

        return items.filter { item in
            // Use absolute value for comparison (amounts can be negative for expenses)
            let absAmount = Decimal(abs(item.amountMinorUnits)) / 100

            if let min = minValue, absAmount < min { return false }
            if let max = maxValue, absAmount > max { return false }
            return true
        }
    }
}

// MARK: - Filter Chip Model

/// Identifiable chip representing one active filter dimension.
struct FilterChip: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
}
