// SPDX-License-Identifier: BUSL-1.1

// PreviewRepositories.swift
// Finance
//
// App-target repository doubles used only by SwiftUI previews. Keeping these
// fixtures behind DEBUG prevents preview data and no-op write paths from being
// compiled into production builds, while keeping test-only stubs in Tests/.

#if DEBUG
import Foundation
import SwiftUI

enum PreviewRepositories {
    static let account: any AccountRepository = PreviewAccountRepository()
    static let transaction: any TransactionRepository = PreviewTransactionRepository()
    static let budget: any BudgetRepository = PreviewBudgetRepository()
    static let goal: any GoalRepository = PreviewGoalRepository()
    static let household: any HouseholdRepository = PreviewHouseholdRepository()
}

private enum PreviewRepositoryData {
    static let accounts: [AccountItem] = [
        AccountItem(
            id: "preview-checking",
            name: "Everyday Checking",
            balanceMinorUnits: 425_000,
            currencyCode: "USD",
            type: .checking,
            icon: "building.columns",
            isArchived: false
        ),
        AccountItem(
            id: "preview-savings",
            name: "Rainy Day Fund",
            balanceMinorUnits: 1_250_000,
            currencyCode: "USD",
            type: .savings,
            icon: "banknote",
            isArchived: false
        ),
    ]

    static let transactions: [TransactionItem] = {
        let calendar = Calendar.current
        let today = Date.now

        return [
            TransactionItem(
                id: "preview-transaction-1",
                payee: "Neighborhood Market",
                category: "Groceries",
                accountName: "Everyday Checking",
                amountMinorUnits: -8_540,
                currencyCode: "USD",
                date: calendar.date(byAdding: .month, value: -4, to: today) ?? today,
                type: .expense
            ),
            TransactionItem(
                id: "preview-transaction-2",
                payee: "Payroll",
                category: "Income",
                accountName: "Everyday Checking",
                amountMinorUnits: 425_000,
                currencyCode: "USD",
                date: calendar.date(byAdding: .month, value: -3, to: today) ?? today,
                type: .income
            ),
            TransactionItem(
                id: "preview-transaction-3",
                payee: "Corner Cafe",
                category: "Dining Out",
                accountName: "Everyday Checking",
                amountMinorUnits: -2_375,
                currencyCode: "USD",
                date: calendar.date(byAdding: .month, value: -2, to: today) ?? today,
                type: .expense
            ),
            TransactionItem(
                id: "preview-transaction-4",
                payee: "Neighborhood Market",
                category: "Groceries",
                accountName: "Everyday Checking",
                amountMinorUnits: -9_120,
                currencyCode: "USD",
                date: calendar.date(byAdding: .month, value: -1, to: today) ?? today,
                type: .expense
            ),
            TransactionItem(
                id: "preview-transaction-5",
                payee: "Transit Pass",
                category: "Transport",
                accountName: "Everyday Checking",
                amountMinorUnits: -5_000,
                currencyCode: "USD",
                date: today,
                type: .expense
            ),
        ]
    }()

    static let budgets: [BudgetItem] = [
        BudgetItem(
            id: "preview-budget-groceries",
            name: "Groceries",
            categoryName: "Groceries",
            spentMinorUnits: 32_000,
            limitMinorUnits: 50_000,
            currencyCode: "USD",
            period: "Monthly",
            icon: "cart"
        ),
        BudgetItem(
            id: "preview-budget-dining",
            name: "Dining Out",
            categoryName: "Dining Out",
            spentMinorUnits: 18_000,
            limitMinorUnits: 20_000,
            currencyCode: "USD",
            period: "Monthly",
            icon: "fork.knife"
        ),
    ]

    static let goals: [GoalItem] = [
        GoalItem(
            id: "preview-goal",
            name: "Emergency Fund",
            currentMinorUnits: 750_000,
            targetMinorUnits: 1_000_000,
            currencyCode: "USD",
            targetDate: Calendar.current.date(byAdding: .month, value: 6, to: .now),
            status: .active,
            icon: "shield",
            color: .blue
        ),
    ]

    static let household = HouseholdItem(
        id: "preview-household",
        name: "Preview Household",
        createdAt: Date(timeIntervalSince1970: 1_700_000_000),
        members: [
            HouseholdMember(
                id: "preview-owner",
                displayName: "Preview Owner",
                email: "owner@example.invalid",
                role: .owner,
                status: .active,
                avatarInitials: "PO",
                joinedAt: Date(timeIntervalSince1970: 1_700_000_000)
            ),
            HouseholdMember(
                id: "preview-member",
                displayName: "Preview Member",
                email: "member@example.invalid",
                role: .member,
                status: .active,
                avatarInitials: "PM",
                joinedAt: Date(timeIntervalSince1970: 1_700_086_400)
            ),
        ],
        inviteCode: nil
    )

    static let householdActivity: [HouseholdActivity] = [
        HouseholdActivity(
            id: "preview-activity",
            memberName: "Preview Member",
            action: .transactionCreated,
            description: "Added a household expense",
            timestamp: Date(timeIntervalSince1970: 1_700_172_800),
            amountMinorUnits: 4_200,
            currencyCode: "USD"
        ),
    ]
}

private struct PreviewAccountRepository: AccountRepository {
    func getAccounts() async throws -> [AccountItem] {
        PreviewRepositoryData.accounts.filter { !$0.isArchived }
    }

    func getAllAccounts() async throws -> [AccountItem] {
        PreviewRepositoryData.accounts
    }

    func getAccount(id: String) async throws -> AccountItem? {
        PreviewRepositoryData.accounts.first { $0.id == id }
    }

    func updateAccount(_ account: AccountItem) async throws {}
    func archiveAccount(id: String) async throws {}
    func unarchiveAccount(id: String) async throws {}
    func deleteAccount(id: String) async throws {}
    func deleteAllAccounts() async throws {}
}

private struct PreviewTransactionRepository: TransactionRepository {
    func getTransactions() async throws -> [TransactionItem] {
        PreviewRepositoryData.transactions
    }

    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        let transactions = PreviewRepositoryData.transactions
        let start = min(max(offset, 0), transactions.count)
        let end = min(start + max(limit, 0), transactions.count)
        return Array(transactions[start..<end])
    }

    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        PreviewRepositoryData.transactions
    }

    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        Array(PreviewRepositoryData.transactions.prefix(max(limit, 0)))
    }

    func createTransaction(_ transaction: TransactionItem) async throws {}
    func updateTransaction(_ transaction: TransactionItem) async throws {}
    func deleteTransaction(id: String) async throws {}
    func deleteAllTransactions() async throws {}
    func eraseAllMoodTags() async throws {}
}

private struct PreviewBudgetRepository: BudgetRepository {
    func getBudgets() async throws -> [BudgetItem] {
        PreviewRepositoryData.budgets
    }

    func createBudget(_ budget: BudgetItem) async throws {}
    func updateBudget(_ budget: BudgetItem) async throws {}
    func deleteAllBudgets() async throws {}
}

private struct PreviewGoalRepository: GoalRepository {
    func getGoals() async throws -> [GoalItem] {
        PreviewRepositoryData.goals
    }

    func createGoal(_ goal: GoalItem) async throws {}
    func updateGoal(_ goal: GoalItem) async throws {}
    func deleteAllGoals() async throws {}
}

private struct PreviewHouseholdRepository: HouseholdRepository {
    func getHousehold() async throws -> HouseholdItem? {
        PreviewRepositoryData.household
    }

    func createHousehold(name: String) async throws -> HouseholdItem {
        HouseholdItem(
            id: "preview-household",
            name: name,
            createdAt: .now,
            members: PreviewRepositoryData.household.members,
            inviteCode: nil
        )
    }

    func generateInviteCode(householdId: String) async throws -> String {
        "PREVIEW-CODE"
    }

    func joinHousehold(inviteCode: String) async throws -> HouseholdItem {
        PreviewRepositoryData.household
    }

    func removeMember(householdId: String, memberId: String) async throws {}

    func updateMemberRole(
        householdId: String,
        memberId: String,
        newRole: HouseholdRole
    ) async throws {}

    func leaveHousehold(householdId: String) async throws {}

    func getActivityFeed(
        householdId: String,
        limit: Int
    ) async throws -> [HouseholdActivity] {
        Array(PreviewRepositoryData.householdActivity.prefix(max(limit, 0)))
    }
}
#endif
