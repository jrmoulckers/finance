// SPDX-License-Identifier: BUSL-1.1

// ModelTests.swift
// FinanceTests
//
// Tests for model computed properties — BudgetItem progress/color,
// GoalItem progress/completion, TransactionItem helpers, AccountGroup totals,
// and enum display properties.

import XCTest
import SwiftUI
@testable import FinanceApp

final class ModelTests: XCTestCase {

    // MARK: - BudgetItem: progress

    func testBudgetItemProgressUnderBudget() {
        let budget = BudgetItem(
            id: "b1", name: "Groceries", categoryName: "Groceries",
            spentMinorUnits: 250_00, limitMinorUnits: 500_00,
            currencyCode: "USD", period: "Monthly", icon: "cart"
        )

        XCTAssertEqual(budget.progress, 0.5, accuracy: 0.001,
                       "250/500 should yield 50% progress")
    }

    func testBudgetItemProgressOverBudget() {
        let budget = BudgetItem(
            id: "b1", name: "Entertainment", categoryName: "Entertainment",
            spentMinorUnits: 250_00, limitMinorUnits: 200_00,
            currencyCode: "USD", period: "Monthly", icon: "film"
        )

        XCTAssertEqual(budget.progress, 1.25, accuracy: 0.001,
                       "250/200 should yield 125% progress")
    }

    func testBudgetItemProgressZeroLimit() {
        let budget = BudgetItem(
            id: "b1", name: "Empty", categoryName: "Empty",
            spentMinorUnits: 100_00, limitMinorUnits: 0,
            currencyCode: "USD", period: "Monthly", icon: "questionmark"
        )

        XCTAssertEqual(budget.progress, 0,
                       "Progress should be 0 when limit is 0 (avoid division by zero)")
    }

    // MARK: - BudgetItem: progressColor thresholds

    func testBudgetItemProgressColorGreen() {
        let budget = BudgetItem(
            id: "b1", name: "Low", categoryName: "Low",
            spentMinorUnits: 100_00, limitMinorUnits: 500_00,
            currencyCode: "USD", period: "Monthly", icon: "cart"
        )

        XCTAssertEqual(budget.progressColor, .green,
                       "Under 75% utilization should show green")
    }

    func testBudgetItemProgressColorOrange() {
        let budget = BudgetItem(
            id: "b1", name: "High", categoryName: "High",
            spentMinorUnits: 400_00, limitMinorUnits: 500_00,
            currencyCode: "USD", period: "Monthly", icon: "cart"
        )

        XCTAssertEqual(budget.progressColor, .orange,
                       "75–99% utilization should show orange")
    }

    func testBudgetItemProgressColorOrangeAtExactly75() {
        let budget = BudgetItem(
            id: "b1", name: "Threshold", categoryName: "Threshold",
            spentMinorUnits: 75, limitMinorUnits: 100,
            currencyCode: "USD", period: "Monthly", icon: "cart"
        )

        XCTAssertEqual(budget.progressColor, .orange,
                       "Exactly 75% should show orange")
    }

    func testBudgetItemProgressColorRed() {
        let budget = SampleData.overBudget

        XCTAssertEqual(budget.progressColor, .red,
                       "100%+ utilization should show red")
    }

    // MARK: - BudgetItem: statusText

    func testBudgetItemStatusTextOnTrack() {
        XCTAssertEqual(SampleData.groceriesBudget.statusText,
                       String(localized: "On track"),
                       "Under-budget items should show 'On track'")
    }

    func testBudgetItemStatusTextOverBudget() {
        XCTAssertEqual(SampleData.overBudget.statusText,
                       String(localized: "Over budget"),
                       "Over-budget items should show 'Over budget'")
    }

    // MARK: - BudgetItem: remainingMinorUnits

    func testBudgetItemRemainingMinorUnits() {
        // limit 500_00 - spent 320_00 = 180_00
        XCTAssertEqual(SampleData.groceriesBudget.remainingMinorUnits, 180_00,
                       "Remaining should be limit minus spent")
    }

    func testBudgetItemRemainingNegativeWhenOverBudget() {
        // limit 200_00 - spent 210_00 = -10_00
        XCTAssertEqual(SampleData.overBudget.remainingMinorUnits, -10_00,
                       "Remaining should be negative when over budget")
    }

    // MARK: - GoalItem: progress

    func testGoalItemProgress() {
        // 7_500_00 / 10_000_00 = 0.75
        XCTAssertEqual(SampleData.activeGoal.progress, 0.75, accuracy: 0.001,
                       "Active goal should be 75% complete")
    }

    func testGoalItemProgressWhenComplete() {
        // 2_000_00 / 2_000_00 = 1.0
        XCTAssertEqual(SampleData.completedGoal.progress, 1.0, accuracy: 0.001,
                       "Completed goal should be 100%")
    }

    func testGoalItemProgressWhenZeroTarget() {
        let goal = GoalItem(
            id: "g0", name: "Empty",
            currentMinorUnits: 100_00, targetMinorUnits: 0,
            currencyCode: "USD", targetDate: nil,
            status: .active, icon: "target", color: .gray
        )

        XCTAssertEqual(goal.progress, 0,
                       "Progress should be 0 when target is 0 (avoid division by zero)")
    }

    // MARK: - GoalItem: isComplete

    func testGoalItemIsCompleteWhenMeetsTarget() {
        XCTAssertTrue(SampleData.completedGoal.isComplete,
                      "Goal where current >= target should be complete")
    }

    func testGoalItemIsNotCompleteWhenBelowTarget() {
        XCTAssertFalse(SampleData.activeGoal.isComplete,
                       "Goal where current < target should not be complete")
    }

    // MARK: - GoalItem: remainingMinorUnits

    func testGoalItemRemainingMinorUnits() {
        // 10_000_00 - 7_500_00 = 2_500_00
        XCTAssertEqual(SampleData.activeGoal.remainingMinorUnits, 2_500_00,
                       "Remaining should be target minus current")
    }

    func testGoalItemRemainingMinorUnitsWhenComplete() {
        XCTAssertEqual(SampleData.completedGoal.remainingMinorUnits, 0,
                       "Remaining should be 0 (clamped) when current >= target")
    }

    // MARK: - TransactionItem: isExpense

    func testTransactionItemIsExpenseForExpenseType() {
        XCTAssertTrue(SampleData.expenseTransaction.isExpense,
                      "Expense-type transaction should return true for isExpense")
    }

    func testTransactionItemIsNotExpenseForIncomeType() {
        XCTAssertFalse(SampleData.incomeTransaction.isExpense,
                       "Income-type transaction should return false for isExpense")
    }

    func testTransactionItemIsNotExpenseForTransferType() {
        XCTAssertFalse(SampleData.transferTransaction.isExpense,
                       "Transfer-type transaction should return false for isExpense")
    }

    // MARK: - AccountGroup: totalBalance

    func testAccountGroupTotalBalance() {
        let group = AccountGroup(
            id: "savings",
            type: .savings,
            accounts: [SampleData.savingsAccount, SampleData.emergencyFundAccount]
        )

        // 25_000_00 + 10_000_00 = 35_000_00
        XCTAssertEqual(group.totalBalance, 35_000_00,
                       "Total balance should sum all account balances in the group")
    }

    func testAccountGroupTotalBalanceWithNegative() {
        let group = AccountGroup(
            id: "mixed",
            type: .other,
            accounts: [SampleData.checkingAccount, SampleData.creditCardAccount]
        )

        // 12_450_00 + (-1_200_00) = 11_250_00
        XCTAssertEqual(group.totalBalance, 11_250_00,
                       "Total balance should handle negative balances correctly")
    }

    // MARK: - AccountTypeUI: display properties

    func testAccountTypeUIDisplayNames() {
        XCTAssertEqual(AccountTypeUI.checking.displayName, String(localized: "Checking"))
        XCTAssertEqual(AccountTypeUI.savings.displayName, String(localized: "Savings"))
        XCTAssertEqual(AccountTypeUI.creditCard.displayName, String(localized: "Credit Cards"))
        XCTAssertEqual(AccountTypeUI.investment.displayName, String(localized: "Investments"))
        XCTAssertEqual(AccountTypeUI.loan.displayName, String(localized: "Loans"))
        XCTAssertEqual(AccountTypeUI.cash.displayName, String(localized: "Cash"))
        XCTAssertEqual(AccountTypeUI.other.displayName, String(localized: "Other"))
    }

    func testAccountTypeUISystemImages() {
        XCTAssertEqual(AccountTypeUI.checking.systemImage, "building.columns")
        XCTAssertEqual(AccountTypeUI.savings.systemImage, "banknote")
        XCTAssertEqual(AccountTypeUI.creditCard.systemImage, "creditcard")
        XCTAssertEqual(AccountTypeUI.investment.systemImage, "chart.line.uptrend.xyaxis")
        XCTAssertEqual(AccountTypeUI.cash.systemImage, "dollarsign.circle")
    }

    // MARK: - GoalStatusUI: display properties

    func testGoalStatusDisplayNames() {
        XCTAssertEqual(GoalStatusUI.active.displayName, String(localized: "Active"))
        XCTAssertEqual(GoalStatusUI.paused.displayName, String(localized: "Paused"))
        XCTAssertEqual(GoalStatusUI.completed.displayName, String(localized: "Completed"))
        XCTAssertEqual(GoalStatusUI.cancelled.displayName, String(localized: "Cancelled"))
    }

    func testGoalStatusSystemImages() {
        XCTAssertEqual(GoalStatusUI.active.systemImage, "flame")
        XCTAssertEqual(GoalStatusUI.completed.systemImage, "checkmark.circle.fill")
        XCTAssertEqual(GoalStatusUI.paused.systemImage, "pause.circle")
        XCTAssertEqual(GoalStatusUI.cancelled.systemImage, "xmark.circle")
    }

    // MARK: - TransactionTypeUI: display properties

    func testTransactionTypeDisplayNames() {
        XCTAssertEqual(TransactionTypeUI.expense.displayName, String(localized: "Expense"))
        XCTAssertEqual(TransactionTypeUI.income.displayName, String(localized: "Income"))
        XCTAssertEqual(TransactionTypeUI.transfer.displayName, String(localized: "Transfer"))
    }

    func testTransactionTypeSystemImages() {
        XCTAssertEqual(TransactionTypeUI.expense.systemImage, "arrow.up.right")
        XCTAssertEqual(TransactionTypeUI.income.systemImage, "arrow.down.left")
        XCTAssertEqual(TransactionTypeUI.transfer.systemImage, "arrow.left.arrow.right")
    }

    // MARK: - TransactionStatusUI: display properties

    func testTransactionStatusDisplayNames() {
        XCTAssertEqual(TransactionStatusUI.pending.displayName, String(localized: "Pending"))
        XCTAssertEqual(TransactionStatusUI.cleared.displayName, String(localized: "Cleared"))
        XCTAssertEqual(TransactionStatusUI.reconciled.displayName, String(localized: "Reconciled"))
        XCTAssertEqual(TransactionStatusUI.voided.displayName, String(localized: "Void"))
    }

    // MARK: - PickerOption

    func testPickerOptionProperties() {
        let option = PickerOption(id: "p1", name: "Test Option", icon: "star")

        XCTAssertEqual(option.id, "p1")
        XCTAssertEqual(option.name, "Test Option")
        XCTAssertEqual(option.icon, "star")
    }
}
