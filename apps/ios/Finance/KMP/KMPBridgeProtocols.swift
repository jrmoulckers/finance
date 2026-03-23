// SPDX-License-Identifier: BUSL-1.1
// KMPBridgeProtocols.swift — Protocol abstractions mirroring KMP APIs + stub implementations.
import Foundation

protocol KMPFinancialAggregatorProtocol: Sendable {
    func netWorth(accounts: [KMPAccount]) -> Int64
    func totalSpending(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Int64
    func totalIncome(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Int64
    func netCashFlow(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Int64
    func spendingByCategory(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> [String: Int64]
    func savingsRate(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Double
}

protocol KMPBudgetCalculatorProtocol: Sendable {
    func calculateStatus(budget: KMPBudget, transactions: [KMPTransaction], referenceDate: DateComponents) -> KMPBudgetStatus
    func dailyBudgetRate(budgetAmount: Int64, spent: Int64, daysRemaining: Int) -> Int64
}

protocol KMPTransactionValidatorProtocol: Sendable {
    func validate(transaction: KMPTransaction, existingAccountIds: Set<String>, existingCategoryIds: Set<String>) -> [String]
}

protocol KMPCategorizationEngineProtocol: Sendable {
    func suggest(payee: String?) -> String?
    func learnFromHistory(payee: String, categoryId: String)
}

protocol KMPCurrencyFormatterProtocol: Sendable {
    func format(amountMinorUnits: Int64, currencyCode: String, showSign: Bool) -> String
    func formatCompact(amountMinorUnits: Int64, currencyCode: String) -> String
}

protocol KMPSyncClientProtocol: Sendable {
    func start() async
    func stop() async
    func syncNow() async -> KMPSyncResult
    func signOut() async
    func observeSyncStatus() -> AsyncStream<KMPSyncStatus>
    var isAuthenticated: Bool { get }
    var pendingMutationCount: Int { get }
}

// MARK: - KMP Data Types

struct KMPTransaction: Sendable {
    let id, householdId, accountId: String
    let categoryId: String?
    let type: KMPTransactionType
    let status: KMPTransactionStatus
    let amountMinorUnits: Int64
    let currencyCode: String
    let payee, note: String?
    let date: DateComponents
    let transferAccountId: String?
    let isRecurring: Bool
    let tags: [String]
    let createdAt, updatedAt: Date
    let deletedAt: Date?
    let isSynced: Bool
}

enum KMPTransactionType: String, Sendable, CaseIterable { case expense, income, transfer }
enum KMPTransactionStatus: String, Sendable, CaseIterable { case pending, cleared, reconciled, voided }

struct KMPAccount: Sendable {
    let id, householdId, name: String
    let type: KMPAccountType
    let currencyCode: String
    let currentBalanceMinorUnits: Int64
    let isArchived: Bool
    let sortOrder: Int32
    let icon, color: String?
    let createdAt, updatedAt: Date
    let deletedAt: Date?
    let isSynced: Bool
}

enum KMPAccountType: String, Sendable, CaseIterable { case checking, savings, creditCard, cash, investment, loan, other }

struct KMPBudget: Sendable {
    let id, householdId, categoryId, name: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let period: KMPBudgetPeriod
    let startDate: DateComponents
    let endDate: DateComponents?
    let isRollover: Bool
    let createdAt, updatedAt: Date
    let deletedAt: Date?
    let isSynced: Bool
}

enum KMPBudgetPeriod: String, Sendable, CaseIterable { case weekly, biweekly, monthly, quarterly, yearly }

struct KMPGoal: Sendable {
    let id, householdId, name: String
    let targetAmountMinorUnits, currentAmountMinorUnits: Int64
    let currencyCode: String
    let targetDate: DateComponents?
    let status: KMPGoalStatus
    let icon, color, accountId: String?
    let createdAt, updatedAt: Date
    let deletedAt: Date?
    let isSynced: Bool
}

enum KMPGoalStatus: String, Sendable, CaseIterable { case active, paused, completed, cancelled }

struct KMPCategory: Sendable {
    let id, householdId, name: String
    let icon, color, parentId: String?
    let isIncome, isSystem: Bool
    let sortOrder: Int32
}

struct KMPBudgetStatus: Sendable {
    let spent, remaining: Int64
    let utilization: Double
    let isOverBudget: Bool
    let periodStart, periodEnd: DateComponents
    let healthLevel: KMPBudgetHealth
}

enum KMPBudgetHealth: String, Sendable { case healthy, warning, over }
enum KMPSyncResult: Sendable {
    case success(changesApplied: Int, mutationsPushed: Int, conflictsResolved: Int, durationMs: Int64)
    case failure(error: KMPSyncError)
}
enum KMPSyncStatus: Sendable {
    case idle, connecting, connected, disconnected
    case syncing(phase: KMPSyncPhase, processedRecords: Int, totalRecords: Int?)
    case error(KMPSyncError)
}
enum KMPSyncPhase: String, Sendable { case pulling, pushing, resolvingConflicts }
enum KMPSyncError: Sendable {
    case networkError(message: String), authError(message: String)
    case conflictError(conflicts: Int), serverError(statusCode: Int, message: String)
    case unknown(cause: String)
    var localizedDescription: String {
        switch self {
        case .networkError(let m): String(localized: "Network error: \(m)")
        case .authError(let m): String(localized: "Auth error: \(m)")
        case .conflictError(let c): String(localized: "\(c) sync conflicts")
        case .serverError(_, let m): String(localized: "Server error: \(m)")
        case .unknown(let c): String(localized: "Unknown: \(c)")
        }
    }
}

// MARK: - Stub Implementations

struct StubFinancialAggregator: KMPFinancialAggregatorProtocol {
    func netWorth(accounts: [KMPAccount]) -> Int64 {
        accounts.filter { $0.deletedAt == nil && !$0.isArchived }.reduce(0) { sum, a in
            switch a.type { case .creditCard, .loan: sum - a.currentBalanceMinorUnits; default: sum + a.currentBalanceMinorUnits }
        }
    }
    func totalSpending(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Int64 {
        transactions.filter { $0.type == .expense && $0.deletedAt == nil && $0.status != .voided && inRange($0.date, from, to) }
            .reduce(0) { $0 + abs($1.amountMinorUnits) }
    }
    func totalIncome(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Int64 {
        transactions.filter { $0.type == .income && $0.deletedAt == nil && $0.status != .voided && inRange($0.date, from, to) }
            .reduce(0) { $0 + abs($1.amountMinorUnits) }
    }
    func netCashFlow(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Int64 {
        totalIncome(transactions: transactions, from: from, to: to) - totalSpending(transactions: transactions, from: from, to: to)
    }
    func spendingByCategory(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> [String: Int64] {
        var r: [String: Int64] = [:]
        for t in transactions where t.type == .expense && t.deletedAt == nil && t.status != .voided && inRange(t.date, from, to) {
            r[t.categoryId ?? "uncategorized", default: 0] += abs(t.amountMinorUnits)
        }
        return r
    }
    func savingsRate(transactions: [KMPTransaction], from: DateComponents, to: DateComponents) -> Double {
        let i = totalIncome(transactions: transactions, from: from, to: to); guard i > 0 else { return 0 }
        return Double(i - totalSpending(transactions: transactions, from: from, to: to)) / Double(i) * 100
    }
    private func inRange(_ d: DateComponents, _ f: DateComponents, _ t: DateComponents) -> Bool {
        guard let dd = Calendar.current.date(from: d), let ff = Calendar.current.date(from: f), let tt = Calendar.current.date(from: t) else { return false }
        return dd >= ff && dd <= tt
    }
}

struct StubBudgetCalculator: KMPBudgetCalculatorProtocol {
    func calculateStatus(budget: KMPBudget, transactions: [KMPTransaction], referenceDate: DateComponents) -> KMPBudgetStatus {
        let s = transactions.filter { $0.type == .expense && $0.deletedAt == nil }.reduce(0 as Int64) { $0 + abs($1.amountMinorUnits) }
        let u = budget.amountMinorUnits > 0 ? Double(s) / Double(budget.amountMinorUnits) : 0
        return KMPBudgetStatus(spent: s, remaining: budget.amountMinorUnits - s, utilization: u,
            isOverBudget: s > budget.amountMinorUnits, periodStart: referenceDate, periodEnd: referenceDate,
            healthLevel: u > 1 ? .over : u > 0.75 ? .warning : .healthy)
    }
    func dailyBudgetRate(budgetAmount: Int64, spent: Int64, daysRemaining: Int) -> Int64 {
        guard daysRemaining > 0, budgetAmount > spent else { return 0 }; return (budgetAmount - spent) / Int64(daysRemaining)
    }
}

struct StubTransactionValidator: KMPTransactionValidatorProtocol {
    func validate(transaction: KMPTransaction, existingAccountIds: Set<String>, existingCategoryIds: Set<String>) -> [String] {
        var e: [String] = []
        if transaction.amountMinorUnits == 0 { e.append(String(localized: "Amount cannot be zero")) }
        if !existingAccountIds.contains(transaction.accountId) { e.append(String(localized: "Account not found")) }
        if let c = transaction.categoryId, !existingCategoryIds.contains(c) { e.append(String(localized: "Category not found")) }
        if transaction.type == .transfer && transaction.transferAccountId == nil { e.append(String(localized: "Transfer needs destination")) }
        return e
    }
}

final class StubCategorizationEngine: KMPCategorizationEngineProtocol, @unchecked Sendable {
    private var rules: [(pattern: String, categoryId: String)] = []
    func suggest(payee: String?) -> String? {
        guard let payee, !payee.isEmpty else { return nil }
        return rules.first { payee.localizedCaseInsensitiveContains($0.pattern) }?.categoryId
    }
    func learnFromHistory(payee: String, categoryId: String) {
        rules.removeAll { $0.pattern.caseInsensitiveCompare(payee) == .orderedSame }
        rules.insert((pattern: payee, categoryId: categoryId), at: 0)
    }
}

struct StubCurrencyFormatter: KMPCurrencyFormatterProtocol {
    private static let sym: [String: String] = ["USD": "$", "EUR": "\u{20AC}", "GBP": "\u{00A3}", "JPY": "\u{00A5}", "CAD": "CA$"]
    private static let zeroDec: Set<String> = ["JPY", "KRW", "VND"]
    func format(amountMinorUnits: Int64, currencyCode: String, showSign: Bool) -> String {
        let s = Self.sym[currencyCode] ?? "\(currencyCode) "; let neg = amountMinorUnits < 0; let a = abs(amountMinorUnits)
        let f = Self.zeroDec.contains(currencyCode) ? "\(a)" : "\(a / 100).\(String(format: "%02d", a % 100))"
        return "\(showSign && !neg && amountMinorUnits != 0 ? "+" : neg ? "-" : "")\(s)\(f)"
    }
    func formatCompact(amountMinorUnits: Int64, currencyCode: String) -> String {
        let s = Self.sym[currencyCode] ?? "\(currencyCode) "; let d = Double(amountMinorUnits) / 100; let a = abs(d)
        let (v, x): (Double, String) = a >= 1_000_000 ? (a/1_000_000, "M") : a >= 1_000 ? (a/1_000, "K") : (a, "")
        return "\(d < 0 ? "-" : "")\(s)\(v == Double(Int64(v)) ? "\(Int64(v))" : String(format: "%.1f", v))\(x)"
    }
}
