// SPDX-License-Identifier: BUSL-1.1
// KMPAccountRepository.swift

import Foundation
import os

struct KMPAccountRepository: AccountRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPAccountRepository")

    func getAccounts() async throws -> [AccountItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackAccounts() }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackAccounts() }
    }

    func getAccount(id: String) async throws -> AccountItem? {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackAccounts().first { $0.id == id } }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackAccounts().first { $0.id == id } }
    }

    func deleteAccount(id: String) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting account via KMP") }
    }

    func deleteAllAccounts() async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting all accounts via KMP") }
    }

    private func fallbackAccounts() async throws -> [AccountItem] { try await MockAccountRepository().getAccounts() }
}