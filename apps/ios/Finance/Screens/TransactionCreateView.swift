// TransactionCreateView.swift
// Finance
//
// Multi-step sheet for creating a new transaction.

import SwiftUI

// MARK: - View Model

@Observable
@MainActor
final class TransactionCreateViewModel {
    var currentStep: Step = .type

    enum Step: Int, CaseIterable {
        case type = 0, details = 1, review = 2
        var title: String {
            switch self {
            case .type: String(localized: "Type")
            case .details: String(localized: "Details")
            case .review: String(localized: "Review")
            }
        }
    }

    var transactionType: TransactionType = .expense
    var amountText = ""
    var payee = ""
    var selectedAccountId: String?
    var selectedCategoryId: String?
    var date = Date()
    var note = ""
    var currencyCode = "USD"
    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""

    enum TransactionType: String, CaseIterable {
        case expense, income, transfer
        var displayName: String {
            switch self {
            case .expense: String(localized: "Expense")
            case .income: String(localized: "Income")
            case .transfer: String(localized: "Transfer")
            }
        }
        var systemImage: String {
            switch self {
            case .expense: "arrow.up.right"
            case .income: "arrow.down.left"
            case .transfer: "arrow.left.arrow.right"
            }
        }
        var color: Color {
            switch self {
            case .expense: .red
            case .income: .green
            case .transfer: .blue
            }
        }
    }

    struct PickerOption: Identifiable {
        let id: String
        let name: String
        let icon: String
    }

    var accounts: [PickerOption] = [
        PickerOption(id: "a1", name: "Main Checking", icon: "building.columns"),
        PickerOption(id: "a2", name: "Savings", icon: "banknote"),
        PickerOption(id: "a3", name: "Travel Card", icon: "creditcard"),
    ]

    var categories: [PickerOption] = [
        PickerOption(id: "c1", name: "Groceries", icon: "cart"),
        PickerOption(id: "c2", name: "Dining Out", icon: "fork.knife"),
        PickerOption(id: "c3", name: "Transport", icon: "car"),
        PickerOption(id: "c4", name: "Entertainment", icon: "film"),
        PickerOption(id: "c5", name: "Shopping", icon: "bag"),
        PickerOption(id: "c6", name: "Income", icon: "dollarsign.circle"),
    ]

    var canAdvance: Bool {
        switch currentStep {
        case .type: true
        case .details: !amountText.isEmpty && selectedAccountId != nil && !payee.isEmpty
        case .review: true
        }
    }

    var amountMinorUnits: Int64 { Int64((Double(amountText) ?? 0) * 100) }

    func advance() {
        guard let next = Step(rawValue: currentStep.rawValue + 1) else { return }
        currentStep = next
    }

    func goBack() {
        guard let prev = Step(rawValue: currentStep.rawValue - 1) else { return }
        currentStep = prev
    }

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }
        // TODO: Replace with KMP shared logic
        try? await Task.sleep(for: .milliseconds(500))
        return true
    }

    private func validate() -> Bool {
        if amountText.isEmpty || (Double(amountText) ?? 0) <= 0 {
            validationMessage = String(localized: "Please enter a valid amount.")
            showingValidationError = true
            return false
        }
        if payee.isEmpty {
            validationMessage = String(localized: "Please enter a payee.")
            showingValidationError = true
            return false
        }
        if selectedAccountId == nil {
            validationMessage = String(localized: "Please select an account.")
            showingValidationError = true
            return false
        }
        return true
    }
}

// MARK: - View

struct TransactionCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = TransactionCreateViewModel()

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
            .navigationTitle(String(localized: "New Transaction"))
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
                ForEach(TransactionCreateViewModel.TransactionType.allCases, id: \.rawValue) { type in
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
                    else { Text(String(localized: "Save Transaction")).frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent).disabled(viewModel.isSaving)
                .accessibilityLabel(String(localized: "Save Transaction"))
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

#Preview { TransactionCreateView() }
