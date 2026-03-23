// SPDX-License-Identifier: BUSL-1.1
// KMPTypeAdapters.swift — Bidirectional type conversion between KMP and Swift UI models.
import Foundation


enum KMPDateConversion {
    static func dateFromEpochMs(_ epochMs: Int64) -> Date { Date(timeIntervalSince1970: TimeInterval(epochMs) / 1_000.0) }
    static func epochMsFromDate(_ date: Date) -> Int64 { Int64(date.timeIntervalSince1970 * 1_000.0) }
    static func dateComponents(year: Int, month: Int, day: Int) -> DateComponents { DateComponents(year: year, month: month, day: day) }
    static func dateFromComponents(_ dc: DateComponents) -> Date { Calendar.current.date(from: dc) ?? .now }
    static func componentsFromDate(_ date: Date) -> DateComponents { Calendar.current.dateComponents([.year, .month, .day], from: date) }
}

extension TransactionItem {
    static func fromKMP(_ k: KMPTransaction, accountName: String, categoryName: String) -> TransactionItem {
        TransactionItem(id: k.id, payee: k.payee ?? "", category: categoryName, accountName: accountName,
            amountMinorUnits: k.amountMinorUnits, currencyCode: k.currencyCode,
            date: Calendar.current.date(from: k.date) ?? .now,
            type: TransactionTypeUI.fromKMP(k.type), status: TransactionStatusUI.fromKMP(k.status))
    }
    func toKMP(householdId: String, accountId: String, categoryId: String?) -> KMPTransaction {
        KMPTransaction(id: id, householdId: householdId, accountId: accountId, categoryId: categoryId,
            type: type.toKMP(), status: status.toKMP(), amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode, payee: payee.isEmpty ? nil : payee, note: nil,
            date: Calendar.current.dateComponents([.year, .month, .day], from: date),
            transferAccountId: nil, isRecurring: false, tags: [],
            createdAt: .now, updatedAt: .now, deletedAt: nil, isSynced: false)
    }
}

extension TransactionTypeUI {
    static func fromKMP(_ t: KMPTransactionType) -> Self { switch t { case .expense: .expense; case .income: .income; case .transfer: .transfer } }
    func toKMP() -> KMPTransactionType { switch self { case .expense: .expense; case .income: .income; case .transfer: .transfer } }
}

extension TransactionStatusUI {
    static func fromKMP(_ s: KMPTransactionStatus) -> Self { switch s { case .pending: .pending; case .cleared: .cleared; case .reconciled: .reconciled; case .voided: .voided } }
    func toKMP() -> KMPTransactionStatus { switch self { case .pending: .pending; case .cleared: .cleared; case .reconciled: .reconciled; case .voided: .voided } }
}

extension AccountItem {
    static func fromKMP(_ k: KMPAccount) -> AccountItem {
        AccountItem(id: k.id, name: k.name, balanceMinorUnits: k.currentBalanceMinorUnits,
            currencyCode: k.currencyCode, type: AccountTypeUI.fromKMP(k.type),
            icon: k.icon ?? AccountTypeUI.fromKMP(k.type).systemImage, isArchived: k.isArchived)
    }
    func toKMP(householdId: String) -> KMPAccount {
        KMPAccount(id: id, householdId: householdId, name: name, type: type.toKMP(),
            currencyCode: currencyCode, currentBalanceMinorUnits: balanceMinorUnits,
            isArchived: isArchived, sortOrder: 0, icon: icon, color: nil,
            createdAt: .now, updatedAt: .now, deletedAt: nil, isSynced: false)
    }
}

extension AccountTypeUI {
    static func fromKMP(_ t: KMPAccountType) -> Self {
        switch t { case .checking: .checking; case .savings: .savings; case .creditCard: .creditCard
        case .cash: .cash; case .investment: .investment; case .loan: .loan; case .other: .other }
    }
    func toKMP() -> KMPAccountType {
        switch self { case .checking: .checking; case .savings: .savings; case .creditCard: .creditCard
        case .cash: .cash; case .investment: .investment; case .loan: .loan; case .other: .other }
    }
}

extension BudgetItem {
    static func fromKMP(_ k: KMPBudget, status: KMPBudgetStatus, categoryName: String) -> BudgetItem {
        BudgetItem(id: k.id, name: k.name, categoryName: categoryName,
            spentMinorUnits: status.spent, limitMinorUnits: k.amountMinorUnits,
            currencyCode: k.currencyCode, period: k.period.displayName,
            icon: categoryName.lowercased().contains("grocer") ? "cart" : "chart.pie")
    }
}

extension KMPBudgetPeriod {
    var displayName: String {
        switch self { case .weekly: String(localized: "Weekly"); case .biweekly: String(localized: "Biweekly")
        case .monthly: String(localized: "Monthly"); case .quarterly: String(localized: "Quarterly"); case .yearly: String(localized: "Yearly") }
    }
}

extension GoalItem {
    static func fromKMP(_ k: KMPGoal) -> GoalItem {
        GoalItem(id: k.id, name: k.name, currentMinorUnits: k.currentAmountMinorUnits,
            targetMinorUnits: k.targetAmountMinorUnits, currencyCode: k.currencyCode,
            targetDate: k.targetDate.flatMap { Calendar.current.date(from: $0) },
            status: GoalStatusUI.fromKMP(k.status), icon: k.icon ?? "target",
            color: GoalStatusUI.fromKMP(k.status).color)
    }
    func toKMP(householdId: String) -> KMPGoal {
        KMPGoal(id: id, householdId: householdId, name: name,
            targetAmountMinorUnits: targetMinorUnits, currentAmountMinorUnits: currentMinorUnits,
            currencyCode: currencyCode,
            targetDate: targetDate.map { Calendar.current.dateComponents([.year, .month, .day], from: $0) },
            status: status.toKMP(), icon: icon, color: nil, accountId: nil,
            createdAt: .now, updatedAt: .now, deletedAt: nil, isSynced: false)
    }
}

extension GoalStatusUI {
    static func fromKMP(_ s: KMPGoalStatus) -> Self { switch s { case .active: .active; case .paused: .paused; case .completed: .completed; case .cancelled: .cancelled } }
    func toKMP() -> KMPGoalStatus { switch self { case .active: .active; case .paused: .paused; case .completed: .completed; case .cancelled: .cancelled } }
}

extension DateComponents {
    static func fromKMPLocalDate(year: Int, month: Int, day: Int) -> DateComponents { DateComponents(year: year, month: month, day: day) }
    static func startOfCurrentMonth() -> DateComponents { Calendar.current.dateComponents([.year, .month], from: Calendar.current.startOfDay(for: .now)) }
    static func endOfCurrentMonth() -> DateComponents {
        let c = Calendar.current; let now = Date.now
        guard let r = c.range(of: .day, in: .month, for: now), let y = c.dateComponents([.year], from: now).year, let m = c.dateComponents([.month], from: now).month
        else { return DateComponents(year: 2025, month: 1, day: 31) }
        return DateComponents(year: y, month: m, day: r.upperBound - 1)
    }
}
