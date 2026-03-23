// SPDX-License-Identifier: BUSL-1.1

// KMPAccountRepository.swift
// Finance
//
// KMP-bridged implementation of AccountRepository. When the FinanceCore
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

/// KMP-bridged account repository that reads from the shared SQLDelight
/// database via Swift Export when running on Apple platforms.
///
/// ## Integration checklist
/// 1. Build `FinanceCore.xcframework` via `./gradlew :packages:core:linkReleaseFrameworkIosArm64`
/// 2. Embed the framework in Xcode → Frameworks, Libraries, and Embedded Content
/// 3. Remove the `#else` fallback branch once KMP calls are verified
struct KMPAccountRepository: AccountRepository {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPAccountRepository"
    )

    // MARK: - KMP Bridge

    #if canImport(FinanceCore)
    // TODO: Accept the KMP repository/use-case from the DI graph
    // private let kmpAccountService: FinanceCore.AccountService
    //
    // init(kmpAccountService: FinanceCore.AccountService) {
    //     self.kmpAccountService = kmpAccountService
    // }
    #endif

    // MARK: - AccountRepository

    func getAccounts() async throws -> [AccountItem] {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpAccounts = try await kmpAccountService.getAccounts()
        // return kmpAccounts.map { kmpAccount in
        //     AccountItem(
        //         id: kmpAccount.id,
        //         name: kmpAccount.name,
        //         balanceMinorUnits: Int64(kmpAccount.balanceMinorUnits),
        //         currencyCode: kmpAccount.currencyCode,
        //         type: AccountTypeUI(kmpType: kmpAccount.type),
        //         icon: kmpAccount.icon,
        //         isArchived: kmpAccount.isArchived
        //     )
        // }
        Self.logger.info("Loading accounts via KMP bridge")
        return try await fallbackAccounts()
        #else
        Self.logger.debug("FinanceCore not available — using mock accounts")
        return try await fallbackAccounts()
        #endif
    }

    func getAccount(id: String) async throws -> AccountItem? {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // guard let kmpAccount = try await kmpAccountService.getAccount(id: id) else {
        //     return nil
        // }
        // return AccountItem(from: kmpAccount)
        Self.logger.info("Loading account \(id, privacy: .private) via KMP bridge")
        return try await fallbackAccounts().first { $0.id == id }
        #else
        Self.logger.debug("FinanceCore not available — using mock account lookup")
        return try await fallbackAccounts().first { $0.id == id }
        #endif
    }

    func deleteAccount(id: String) async throws {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // try await kmpAccountService.deleteAccount(id: id)
        Self.logger.info("Deleting account \(id, privacy: .private) via KMP bridge")
        #else
        Self.logger.debug("FinanceCore not available — delete is a no-op")
        #endif
    }

    // MARK: - Fallback

    /// Returns mock data when the KMP framework is unavailable or during
    /// initial integration before the bridge is fully wired.
    private func fallbackAccounts() async throws -> [AccountItem] {
        try await MockAccountRepository().getAccounts()
    }
}
