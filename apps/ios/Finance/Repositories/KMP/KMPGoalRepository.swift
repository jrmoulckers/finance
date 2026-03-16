// SPDX-License-Identifier: BUSL-1.1

// KMPGoalRepository.swift
// Finance
//
// KMP-bridged implementation of GoalRepository. When the FinanceCore
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

/// KMP-bridged goal repository that reads from the shared SQLDelight
/// database via Swift Export when running on Apple platforms.
///
/// ## Integration checklist
/// 1. Build `FinanceCore.xcframework` via `./gradlew :packages:core:linkReleaseFrameworkIosArm64`
/// 2. Embed the framework in Xcode → Frameworks, Libraries, and Embedded Content
/// 3. Remove the `#else` fallback branch once KMP calls are verified
struct KMPGoalRepository: GoalRepository {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPGoalRepository"
    )

    // MARK: - KMP Bridge

    #if canImport(FinanceCore)
    // TODO: Accept the KMP repository/use-case from the DI graph
    // private let kmpGoalService: FinanceCore.GoalService
    //
    // init(kmpGoalService: FinanceCore.GoalService) {
    //     self.kmpGoalService = kmpGoalService
    // }
    #endif

    // MARK: - GoalRepository

    func getGoals() async throws -> [GoalItem] {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpGoals = try await kmpGoalService.getGoals()
        // return kmpGoals.map { kmpGoal in
        //     GoalItem(
        //         id: kmpGoal.id,
        //         name: kmpGoal.name,
        //         currentMinorUnits: Int64(kmpGoal.currentMinorUnits),
        //         targetMinorUnits: Int64(kmpGoal.targetMinorUnits),
        //         currencyCode: kmpGoal.currencyCode,
        //         targetDate: kmpGoal.targetDate.map { Date(timeIntervalSince1970: $0) },
        //         status: GoalStatus(kmpStatus: kmpGoal.status),
        //         icon: kmpGoal.icon,
        //         color: Color(kmpColor: kmpGoal.color)
        //     )
        // }
        Self.logger.info("Loading goals via KMP bridge")
        return try await fallbackGoals()
        #else
        Self.logger.debug("FinanceCore not available — using mock goals")
        return try await fallbackGoals()
        #endif
    }

    // MARK: - Fallback

    /// Returns mock data when the KMP framework is unavailable.
    private func fallbackGoals() async throws -> [GoalItem] {
        try await MockGoalRepository().getGoals()
    }
}
