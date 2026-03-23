// SPDX-License-Identifier: BUSL-1.1
// SharedTransactionModel.swift - FinanceShared - Refs #648
import Foundation
public struct ClipTransaction: Sendable, Hashable, Codable, Identifiable {
    public let id: String
    public let amountMinorUnits: Int64
    public let currencyCode: String
    public let categoryId: String
    public let payee: String
    public let createdAt: Date
    public init(id: String = UUID().uuidString, amountMinorUnits: Int64, currencyCode: String = "USD", categoryId: String, payee: String = "", createdAt: Date = .now) {
        self.id = id; self.amountMinorUnits = amountMinorUnits; self.currencyCode = currencyCode
        self.categoryId = categoryId; self.payee = payee; self.createdAt = createdAt
    }
}
extension ClipTransaction {
    public static func loadPending() -> [ClipTransaction] {
        guard let defaults = SharedConstants.sharedDefaults, let data = defaults.data(forKey: SharedConstants.pendingClipTransactionsKey) else { return [] }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([ClipTransaction].self, from: data)) ?? []
    }
    @discardableResult
    public static func savePending(_ transaction: ClipTransaction) -> Bool {
        guard let defaults = SharedConstants.sharedDefaults else { return false }
        var existing = loadPending(); existing.append(transaction)
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(existing) else { return false }
        defaults.set(data, forKey: SharedConstants.pendingClipTransactionsKey); return true
    }
    public static func clearPending() {
        SharedConstants.sharedDefaults?.removeObject(forKey: SharedConstants.pendingClipTransactionsKey)
    }
}
