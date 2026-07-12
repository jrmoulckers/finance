// SPDX-License-Identifier: BUSL-1.1
// FamilyBudgetTemplateTests.swift — FinanceTests — Refs #2201

import XCTest
@testable import FinanceShared

final class FamilyBudgetTemplateTests: XCTestCase {

    func testKidCategoriesCoverRequestedBuckets() {
        let names = Set(FamilyBudgetTemplates.kidCategories.map(\.name))
        XCTAssertTrue(names.contains("School"))
        XCTAssertTrue(names.contains("Childcare"))
        XCTAssertTrue(names.contains("Activities & Sports"))
        XCTAssertTrue(names.contains("Birthdays & Parties"))
        XCTAssertTrue(names.contains("Field Trips"))
        XCTAssertTrue(names.contains("Kids' Clothing"))
    }

    func testAllKidCategoriesFlaggedKidRelated() {
        XCTAssertTrue(FamilyBudgetTemplates.kidCategories.allSatisfy(\.isKidRelated))
    }

    func testSingleParentTemplateIncludesEssentialsAndKids() {
        let template = FamilyBudgetTemplates.singleParent
        XCTAssertFalse(template.kidCategories.isEmpty)
        XCTAssertTrue(template.categories.contains { $0.name == "Groceries" })
        XCTAssertTrue(template.categories.contains { $0.name == "Housing" })
        // Kid categories should be a strict subset of all categories.
        XCTAssertEqual(template.kidCategories.count, FamilyBudgetTemplates.kidCategories.count)
    }

    func testTemplateIdsAreUniqueAndCategoryIdsUniqueWithinTemplate() {
        let ids = FamilyBudgetTemplates.all.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count)

        for template in FamilyBudgetTemplates.all {
            let categoryIds = template.categories.map(\.id)
            XCTAssertEqual(Set(categoryIds).count, categoryIds.count, "Duplicate category id in \(template.name)")
        }
    }

    func testAllTemplatesExposed() {
        XCTAssertEqual(FamilyBudgetTemplates.all.count, 2)
    }

    func testSupportiveCoachingIsNonJudgmental() {
        let overBody = SupportiveCoaching.overPlanBody(category: "Groceries")
        XCTAssertTrue(overBody.contains("Groceries"))
        // Tone check: avoids blame-heavy words.
        let lowered = overBody.lowercased()
        XCTAssertFalse(lowered.contains("exceeded"))
        XCTAssertFalse(lowered.contains("over budget"))

        XCTAssertTrue(SupportiveCoaching.overPlanTitle(category: "School").contains("School"))
        XCTAssertTrue(SupportiveCoaching.billDueSoon(name: "Rent", whenText: "Friday").contains("Rent"))
        XCTAssertFalse(SupportiveCoaching.familySetupWelcome.isEmpty)
    }
}
