// SPDX-License-Identifier: BUSL-1.1
// FamilyBudgetTemplate.swift - FinanceShared - Refs #2201
//
// Pure, dependency-free family/single-parent starter templates and supportive
// coaching copy. Kids create frequent, irregular spending — school fees,
// childcare, sports, birthday parties, field trips — that generic default
// categories miss. This gives iOS onboarding a family-aware starting point and a
// calm, non-judgmental coaching voice.
//
// Colours are CSS-style hex so the app layer can map them straight onto
// CategoryItem without a shared SwiftUI dependency.

import Foundation

/// A single starter category proposed by a family template.
public struct StarterCategory: Sendable, Hashable, Codable, Identifiable {
    public let id: String
    public let name: String
    public let colorHex: String
    /// SF Symbol name for the category icon.
    public let icon: String
    /// Whether this is a kid/caregiver-specific bucket (used for emphasis).
    public let isKidRelated: Bool

    public init(id: String, name: String, colorHex: String, icon: String, isKidRelated: Bool = false) {
        self.id = id
        self.name = name
        self.colorHex = colorHex
        self.icon = icon
        self.isKidRelated = isKidRelated
    }
}

/// A named starter template a user can adopt instead of building from scratch.
public struct FamilyBudgetTemplate: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    /// Warm, plain-language description of who the template is for.
    public let summary: String
    public let categories: [StarterCategory]

    public init(id: String, name: String, summary: String, categories: [StarterCategory]) {
        self.id = id
        self.name = name
        self.summary = summary
        self.categories = categories
    }

    /// Kid-specific buckets within the template.
    public var kidCategories: [StarterCategory] {
        categories.filter(\.isKidRelated)
    }
}

/// The catalog of family-aware starter templates for iOS setup.
public enum FamilyBudgetTemplates {

    /// Core kid-specific categories requested in #2201.
    public static let kidCategories: [StarterCategory] = [
        StarterCategory(id: "kid-school", name: "School", colorHex: "#3182CE", icon: "graduationcap", isKidRelated: true),
        StarterCategory(id: "kid-childcare", name: "Childcare", colorHex: "#805AD5", icon: "figure.and.child.holdinghands", isKidRelated: true),
        StarterCategory(id: "kid-activities", name: "Activities & Sports", colorHex: "#38A169", icon: "figure.run", isKidRelated: true),
        StarterCategory(id: "kid-birthdays", name: "Birthdays & Parties", colorHex: "#D53F8C", icon: "gift", isKidRelated: true),
        StarterCategory(id: "kid-fieldtrips", name: "Field Trips", colorHex: "#DD6B20", icon: "bus", isKidRelated: true),
        StarterCategory(id: "kid-clothing", name: "Kids' Clothing", colorHex: "#00B5D8", icon: "tshirt", isKidRelated: true),
    ]

    /// Everyday essentials shared across the family templates.
    private static let essentials: [StarterCategory] = [
        StarterCategory(id: "cat-groceries", name: "Groceries", colorHex: "#38A169", icon: "cart"),
        StarterCategory(id: "cat-housing", name: "Housing", colorHex: "#5A67D8", icon: "house"),
        StarterCategory(id: "cat-utilities", name: "Utilities", colorHex: "#D69E2E", icon: "bolt"),
        StarterCategory(id: "cat-transport", name: "Transport", colorHex: "#3182CE", icon: "car"),
        StarterCategory(id: "cat-health", name: "Health", colorHex: "#E53E3E", icon: "cross.case"),
    ]

    /// A single-parent template: essentials plus the full kid bucket set.
    public static let singleParent = FamilyBudgetTemplate(
        id: "template-single-parent",
        name: "Single-Parent Budget",
        summary: "Built for one income and a busy household. Includes the everyday essentials plus the kid costs that don't fit a tidy monthly rhythm.",
        categories: essentials + kidCategories
    )

    /// A broader family template (two caregivers) with the same kid buckets.
    public static let family = FamilyBudgetTemplate(
        id: "template-family",
        name: "Family Budget",
        summary: "A family-aware starting point that already knows about school, childcare, activities, and the occasional birthday party.",
        categories: essentials + kidCategories
    )

    /// All templates offered in setup, in display order.
    public static let all: [FamilyBudgetTemplate] = [singleParent, family]
}

/// Calm, factual, next-step-oriented coaching copy per the content-language
/// guidelines — framing like "past plan" and "want to adjust this category?"
/// instead of blame-heavy alerts. Centralised so the tone stays consistent.
public enum SupportiveCoaching {

    /// A gentle heading for a category that has passed its plan.
    public static func overPlanTitle(category: String) -> String {
        "\(category): past your plan"
    }

    /// Body copy for an over-plan category — no shame, one clear next step.
    public static func overPlanBody(category: String) -> String {
        "You've gone a little past your \(category) plan this period. Want to adjust this category, or move a little from another one?"
    }

    /// Heading when a category is getting close to its plan.
    public static func nearPlanTitle(category: String) -> String {
        "\(category): getting close"
    }

    /// Body copy when approaching a plan limit.
    public static func nearPlanBody(category: String) -> String {
        "You're near your \(category) plan for this period. You've still got room — just something to keep in mind."
    }

    /// A supportive bill-due-soon reminder (vs. high-pressure "Overdue").
    public static func billDueSoon(name: String, whenText: String) -> String {
        "\(name) is due \(whenText). No rush — just a heads-up so it doesn't sneak up on you."
    }

    /// A warm affirmation surfaced during family setup.
    public static let familySetupWelcome =
        "Money's tight for a lot of families, and that's okay. Let's set this up to reflect your real life — kids and all."
}
