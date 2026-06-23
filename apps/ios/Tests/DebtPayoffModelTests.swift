// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffModelTests.swift
// FinanceTests
//
// Deterministic unit tests for the pure debt-payoff model (#2175):
// progress math, payoff projection/ETA, amortization & interest saved,
// multi-debt rollup, and edge cases (zero balance, overpayment, zero payment).

import XCTest
import FinanceShared

final class DebtPayoffModelTests: XCTestCase {

    // A fixed UTC Gregorian calendar so date math is reproducible everywhere.
    private var utcCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }

    private func debt(
        original: Int64,
        current: Int64,
        payment: Int64 = 0,
        rateBps: Int = 0
    ) -> DebtPayoffProgress {
        DebtPayoffProgress(
            id: "d", name: "Loan",
            originalPrincipalMinorUnits: original,
            currentBalanceMinorUnits: current,
            monthlyPaymentMinorUnits: payment,
            annualInterestRateBasisPoints: rateBps
        )
    }

    // MARK: - Progress math

    func testFractionCompleteHalfway() {
        let d = debt(original: 40_000_00, current: 20_000_00)
        XCTAssertEqual(d.fractionComplete, 0.5, accuracy: 0.0001)
        XCTAssertEqual(d.percentComplete, 50)
        XCTAssertEqual(d.principalPaidMinorUnits, 20_000_00)
        XCTAssertEqual(d.remainingBalanceMinorUnits, 20_000_00)
        XCTAssertFalse(d.isPaidOff)
    }

    func testPercentCompleteRoundsToNearest() {
        // 1/3 paid -> 33.33% -> rounds to 33
        let d = debt(original: 30_000, current: 20_000)
        XCTAssertEqual(d.percentComplete, 33)
    }

    // MARK: - Zero balance

    func testZeroBalanceIsFullyPaidOff() {
        let d = debt(original: 12_000_00, current: 0)
        XCTAssertTrue(d.isPaidOff)
        XCTAssertEqual(d.fractionComplete, 1.0, accuracy: 0.0001)
        XCTAssertEqual(d.percentComplete, 100)
        XCTAssertEqual(d.remainingBalanceMinorUnits, 0)
        XCTAssertEqual(d.principalPaidMinorUnits, 12_000_00)
    }

    // MARK: - Overpayment

    func testOverpaymentClampsToFullyPaid() {
        // Negative balance == paid more than owed.
        let d = debt(original: 10_000_00, current: -500_00)
        XCTAssertTrue(d.isPaidOff)
        XCTAssertEqual(d.fractionComplete, 1.0, accuracy: 0.0001)
        XCTAssertEqual(d.percentComplete, 100)
        XCTAssertEqual(d.remainingBalanceMinorUnits, 0)
        XCTAssertEqual(d.principalPaidMinorUnits, 10_000_00,
                       "Principal paid never exceeds original principal")
    }

    // MARK: - Balance grew

    func testBalanceAboveOriginalFloorsAtZero() {
        let d = debt(original: 10_000_00, current: 11_000_00)
        XCTAssertEqual(d.fractionComplete, 0.0, accuracy: 0.0001)
        XCTAssertEqual(d.percentComplete, 0)
        XCTAssertEqual(d.principalPaidMinorUnits, 0)
        XCTAssertFalse(d.isPaidOff)
    }

    // MARK: - Zero / negative original principal

    func testZeroOriginalPrincipalWithBalanceIsZeroProgress() {
        let d = debt(original: 0, current: 5_000_00)
        XCTAssertEqual(d.fractionComplete, 0.0, accuracy: 0.0001)
        XCTAssertEqual(d.percentComplete, 0)
        XCTAssertFalse(d.isPaidOff)
    }

    func testZeroOriginalPrincipalNoBalanceIsComplete() {
        let d = debt(original: 0, current: 0)
        XCTAssertEqual(d.fractionComplete, 1.0, accuracy: 0.0001)
        XCTAssertTrue(d.isPaidOff)
    }

    // MARK: - Projection (months)

    func testMonthsToPayoffExactDivision() {
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 1_000_00)
        XCTAssertEqual(d.monthsToPayoff(), 6)
    }

    func testMonthsToPayoffRoundsUp() {
        // 6_500 / 1_000 = 6.5 -> 7 whole months
        let d = debt(original: 12_000_00, current: 6_500_00, payment: 1_000_00)
        XCTAssertEqual(d.monthsToPayoff(), 7)
    }

    func testMonthsToPayoffZeroWhenPaidOff() {
        let d = debt(original: 12_000_00, current: 0, payment: 1_000_00)
        XCTAssertEqual(d.monthsToPayoff(), 0)
    }

    func testMonthsToPayoffNilWhenZeroPayment() {
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 0)
        XCTAssertNil(d.monthsToPayoff(),
                     "A debt is never retired at a zero payment rate")
    }

    func testMonthsToPayoffWithExtraPayment() {
        // 6_000 / (1_000 + 500) = 4 months
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 1_000_00)
        XCTAssertEqual(d.monthsToPayoff(extraMonthlyMinorUnits: 500_00), 4)
    }

    // MARK: - Projection (date)

    func testProjectedPayoffDateAddsMonths() {
        let reference = Date(timeIntervalSince1970: 1_700_000_000) // 2023-11-14 UTC
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 1_000_00)
        let projected = d.projectedPayoffDate(from: reference, calendar: utcCalendar)
        let expected = utcCalendar.date(byAdding: .month, value: 6, to: reference)
        XCTAssertEqual(projected, expected)
    }

    func testProjectedPayoffDateNilWhenNoPayment() {
        let reference = Date(timeIntervalSince1970: 1_700_000_000)
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 0)
        XCTAssertNil(d.projectedPayoffDate(from: reference, calendar: utcCalendar))
    }

    // MARK: - Amortization & interest

    func testAmortizationInterestFreeMatchesPrincipalOnly() {
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 1_000_00, rateBps: 0)
        let summary = d.amortizationSummary()
        XCTAssertEqual(summary?.months, 6)
        XCTAssertEqual(summary?.totalInterestMinorUnits, 0)
    }

    func testAmortizationAccruesInterest() {
        let d = debt(original: 12_000_00, current: 6_000_00, payment: 1_000_00, rateBps: 1_200) // 12% APR
        let summary = d.amortizationSummary()
        XCTAssertNotNil(summary)
        XCTAssertGreaterThan(summary!.totalInterestMinorUnits, 0,
                             "Interest should accrue at a positive APR")
        XCTAssertGreaterThanOrEqual(summary!.months, 6,
                                    "Interest can only extend or hold the term")
    }

    func testAmortizationNilWhenPaymentBelowInterest() {
        // 1% monthly interest on 100_000_00 == 1_000_00; payment under that never clears.
        let d = debt(original: 100_000_00, current: 100_000_00, payment: 500_00, rateBps: 1_200)
        XCTAssertNil(d.amortizationSummary())
    }

    func testAmortizationZeroMonthsWhenPaidOff() {
        let d = debt(original: 12_000_00, current: 0, payment: 1_000_00, rateBps: 600)
        let summary = d.amortizationSummary()
        XCTAssertEqual(summary?.months, 0)
        XCTAssertEqual(summary?.totalInterestMinorUnits, 0)
    }

    func testInterestSavedByPayingExtraIsPositive() {
        let d = debt(original: 40_000_00, current: 20_000_00, payment: 500_00, rateBps: 700)
        let saved = d.interestSavedByPayingExtra(extraMonthlyMinorUnits: 200_00)
        XCTAssertNotNil(saved)
        XCTAssertGreaterThan(saved!, 0,
                             "Paying extra principal should reduce total interest")
    }

    func testInterestSavedNilForZeroExtra() {
        let d = debt(original: 40_000_00, current: 20_000_00, payment: 500_00, rateBps: 700)
        XCTAssertNil(d.interestSavedByPayingExtra(extraMonthlyMinorUnits: 0))
    }

    // MARK: - Milestones

    func testReachedMilestones() {
        let d = debt(original: 40_000_00, current: 12_000_00) // 70% paid
        XCTAssertEqual(d.percentComplete, 70)
        XCTAssertEqual(d.reachedMilestones, [.quarter, .half])
        XCTAssertEqual(d.nextMilestone, .threeQuarters)
    }

    func testAllMilestonesReachedWhenPaidOff() {
        let d = debt(original: 40_000_00, current: 0)
        XCTAssertEqual(d.reachedMilestones, DebtMilestone.allCases)
        XCTAssertNil(d.nextMilestone)
    }

    // MARK: - Portfolio rollup

    func testPortfolioAggregatesProgress() {
        let portfolio = DebtPortfolioProgress(debts: [
            debt(original: 40_000_00, current: 20_000_00, payment: 1_000_00),
            debt(original: 10_000_00, current: 0, payment: 500_00),
        ])
        // Paid: 20_000 + 10_000 = 30_000 of 50_000 = 60%
        XCTAssertEqual(portfolio.totalOriginalPrincipalMinorUnits, 50_000_00)
        XCTAssertEqual(portfolio.totalRemainingBalanceMinorUnits, 20_000_00)
        XCTAssertEqual(portfolio.totalPrincipalPaidMinorUnits, 30_000_00)
        XCTAssertEqual(portfolio.fractionComplete, 0.6, accuracy: 0.0001)
        XCTAssertEqual(portfolio.percentComplete, 60)
        XCTAssertFalse(portfolio.isAllPaidOff)
        XCTAssertEqual(portfolio.totalMonthlyPaymentMinorUnits, 1_500_00)
    }

    func testPortfolioAllPaidOff() {
        let portfolio = DebtPortfolioProgress(debts: [
            debt(original: 40_000_00, current: 0),
            debt(original: 10_000_00, current: -100),
        ])
        XCTAssertTrue(portfolio.isAllPaidOff)
        XCTAssertEqual(portfolio.percentComplete, 100)
    }

    func testPortfolioEmptyIsComplete() {
        let portfolio = DebtPortfolioProgress(debts: [])
        XCTAssertTrue(portfolio.isAllPaidOff)
        XCTAssertEqual(portfolio.fractionComplete, 1.0, accuracy: 0.0001)
    }

    func testPortfolioPayoffDateIsLatestOfDebts() {
        let reference = Date(timeIntervalSince1970: 1_700_000_000)
        let portfolio = DebtPortfolioProgress(debts: [
            debt(original: 12_000_00, current: 3_000_00, payment: 1_000_00),  // 3 months
            debt(original: 12_000_00, current: 6_000_00, payment: 1_000_00),  // 6 months
        ])
        let projected = portfolio.projectedPayoffDate(from: reference, calendar: utcCalendar)
        let expected = utcCalendar.date(byAdding: .month, value: 6, to: reference)
        XCTAssertEqual(projected, expected,
                       "Portfolio clears only when the slowest debt is paid")
    }

    func testPortfolioPayoffDateNilWhenAnyDebtNeverClears() {
        let reference = Date(timeIntervalSince1970: 1_700_000_000)
        let portfolio = DebtPortfolioProgress(debts: [
            debt(original: 12_000_00, current: 3_000_00, payment: 1_000_00),
            debt(original: 12_000_00, current: 6_000_00, payment: 0), // never
        ])
        XCTAssertNil(portfolio.projectedPayoffDate(from: reference, calendar: utcCalendar))
    }

    func testPortfolioPayoffDateIsReferenceWhenAllPaid() {
        let reference = Date(timeIntervalSince1970: 1_700_000_000)
        let portfolio = DebtPortfolioProgress(debts: [
            debt(original: 12_000_00, current: 0, payment: 1_000_00),
        ])
        XCTAssertEqual(portfolio.projectedPayoffDate(from: reference, calendar: utcCalendar), reference)
    }
}
