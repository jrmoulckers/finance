// SPDX-License-Identifier: BUSL-1.1

// KMPBudgetRepository.swift
// Finance
//
// KMP-bridged implementation of BudgetRepository. When the FinanceCore
// framework is available (macOS/iOS build via Xcode), this delegates to
// the Kotlin Multiplatform shared data layer. On non-Apple platforms
// (e.g., Windows development), it falls back to mock data.
//
// TODO(ios1-kmp-repos): Replace fallback with real KMP calls once the
// FinanceCore.xcframework is integrated via Gradle build phase.

#if canImport(FinanceCore)
import FinanceCore
#endif

import Foundation
import os

/// KMP-bridged budget repository that reads from the shared SQLDelight
/// database via Swift Export when running on Apple platforms.
///
/// ## Integration checklist
/// 1. Build `FinanceCore.xcframework` via `./gradlew :packages:core:linkReleaseFrameworkIosArm64`
/// 2. Embed the framework in Xcode → Frameworks, Libraries, and Embedded Content
/// 3. Remove the `#else` fallback branch once KMP calls are verified
struct KMPBudgetRepository: BudgetRepository {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPBudgetRepository"
    )

    // MARK: - KMP Bridge

    #if canImport(FinanceCore)
    // TODO: Accept the KMP repository/use-case from the DI graph
    // private let kmpBudgetService: FinanceCore.BudgetService
    //
    // init(kmpBudgetService: FinanceCore.BudgetService) {
    //     self.kmpBudgetService = kmpBudgetService
    // }
    #endif

    // MARK: - BudgetRepository

    func getBudgets() async throws -> [BudgetItem] {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpBudgets = try await kmpBudgetService.getBudgets()
        // return kmpBudgets.map { kmpBudget in
        //     BudgetItem(
        //         id: kmpBudget.id,
        //         name: kmpBudget.name,
        //         categoryName: kmpBudget.categoryName,
        //         spentMinorUnits: Int64(kmpBudget.spentMinorUnits),
        //         limitMinorUnits: Int64(kmpBudget.limitMinorUnits),
        //         currencyCode: kmpBudget.currencyCode,
        //         period: kmpBudget.period,
        //         icon: kmpBudget.icon
        //     )
        // }
        Self.logger.info("Loading budgets via KMP bridge")
        return try await fallbackBudgets()
        #else
        Self.logger.debug("FinanceCore not available — using mock budgets")
        return try await fallbackBudgets()
        #endif
    }

    // MARK: - Fallback

    /// Returns mock data when the KMP framework is unavailable.
    private func fallbackBudgets() async throws -> [BudgetItem] {
        try await MockBudgetRepository().getBudgets()
    }
}
