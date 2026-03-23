// SPDX-License-Identifier: BUSL-1.1
// SharedConstants.swift - FinanceShared - Refs #648
import Foundation
public enum SharedConstants {
    public static let appGroupIdentifier = "group.com.finance.app"
    public static var sharedDefaults: UserDefaults? { UserDefaults(suiteName: appGroupIdentifier) }
    public static let pendingClipTransactionsKey = "pendingClipTransactions"
    public static let universalLinkHost = "finance.app"
    public static let clipExpensePath = "/clip/expense"
}
public struct TransactionCategory: Sendable, Hashable, Codable, Identifiable {
    public let id: String
    public let displayName: String
    public let systemImage: String
    public init(id: String, displayName: String, systemImage: String) {
        self.id = id; self.displayName = displayName; self.systemImage = systemImage
    }
}
extension TransactionCategory {
    public static let quickCategories: [TransactionCategory] = [
        .init(id: "food", displayName: String(localized: "Food"), systemImage: "fork.knife"),
        .init(id: "transport", displayName: String(localized: "Transport"), systemImage: "car.fill"),
        .init(id: "shopping", displayName: String(localized: "Shopping"), systemImage: "bag.fill"),
        .init(id: "entertainment", displayName: String(localized: "Entertainment"), systemImage: "film.fill"),
        .init(id: "health", displayName: String(localized: "Health"), systemImage: "heart.fill"),
        .init(id: "bills", displayName: String(localized: "Bills"), systemImage: "doc.text.fill"),
        .init(id: "groceries", displayName: String(localized: "Groceries"), systemImage: "cart.fill"),
        .init(id: "other", displayName: String(localized: "Other"), systemImage: "ellipsis.circle.fill"),
    ]
}
