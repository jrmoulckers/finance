// SPDX-License-Identifier: BUSL-1.1

// TripBudgetCreateView.swift
// Finance
//
// Form for creating or editing a trip/country budget (#2205).

import SwiftUI

struct TripBudgetCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TripBudgetCreateViewModel

    /// Called with the validated trip when the user saves.
    private let onSave: (TripBudget) -> Void

    init(viewModel: TripBudgetCreateViewModel, onSave: @escaping (TripBudget) -> Void) {
        _viewModel = State(initialValue: viewModel)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                detailsSection
                amountSection
                datesSection
                filterSection
            }
            .navigationTitle(viewModel.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(viewModel.saveButtonTitle) {
                        if let trip = viewModel.buildTrip() {
                            onSave(trip)
                            dismiss()
                        }
                    }
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.validationMessage)
            }
        }
    }

    private var detailsSection: some View {
        Section {
            TextField(String(localized: "Trip name (e.g. Bangkok Jan–Mar)"), text: $viewModel.name)
                .accessibilityLabel(String(localized: "Trip name"))
            TextField(String(localized: "Country or region"), text: $viewModel.country)
                .accessibilityLabel(String(localized: "Country or region"))
        } header: {
            Text(String(localized: "Trip"))
        }
    }

    private var amountSection: some View {
        Section {
            HStack {
                Text(viewModel.currencySymbol)
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField(String(localized: "0.00"), text: $viewModel.amountText)
                    .font(.title2)
                    .keyboardType(.decimalPad)
                    .accessibilityLabel(String(localized: "Trip budget amount"))
                    .accessibilityHint(String(localized: "Enter the trip limit in \(viewModel.currencyCode)"))
            }
            Picker(String(localized: "Currency"), selection: $viewModel.currencyCode) {
                ForEach(viewModel.availableCurrencyCodes, id: \.self) { code in
                    Text(CurrencyPreferences.pickerLabel(for: code)).tag(code)
                }
            }
            .pickerStyle(.menu)
            .accessibilityLabel(String(localized: "Trip currency"))
        } header: {
            Text(String(localized: "Budget"))
        } footer: {
            Text(String(localized: "Budget in the local currency; totals roll up into your display currency on the dashboard."))
        }
    }

    private var datesSection: some View {
        Section {
            DatePicker(String(localized: "Start"), selection: $viewModel.startDate, displayedComponents: .date)
                .accessibilityLabel(String(localized: "Trip start date"))
            DatePicker(String(localized: "End"), selection: $viewModel.endDate, displayedComponents: .date)
                .accessibilityLabel(String(localized: "Trip end date"))
        } header: {
            Text(String(localized: "Dates"))
        }
    }

    private var filterSection: some View {
        Section {
            TextField(String(localized: "Match tag (optional)"), text: $viewModel.matchTag)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .accessibilityLabel(String(localized: "Match tag"))
        } header: {
            Text(String(localized: "Filter"))
        } footer: {
            Text(String(localized: "When set, only transactions carrying this tag count toward the trip. Otherwise all spend within the date range is included."))
        }
    }
}

#Preview {
    TripBudgetCreateView(viewModel: TripBudgetCreateViewModel()) { _ in }
}
