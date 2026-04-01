// SPDX-License-Identifier: BUSL-1.1
// ClipTransactionStore.swift - FinanceClip - Refs #648
import FinanceShared
import Foundation
import os
@Observable
final class ClipTransactionStore: Sendable {
    private static let logger = Logger(subsystem: "com.finance.clip", category: "ClipTransactionStore")
    func save(_ transaction: ClipTransaction) -> Bool {
        let success = ClipTransaction.savePending(transaction)
        if success { Self.logger.info("Saved clip transaction") }
        else { Self.logger.error("Failed to save clip transaction") }
        return success
    }
    func loadPending() -> [ClipTransaction] { ClipTransaction.loadPending() }
    func clearAll() { ClipTransaction.clearPending() }
}
