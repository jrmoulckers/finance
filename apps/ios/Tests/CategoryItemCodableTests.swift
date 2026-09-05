// SPDX-License-Identifier: BUSL-1.1

import Foundation
import XCTest
@testable import FinanceApp

final class CategoryItemCodableTests: XCTestCase {
    func testRoundTripPreservesAllPersistedFields() throws {
        let category = CategoryItem(
            id: "protected",
            name: "Protected",
            colorHex: "#3182CE",
            icon: "lock",
            sortOrder: 3,
            isBiometricProtected: true
        )

        let encoded = try JSONEncoder().encode(category)
        let decoded = try JSONDecoder().decode(CategoryItem.self, from: encoded)

        XCTAssertEqual(decoded, category)
    }

    func testLegacyCategoryDefaultsBiometricProtectionToFalse() throws {
        let legacyJSON = Data(
            """
            {
              "id": "legacy",
              "name": "Legacy",
              "colorHex": "#3182CE",
              "icon": "tag",
              "sortOrder": 1
            }
            """.utf8
        )

        let decoded = try JSONDecoder().decode(
            CategoryItem.self,
            from: legacyJSON
        )

        XCTAssertFalse(decoded.isBiometricProtected)
    }
}
