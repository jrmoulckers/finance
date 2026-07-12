// SPDX-License-Identifier: BUSL-1.1

// ExpectedIncomeView.swift
// Finance
//
// Expected-income tracking (#2193) for single parents relying on late or
// unreliable child support (plus freelance, reimbursements, tips). Keeps
// uncertain money out of "cleared" cash and shows an honest cleared / expected /
// at-risk split so planning reflects reality, not wishful thinking.

import FinanceShared
import SwiftUI

struct ExpectedIncomeView: View {
    @State private var store: ExpectedIncomeStore
    @State private var showingEditor = false
    @State private var editingIncome: ExpectedIncome?

    private let referenceDate: Date

    init(store: ExpectedIncomeStore = ExpectedIncomeStore(), referenceDate: Date = Date()) {
        _store = State(initialValue: store)
        self.referenceDate = referenceDate
    }

    private var breakdown: CashBreakdown { store.breakdown(asOf: referenceDate) }
    private var overdue: [ExpectedIncome] { store.overdue(asOf: referenceDate) }

    var body: some View {
        ScrollView {
            VStack(spacing: FinanceSpacing.lg) {
                breakdownCard
                if !overdue.isEmpty {
                    overdueSection
                }
                incomeListSection
            }
            .padding()
            .padding(.bottom, FinanceSpacing.lg)
        }
        .navigationTitle(String(localized: "Expected Income"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editingIncome = nil
                    showingEditor = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(String(localized: "Add expected income"))
                .accessibilityHint(String(localized: "Track money you're expecting but haven't received"))
            }
        }
        .sheet(isPresented: $showingEditor) {
            ExpectedIncomeEditorSheet(
                store: store,
                existing: editingIncome,
                referenceDate: referenceDate
            )
        }
    }

    // MARK: - Breakdown

    private var breakdownCard: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.md) {
            Text(String(localized: "Your cash, honestly"))
                .font(.headline)

            bucketRow(
                title: String(localized: "Cleared"),
                subtitle: String(localized: "In your accounts now"),
                amount: breakdown.clearedMinorUnits,
                color: FinanceColors.statusPositive,
                symbol: "checkmark.circle.fill"
            )
            bucketRow(
                title: String(localized: "Expected"),
                subtitle: String(localized: "Dependable, on the way"),
                amount: breakdown.expectedMinorUnits,
                color: FinanceColors.statusInfo,
                symbol: "clock.fill"
            )
            bucketRow(
                title: String(localized: "At risk"),
                subtitle: String(localized: "Late or unreliable — don't count on it yet"),
                amount: breakdown.atRiskMinorUnits,
                color: FinanceColors.statusWarning,
                symbol: "exclamationmark.circle.fill"
            )

            Divider()

            HStack {
                Text(String(localized: "Safe to plan on"))
                    .font(.subheadline.weight(.semibold))
                Spacer()
                CurrencyLabel(
                    amountInMinorUnits: breakdown.plannableMinorUnits,
                    currencyCode: store.currencyCode,
                    showSign: false,
                    font: .headline
                )
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Safe to plan on"))
            .accessibilityValue(CurrencyLabel.formatted(minorUnits: breakdown.plannableMinorUnits, currencyCode: store.currencyCode))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
    }

    private func bucketRow(title: String, subtitle: String, amount: Int64, color: Color, symbol: String) -> some View {
        HStack(spacing: FinanceSpacing.sm) {
            Image(systemName: symbol)
                .foregroundStyle(color)
                .font(.title3)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.medium))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            CurrencyLabel(
                amountInMinorUnits: amount,
                currencyCode: store.currencyCode,
                showSign: false,
                font: .callout.bold()
            )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityValue(String(localized: "\(CurrencyLabel.formatted(minorUnits: amount, currencyCode: store.currencyCode)). \(subtitle)"))
    }

    // MARK: - Overdue

    private var overdueSection: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Label(String(localized: "Running late"), systemImage: "bell.badge")
                .font(.headline)
                .foregroundStyle(FinanceColors.statusWarning)
                .accessibilityAddTraits(.isHeader)

            ForEach(overdue) { income in
                Text(SupportiveCoaching.billDueSoon(name: income.source, whenText: relativeText(income.expectedDate)))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(FinanceColors.statusWarning.opacity(0.1), in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.xl))
    }

    // MARK: - List

    @ViewBuilder
    private var incomeListSection: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Text(String(localized: "Tracked income"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if store.items.isEmpty {
                EmptyStateView(
                    systemImage: "tray",
                    title: String(localized: "Nothing tracked yet"),
                    message: String(localized: "Add child support, a freelance invoice, or a reimbursement to see it here — without pretending it's already arrived."),
                    actionLabel: String(localized: "Add expected income"),
                    action: {
                        editingIncome = nil
                        showingEditor = true
                    }
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(store.items) { income in
                        incomeRow(income)
                        if income.id != store.items.last?.id {
                            Divider()
                        }
                    }
                }
                .padding()
                .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
            }
        }
    }

    private func incomeRow(_ income: ExpectedIncome) -> some View {
        Button {
            editingIncome = income
            showingEditor = true
        } label: {
            HStack(spacing: FinanceSpacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(income.source)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    HStack(spacing: FinanceSpacing.xs) {
                        statusBadge(income)
                        Text(income.expectedDate.formatted(.dateTime.month().day()))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    CurrencyLabel(
                        amountInMinorUnits: income.amountMinorUnits,
                        currencyCode: store.currencyCode,
                        showSign: false,
                        font: .callout.bold()
                    )
                    Text(reliabilityText(income.reliability))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, FinanceSpacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(income.source)
        .accessibilityValue(String(localized: "\(CurrencyLabel.formatted(minorUnits: income.amountMinorUnits, currencyCode: store.currencyCode)), \(statusText(income.status)), \(reliabilityText(income.reliability))"))
        .accessibilityHint(String(localized: "Opens details to update status"))
    }

    private func statusBadge(_ income: ExpectedIncome) -> some View {
        Text(statusText(income.status))
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(statusColor(income.status).opacity(0.15), in: Capsule())
            .foregroundStyle(statusColor(income.status))
    }

    private func statusColor(_ status: ExpectedIncomeStatus) -> Color {
        switch status {
        case .received: return FinanceColors.statusPositive
        case .expected: return FinanceColors.statusInfo
        case .partial: return FinanceColors.statusInfo
        case .late: return FinanceColors.statusWarning
        case .missed: return FinanceColors.statusNegative
        }
    }

    private func statusText(_ status: ExpectedIncomeStatus) -> String {
        switch status {
        case .expected: return String(localized: "Expected")
        case .received: return String(localized: "Received")
        case .late: return String(localized: "Late")
        case .partial: return String(localized: "Partial")
        case .missed: return String(localized: "Missed")
        }
    }

    private func reliabilityText(_ reliability: IncomeReliability) -> String {
        switch reliability {
        case .reliable: return String(localized: "Reliable")
        case .usuallyOnTime: return String(localized: "Usually on time")
        case .unreliable: return String(localized: "Unreliable")
        }
    }

    private func relativeText(_ date: Date) -> String {
        date.formatted(.relative(presentation: .named))
    }
}

// MARK: - Editor Sheet

/// Add or edit a single expected deposit, including quick status updates.
struct ExpectedIncomeEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let store: ExpectedIncomeStore

    let existing: ExpectedIncome?
    let referenceDate: Date

    @State private var source: String = ""
    @State private var amountText: String = ""
    @State private var receivedText: String = ""
    @State private var expectedDate: Date = Date()
    @State private var reliability: IncomeReliability = .usuallyOnTime
    @State private var status: ExpectedIncomeStatus = .expected

    init(store: ExpectedIncomeStore, existing: ExpectedIncome?, referenceDate: Date) {
        self.store = store
        self.existing = existing
        self.referenceDate = referenceDate
        _expectedDate = State(initialValue: existing?.expectedDate ?? referenceDate)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: "Source (e.g. Child support)"), text: $source)
                        .accessibilityLabel(String(localized: "Income source"))
                    amountField(label: String(localized: "Amount expected"), text: $amountText)
                    DatePicker(
                        String(localized: "Expected date"),
                        selection: $expectedDate,
                        displayedComponents: .date
                    )
                }

                Section {
                    Picker(String(localized: "How reliable?"), selection: $reliability) {
                        ForEach(IncomeReliability.allCases, id: \.self) { level in
                            Text(reliabilityText(level)).tag(level)
                        }
                    }
                } footer: {
                    Text(String(localized: "Unreliable income is kept out of what's safe to plan on until it clears."))
                }

                Section {
                    Picker(String(localized: "Status"), selection: $status) {
                        ForEach(ExpectedIncomeStatus.allCases, id: \.self) { value in
                            Text(statusText(value)).tag(value)
                        }
                    }
                    if status == .partial {
                        amountField(label: String(localized: "Received so far"), text: $receivedText)
                    }
                }

                if existing != nil {
                    Section {
                        Button(role: .destructive) {
                            if let id = existing?.id { store.remove(id: id) }
                            dismiss()
                        } label: {
                            Text(String(localized: "Remove"))
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .navigationTitle(existing == nil
                ? String(localized: "Add income")
                : String(localized: "Edit income"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Save")) {
                        save()
                        dismiss()
                    }
                    .disabled(source.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
            }
            .onAppear(perform: load)
        }
    }

    private func amountField(label: String, text: Binding<String>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField(String(localized: "0.00"), text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 140)
                .accessibilityLabel(label)
        }
    }

    private func load() {
        guard let existing else { return }
        source = existing.source
        amountText = Self.majorString(existing.amountMinorUnits)
        receivedText = Self.majorString(existing.receivedMinorUnits)
        expectedDate = existing.expectedDate
        reliability = existing.reliability
        status = existing.status
    }

    private func save() {
        let amount = GroceryModeView.minorUnits(from: amountText, currencyCode: store.currencyCode)
        let received = status == .partial
            ? GroceryModeView.minorUnits(from: receivedText, currencyCode: store.currencyCode)
            : (status == .received ? amount : 0)
        let income = ExpectedIncome(
            id: existing?.id ?? UUID().uuidString,
            source: source.trimmingCharacters(in: .whitespaces),
            amountMinorUnits: amount,
            receivedMinorUnits: received,
            expectedDate: expectedDate,
            reliability: reliability,
            status: status
        )
        if existing == nil {
            store.add(income)
        } else {
            store.update(income)
        }
    }

    private func reliabilityText(_ reliability: IncomeReliability) -> String {
        switch reliability {
        case .reliable: return String(localized: "Reliable")
        case .usuallyOnTime: return String(localized: "Usually on time")
        case .unreliable: return String(localized: "Unreliable")
        }
    }

    private func statusText(_ status: ExpectedIncomeStatus) -> String {
        switch status {
        case .expected: return String(localized: "Expected")
        case .received: return String(localized: "Received")
        case .late: return String(localized: "Late")
        case .partial: return String(localized: "Partial")
        case .missed: return String(localized: "Missed")
        }
    }

    private static func majorString(_ minorUnits: Int64) -> String {
        guard minorUnits > 0 else { return "" }
        let value = NSDecimalNumber(value: minorUnits).dividing(by: NSDecimalNumber(value: 100))
        return value.stringValue
    }
}

#Preview {
    NavigationStack {
        ExpectedIncomeView()
    }
}
