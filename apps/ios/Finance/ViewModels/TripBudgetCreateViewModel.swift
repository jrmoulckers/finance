// SPDX-License-Identifier: BUSL-1.1

// TripBudgetCreateViewModel.swift
// Finance
//
// Form state and validation for creating or editing a trip/country budget
// (#2205).

import Observation
import Foundation

@Observable
final class TripBudgetCreateViewModel {
    private let editingTrip: TripBudget?

    var isEditing: Bool { editingTrip != nil }

    // MARK: - Form fields

    var name = ""
    var country = ""
    var currencyCode = CurrencyPreferences.displayCurrencyCode()
    var amountText = ""
    var startDate = Date()
    var endDate = Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date()
    var matchTag = ""

    // MARK: - State

    var showingValidationError = false
    var validationMessage = ""

    let availableCurrencyCodes = CurrencyPreferences.supportedCurrencyCodes

    var currencySymbol: String { CurrencyPreferences.symbol(for: currencyCode) }

    var navigationTitle: String {
        isEditing ? String(localized: "Edit Trip Budget") : String(localized: "New Trip Budget")
    }

    var saveButtonTitle: String {
        isEditing ? String(localized: "Update") : String(localized: "Save")
    }

    var amountMinorUnits: Int64 { Int64((Double(amountText) ?? 0) * 100) }

    init(trip: TripBudget? = nil) {
        self.editingTrip = trip
        if let trip {
            name = trip.name
            country = trip.country
            currencyCode = trip.currencyCode
            amountText = String(format: "%.2f", Double(trip.limitMinorUnits) / 100.0)
            startDate = trip.startDate
            endDate = trip.endDate
            matchTag = trip.matchTag
        }
    }

    /// Builds a validated `TripBudget`, or `nil` when input is invalid.
    func buildTrip() -> TripBudget? {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            fail(String(localized: "Please enter a trip name."))
            return nil
        }
        guard amountMinorUnits > 0 else {
            fail(String(localized: "Please enter a budget amount greater than zero."))
            return nil
        }
        guard endDate >= startDate else {
            fail(String(localized: "The end date must be on or after the start date."))
            return nil
        }

        return TripBudget(
            id: editingTrip?.id ?? UUID().uuidString,
            name: trimmedName,
            country: country.trimmingCharacters(in: .whitespacesAndNewlines),
            currencyCode: currencyCode,
            limitMinorUnits: amountMinorUnits,
            startDate: startDate,
            endDate: endDate,
            matchTag: matchTag.trimmingCharacters(in: .whitespacesAndNewlines),
            isArchived: editingTrip?.isArchived ?? false
        )
    }

    private func fail(_ message: String) {
        validationMessage = message
        showingValidationError = true
    }
}
