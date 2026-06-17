// SPDX-License-Identifier: BUSL-1.1

import SwiftUI
import XCTest
@testable import FinanceApp

final class IconViewTests: XCTestCase {
    func testIconViewRendersBothIOSPacks() {
        _ = IconView(.home, size: 24, packId: IconPackID.sfSymbols.id).body
        _ = IconView(.home, size: 24, packId: IconPackID.standardLucide.id).body
    }

    func testEveryIconTokenHasBothMappings() {
        let tokens = Set(IconToken.allCases)

        XCTAssertEqual(Set(SFSymbolsMapping.mapping.keys), tokens)
        XCTAssertEqual(Set(LucideMapping.mapping.keys), tokens)
    }

    func testKnownMappingsMirrorSharedFoundation() {
        XCTAssertEqual(sfSymbolFor(.dashboard), "gauge.with.dots.needle.67percent")
        XCTAssertEqual(sfSymbolFor(.transactions), "list.bullet.rectangle")
        XCTAssertEqual(lucideNameFor(.dashboard), "layout-dashboard")
        XCTAssertEqual(lucideNameFor(.transactions), "receipt-text")
    }

    func testIconPackPreferenceKeyMatchesFoundation() {
        XCTAssertEqual(IconPackPreference.key, "icon_pack_id")
    }
}
