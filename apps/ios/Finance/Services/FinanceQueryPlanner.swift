// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryPlanner.swift
// Finance
//
// Executes a deterministic ``FinanceQueryPlan`` over the local finance store
// (#2386). The planner is a pure value type operating on in-memory arrays so it
// can be unit-tested without repositories, KMP, or speech availability.

import Foundation

/// Computes a grounded answer for a parsed finance query.
struct FinanceQueryPlanner: Sendable {

    let calendar: Calendar

    init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    /// Executes `plan` against the supplied local data and returns a result
    /// with both typed and spoken summaries.
    func execute(
        _ plan: FinanceQueryPlan,
        transactions: [TransactionItem],
        accounts: [AccountItem]
    ) -> FinanceQueryResult {
        switch plan.kind {
        case .spend(let dimension):
            return executeSpend(plan, dimension: dimension, transactions: transactions)
        case .balance(let account):
            return executeBalance(plan, accountName: account, accounts: accounts)
        }
    }

    // MARK: - Spend

    private func executeSpend(
        _ plan: FinanceQueryPlan,
        dimension: FinanceQueryDimension,
        transactions: [TransactionItem]
    ) -> FinanceQueryResult {
        let matches = transactions.filter { transaction in
            guard transaction.type == .expense else { return false }
            if let range = plan.dateRange, !range.contains(transaction.date) { return false }
            return matchesDimension(transaction, dimension: dimension)
        }

        let total = matches.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
        let currencyCode = matches.first?.currencyCode
            ?? transactions.first?.currencyCode
            ?? "USD"
        let formatted = Self.formatCurrency(minorUnits: total, currencyCode: currencyCode)

        let subject = subjectPhrase(for: dimension)
        let period = periodPhrase(for: plan.dateRange)
        let count = matches.count

        let typed: String
        let spoken: String

        if count == 0 {
            typed = String(localized: "No spending found \(subject)\(period).")
            spoken = String(localized: "I didn't find any spending \(subject)\(period).")
        } else {
            let transactionWord = count == 1
                ? String(localized: "transaction")
                : String(localized: "transactions")
            typed = String(localized: "\(formatted) spent \(subject)\(period).")
            spoken = String(
                localized: "You spent \(formatted) \(subject)\(period), across \(count) \(transactionWord)."
            )
        }

        return FinanceQueryResult(
            plan: plan,
            amountMinorUnits: total,
            currencyCode: currencyCode,
            matchCount: count,
            typedSummary: typed,
            spokenSummary: spoken
        )
    }

    private func matchesDimension(
        _ transaction: TransactionItem,
        dimension: FinanceQueryDimension
    ) -> Bool {
        switch dimension {
        case .category(let name):
            return transaction.category.localizedCaseInsensitiveCompare(name) == .orderedSame
        case .merchant(let name):
            return transaction.payee.localizedCaseInsensitiveContains(name)
                || name.localizedCaseInsensitiveContains(transaction.payee)
        case .account(let name):
            return transaction.accountName.localizedCaseInsensitiveCompare(name) == .orderedSame
                || transaction.accountName.localizedCaseInsensitiveContains(name)
        case .all:
            return true
        }
    }

    // MARK: - Balance (sensitive)

    private func executeBalance(
        _ plan: FinanceQueryPlan,
        accountName: String?,
        accounts: [AccountItem]
    ) -> FinanceQueryResult {
        if let accountName,
           let matched = accounts.first(where: {
               $0.name.localizedCaseInsensitiveCompare(accountName) == .orderedSame
                   || $0.name.localizedCaseInsensitiveContains(accountName)
           }) {
            let formatted = Self.formatCurrency(
                minorUnits: matched.balanceMinorUnits,
                currencyCode: matched.currencyCode
            )
            return FinanceQueryResult(
                plan: plan,
                amountMinorUnits: matched.balanceMinorUnits,
                currencyCode: matched.currencyCode,
                matchCount: 1,
                typedSummary: String(localized: "\(matched.name): \(formatted)"),
                spokenSummary: String(localized: "Your \(matched.name) balance is \(formatted).")
            )
        }

        let total = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }
        let currencyCode = accounts.first?.currencyCode ?? "USD"
        let formatted = Self.formatCurrency(minorUnits: total, currencyCode: currencyCode)
        let count = accounts.count
        let accountWord = count == 1
            ? String(localized: "account")
            : String(localized: "accounts")

        return FinanceQueryResult(
            plan: plan,
            amountMinorUnits: total,
            currencyCode: currencyCode,
            matchCount: count,
            typedSummary: String(localized: "Total balance: \(formatted)"),
            spokenSummary: String(
                localized: "Your total balance across \(count) \(accountWord) is \(formatted)."
            )
        )
    }

    // MARK: - Phrase Builders

    private func subjectPhrase(for dimension: FinanceQueryDimension) -> String {
        switch dimension {
        case .category(let name): String(localized: "on \(name)")
        case .merchant(let name): String(localized: "at \(name)")
        case .account(let name): String(localized: "on \(name)")
        case .all: String(localized: "in total")
        }
    }

    private func periodPhrase(for range: FinanceQueryDateRange?) -> String {
        guard let range else { return "" }
        return " " + range.label
    }

    // MARK: - Currency Formatting

    static func formatCurrency(minorUnits: Int64, currencyCode: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        let majorUnits = NSDecimalNumber(value: minorUnits)
            .dividing(by: NSDecimalNumber(decimal: 100))
        return formatter.string(from: majorUnits) ?? "\(currencyCode) \(minorUnits)"
    }
}
