// SPDX-License-Identifier: BUSL-1.1
import Foundation
struct CategoryItem: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let colorHex: String
    let iconName: String
    let sortOrder: Int
    let isDefault: Bool
    let createdAt: Date
    let updatedAt: Date
}
struct CreateCategoryInput: Sendable {
    let name: String
    let colorHex: String
    let iconName: String
    let sortOrder: Int
}
struct UpdateCategoryInput: Sendable {
    let name: String?
    let colorHex: String?
    let iconName: String?
    let sortOrder: Int?
}