// SPDX-License-Identifier: BUSL-1.1

// TransactionCreateView.swift
// Finance
//
// Multi-step sheet for creating a new transaction.

import SwiftUI

// MARK: - View

struct TransactionCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TransactionCreateViewModel

    init(viewModel: TransactionCreateViewModel = TransactionCreateViewModel(
        transactionRepository: MockTransactionRepository(),
        accountRepository: MockAccountRepository()
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                stepIndicator.padding(.horizontal).padding(.top, 8)
                Divider().padding(.top, 12)
                Group {
                    switch viewModel.currentStep {
                    case .type: typeStep
                    case .details: detailsStep
                    case .review: reviewStep
                    }
                }
                .frame(maxHeight: .infinity)
                bottomBar
            }
            .navigationTitle(viewModel.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the transaction form without saving"))
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.validationMessage)
            }
            .task { await viewModel.loadData() }
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: 0) {
            ForEach(TransactionCreateViewModel.Step.allCases, id: \.rawValue) { step in
                VStack(spacing: 4) {
                    Circle()
                        .fill(step.rawValue <= viewModel.currentStep.rawValue ? Color.blue : Color.gray.opacity(0.3))
                        .frame(width: 12, height: 12)
                        .overlay {
                            if step.rawValue < viewModel.currentStep.rawValue {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 7, weight: .bold)).foregroundStyle(.white)
                            }
                        }
                    Text(step.title).font(.caption2)
                        .foregroundStyle(step.rawValue <= viewModel.currentStep.rawValue ? .primary : .secondary)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Step \(step.rawValue + 1): \(step.title)"))
                .accessibilityValue(step == viewModel.currentStep ? String(localized: "Current step") : "")

                if step.rawValue < TransactionCreateViewModel.Step.allCases.count - 1 {
                    Rectangle()
                        .fill(step.rawValue < viewModel.currentStep.rawValue ? Color.blue : Color.gray.opacity(0.3))
                        .frame(height: 2).padding(.bottom, 16)
                }
            }
        }
    }

    // MARK: - Step 1: Type

    private var typeStep: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text(String(localized: "What type of transaction?"))
                    .font(.title3).fontWeight(.semibold).padding(.top, 24)
                ForEach(TransactionTypeUI.allCases, id: \.rawValue) { type in
                    Button {
                        viewModel.transactionType = type
                    } label: {
                        HStack(spacing: 16) {
                            Image(systemName: type.systemImage)
                                .font(.title3).foregroundStyle(type.color)
                                .frame(width: 44, height: 44)
                                .background(type.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                            Text(type.displayName).font(.body).foregroundStyle(.primary)
                            Spacer()
                            if viewModel.transactionType == type {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue).font(.title3)
                            }
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(viewModel.transactionType == type ? Color.blue : Color.gray.opacity(0.2),
                                        lineWidth: viewModel.transactionType == type ? 2 : 1)
                        )
                    }
                    .accessibilityLabel(type.displayName)
                    .accessibilityValue(viewModel.transactionType == type ? String(localized: "Selected") : "")
                    .accessibilityHint(String(localized: "Selects \(type.displayName) as the transaction type"))
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Step 2: Details

    private var detailsStep: some View {
        Form {
            Section(String(localized: "Amount")) {
                HStack {
                    Text(currencySymbol).font(.title2).foregroundStyle(.secondary)
                    TextField(String(localized: "0.00"), text: $viewModel.amountText)
                        .font(.title2).keyboardType(.decimalPad)
                        .accessibilityLabel(String(localized: "Transaction amount"))
                        .accessibilityHint(String(localized: "Enter the amount in dollars"))
                }
            }
            Section(String(localized: "Payee")) {
                TextField(String(localized: "Who was this payment to?"), text: $viewModel.payee)
                    .accessibilityLabel(String(localized: "Payee name"))
            }
            Section(String(localized: "Account")) {
                Picker(String(localized: "Account"), selection: $viewModel.selectedAccountId) {
                    Text(String(localized: "Select Account")).tag(nil as String?)
                    ForEach(viewModel.accounts) { account in
                        Label(account.name, systemImage: account.icon).tag(account.id as String?)
                    }
                }
                .accessibilityLabel(String(localized: "Account"))
            }
            Section(String(localized: "Category")) {
                Picker(String(localized: "Category"), selection: $viewModel.selectedCategoryId) {
                    Text(String(localized: "Select Category")).tag(nil as String?)
                    ForEach(viewModel.categories) { category in
                        Label(category.name, systemImage: category.icon).tag(category.id as String?)
                    }
                }
                .accessibilityLabel(String(localized: "Category"))
            }
            Section(String(localized: "Date")) {
                DatePicker(String(localized: "Date"), selection: $viewModel.date, displayedComponents: .date)
                    .accessibilityLabel(String(localized: "Transaction date"))
            }
            Section(String(localized: "Note (optional)")) {
                TextField(String(localized: "Add a note..."), text: $viewModel.note, axis: .vertical)
                    .lineLimit(3)
                    .accessibilityLabel(String(localized: "Note"))
            }
        }
    }

    // MARK: - Step 3: Review

    private var reviewStep: some View {
        Form {
            Section(String(localized: "Transaction Summary")) {
                LabeledContent(String(localized: "Type")) {
                    Label(viewModel.transactionType.displayName, systemImage: viewModel.transactionType.systemImage)
                }
                LabeledContent(String(localized: "Amount")) {
                    CurrencyLabel(amountInMinorUnits: viewModel.amountMinorUnits, currencyCode: viewModel.currencyCode, showSign: false, font: .body.bold())
                }
                LabeledContent(String(localized: "Payee")) { Text(viewModel.payee) }
                if let accountId = viewModel.selectedAccountId,
                   let account = viewModel.accounts.first(where: { $0.id == accountId }) {
                    LabeledContent(String(localized: "Account")) { Text(account.name) }
                }
                if let categoryId = viewModel.selectedCategoryId,
                   let category = viewModel.categories.first(where: { $0.id == categoryId }) {
                    LabeledContent(String(localized: "Category")) { Text(category.name) }
                }
                LabeledContent(String(localized: "Date")) { Text(viewModel.date, style: .date) }
                if !viewModel.note.isEmpty {
                    LabeledContent(String(localized: "Note")) { Text(viewModel.note).foregroundStyle(.secondary) }
                }
            }
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack(spacing: 12) {
            if viewModel.currentStep != .type {
                Button { viewModel.goBack() } label: {
                    Text(String(localized: "Back")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "Back"))
                .accessibilityHint(String(localized: "Goes to the previous step"))
            }
            if viewModel.currentStep == .review {
                Button {
                    Task { if await viewModel.save() { dismiss() } }
                } label: {
                    if viewModel.isSaving { ProgressView().frame(maxWidth: .infinity) }
                    else { Text(viewModel.saveButtonTitle).frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent).disabled(viewModel.isSaving)
                .accessibilityLabel(viewModel.saveButtonTitle)
                .accessibilityHint(String(localized: "Saves the transaction and closes the form"))
            } else {
                Button { viewModel.advance() } label: {
                    Text(String(localized: "Next")).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).disabled(!viewModel.canAdvance)
                .accessibilityLabel(String(localized: "Next"))
                .accessibilityHint(String(localized: "Advances to the next step"))
            }
        }
        .padding()
    }

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = viewModel.currencyCode
        return formatter.currencySymbol ?? "$"
    }
}

#Preview {
    TransactionCreateView(viewModel: TransactionCreateViewModel(
        transactionRepository: MockTransactionRepository(),
        accountRepository: MockAccountRepository()
    ))
}
