// SPDX-License-Identifier: BUSL-1.1

// GroceryModeView.swift
// Finance
//
// Grocery-store mode (#2199): a fast, supportive "can I afford this?" answer
// before checkout. Type the cart total, get an instant comfortable / tight /
// beyond verdict against the cash that's safe to spend before the next payday.
// Framed calmly — never a red-alert — per the content-language guidelines.

import FinanceShared
import SwiftUI

struct GroceryModeView: View {
    @State private var store: GroceryModeStore
    @State private var paydayStore: PaydaySettingsStore
    @State private var purchaseText: String = ""
    @State private var showingSetup = false
    @FocusState private var amountFocused: Bool

    private let referenceDate: Date

    init(
        store: GroceryModeStore = GroceryModeStore(),
        paydayStore: PaydaySettingsStore = PaydaySettingsStore(),
        referenceDate: Date = Date()
    ) {
        _store = State(initialValue: store)
        _paydayStore = State(initialValue: paydayStore)
        self.referenceDate = referenceDate
    }

    private var nextPayday: Date {
        paydayStore.nextPayday(from: referenceDate)
            ?? Calendar.current.date(byAdding: .day, value: 14, to: referenceDate) ?? referenceDate
    }

    private var result: SafeToSpendResult {
        store.result(nextPayday: nextPayday, referenceDate: referenceDate)
    }

    private var purchaseMinorUnits: Int64 {
        Self.minorUnits(from: purchaseText, currencyCode: store.currencyCode)
    }

    private var verdict: AffordabilityVerdict {
        SafeToSpendCalculator.verdict(
            purchaseMinorUnits: purchaseMinorUnits,
            spendableMinorUnits: result.spendableForCheckMinorUnits
        )
    }

    var body: some View {
        ScrollView {
            VStack(spacing: FinanceSpacing.lg) {
                safeToSpendCard
                purchaseEntryCard
                if purchaseMinorUnits > 0 {
                    verdictCard
                }
            }
            .padding()
            .padding(.bottom, FinanceSpacing.lg)
        }
        .navigationTitle(String(localized: "Can I afford this?"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingSetup = true } label: {
                    Image(systemName: "slider.horizontal.3")
                }
                .accessibilityLabel(String(localized: "Adjust amounts"))
                .accessibilityHint(String(localized: "Set your cash on hand and bills due before payday"))
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(String(localized: "Done")) { amountFocused = false }
            }
        }
        .sheet(isPresented: $showingSetup) {
            GroceryModeSetupSheet(store: store, paydayStore: paydayStore)
        }
    }

    // MARK: - Safe to spend

    private var safeToSpendCard: some View {
        VStack(spacing: FinanceSpacing.xs) {
            Text(String(localized: "Safe to spend"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            CurrencyLabel(
                amountInMinorUnits: result.spendableForCheckMinorUnits,
                currencyCode: store.currencyCode,
                showSign: false,
                font: .system(size: 44, weight: .bold, design: .rounded)
            )
            .monospacedDigit()
            .minimumScaleFactor(0.5)
            .lineLimit(1)

            if let pinned = result.pinnedCategoryName {
                Text(String(localized: "left in \(pinned) this period"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if result.daysUntilPayday > 0 {
                Text(String(localized: "to last the \(result.daysUntilPayday) days until payday"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if result.reservedForBillsMinorUnits > 0 {
                Text(String(localized: "\(CurrencyLabel.formatted(minorUnits: result.reservedForBillsMinorUnits, currencyCode: store.currencyCode)) is set aside for bills first"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, FinanceSpacing.xxs)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "Safe to spend"))
        .accessibilityValue(safeToSpendAccessibilityValue)
    }

    private var safeToSpendAccessibilityValue: String {
        let amount = CurrencyLabel.formatted(minorUnits: result.spendableForCheckMinorUnits, currencyCode: store.currencyCode)
        if let pinned = result.pinnedCategoryName {
            return String(localized: "\(amount) left in \(pinned) this period")
        }
        return String(localized: "\(amount), to last \(result.daysUntilPayday) days until payday")
    }

    // MARK: - Purchase entry

    private var purchaseEntryCard: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Text(String(localized: "What's in the cart?"))
                .font(.headline)
            HStack(spacing: FinanceSpacing.sm) {
                Text(Self.currencySymbol(store.currencyCode))
                    .font(.largeTitle.bold())
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField(String(localized: "0.00"), text: $purchaseText)
                    .keyboardType(.decimalPad)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .focused($amountFocused)
                    .accessibilityLabel(String(localized: "Purchase amount"))
                    .accessibilityHint(String(localized: "Enter the total you're about to spend"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
    }

    // MARK: - Verdict

    private var verdictCard: some View {
        let remaining = SafeToSpendCalculator.remainingAfter(
            purchaseMinorUnits: purchaseMinorUnits,
            spendableMinorUnits: result.spendableForCheckMinorUnits
        )
        return VStack(spacing: FinanceSpacing.sm) {
            HStack(spacing: FinanceSpacing.sm) {
                Image(systemName: verdictSymbol)
                    .font(.title)
                    .foregroundStyle(verdictColor)
                    .accessibilityHidden(true)
                Text(verdictTitle)
                    .font(.title3.bold())
                    .foregroundStyle(.primary)
            }
            Text(verdictBody)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Divider()

            HStack {
                Text(remaining >= 0
                    ? String(localized: "Left afterwards")
                    : String(localized: "Over by"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                CurrencyLabel(
                    amountInMinorUnits: abs(remaining),
                    currencyCode: store.currencyCode,
                    showSign: false,
                    font: .headline
                )
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(verdictColor.opacity(0.12), in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: FinanceSpacing.Radius.xl)
                .strokeBorder(verdictColor.opacity(0.4), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(verdictTitle)
        .accessibilityValue(verdictBody)
    }

    private var verdictSymbol: String {
        switch verdict {
        case .comfortable: return "checkmark.circle.fill"
        case .tight: return "exclamationmark.circle.fill"
        case .beyond: return "hand.raised.circle.fill"
        }
    }

    private var verdictColor: Color {
        switch verdict {
        case .comfortable: return FinanceColors.statusPositive
        case .tight: return FinanceColors.statusWarning
        case .beyond: return FinanceColors.statusInfo
        }
    }

    private var verdictTitle: String {
        switch verdict {
        case .comfortable: return String(localized: "Yes — you've got room")
        case .tight: return String(localized: "You can, but it's tight")
        case .beyond: return String(localized: "This goes past your cushion")
        }
    }

    private var verdictBody: String {
        switch verdict {
        case .comfortable:
            return String(localized: "This fits comfortably within what's safe to spend before payday.")
        case .tight:
            return String(localized: "This works, but it uses most of your cushion. Just something to keep in mind.")
        case .beyond:
            return String(localized: "This would spend past your cushion before payday. No judgment — maybe split it or wait if you can.")
        }
    }

    // MARK: - Conversion helpers

    /// Localized currency symbol for the amount-entry prefix.
    static func currencySymbol(_ currencyCode: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        return formatter.currencySymbol ?? "$"
    }

    /// Parses user-entered decimal text into integer minor units.
    static func minorUnits(from text: String, currencyCode: String) -> Int64 {
        let normalized = text.replacingOccurrences(of: ",", with: ".")
        guard let value = Decimal(string: normalized), value > 0 else { return 0 }
        let places = CurrencyLabel.decimalPlaces(for: currencyCode)
        let multiplier = NSDecimalNumber(decimal: pow(10, places))
        let minor = NSDecimalNumber(decimal: value).multiplying(by: multiplier)
        return Int64(truncating: minor.rounding(accordingToBehavior: nil))
    }
}

// MARK: - Setup Sheet

/// Lets the user set the numbers behind the safe-to-spend figure.
struct GroceryModeSetupSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var store: GroceryModeStore
    @Bindable var paydayStore: PaydaySettingsStore

    @State private var cashText: String = ""
    @State private var billsText: String = ""
    @State private var pinnedName: String = ""
    @State private var pinnedRemainingText: String = ""
    @State private var usePinned = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    labelledAmountField(
                        label: String(localized: "Cash on hand"),
                        text: $cashText
                    )
                    labelledAmountField(
                        label: String(localized: "Bills due before payday"),
                        text: $billsText
                    )
                } header: {
                    Text(String(localized: "Your cushion"))
                } footer: {
                    Text(String(localized: "We hold back bills due before payday, then show what's safe to spend."))
                }

                Section {
                    DatePicker(
                        String(localized: "Next payday"),
                        selection: $paydayStore.anchorDate,
                        displayedComponents: .date
                    )
                    Picker(String(localized: "Pay frequency"), selection: $paydayStore.frequency) {
                        ForEach(PayFrequency.allCases, id: \.self) { freq in
                            Text(freq.displayName).tag(freq)
                        }
                    }
                } header: {
                    Text(String(localized: "Payday"))
                }

                Section {
                    Toggle(String(localized: "Check against one category"), isOn: $usePinned)
                    if usePinned {
                        TextField(String(localized: "Category (e.g. Groceries)"), text: $pinnedName)
                        labelledAmountField(
                            label: String(localized: "Left this period"),
                            text: $pinnedRemainingText
                        )
                    }
                } header: {
                    Text(String(localized: "Pin a category"))
                } footer: {
                    Text(String(localized: "Optional: check purchases against a single budget like Groceries instead of your whole cushion."))
                }
            }
            .navigationTitle(String(localized: "Adjust amounts"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Save")) {
                        save()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
            }
            .onAppear(perform: load)
        }
    }

    private func labelledAmountField(label: String, text: Binding<String>) -> some View {
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
        cashText = Self.majorString(store.clearedCashMinorUnits, currencyCode: store.currencyCode)
        billsText = Self.majorString(store.billsBeforePaydayMinorUnits, currencyCode: store.currencyCode)
        usePinned = store.pinnedCategoryName != nil
        pinnedName = store.pinnedCategoryName ?? ""
        pinnedRemainingText = Self.majorString(store.pinnedCategoryRemainingMinorUnits, currencyCode: store.currencyCode)
    }

    private func save() {
        store.clearedCashMinorUnits = GroceryModeView.minorUnits(from: cashText, currencyCode: store.currencyCode)
        store.billsBeforePaydayMinorUnits = GroceryModeView.minorUnits(from: billsText, currencyCode: store.currencyCode)
        if usePinned, !pinnedName.trimmingCharacters(in: .whitespaces).isEmpty {
            store.pinnedCategoryName = pinnedName
            store.pinnedCategoryRemainingMinorUnits = GroceryModeView.minorUnits(from: pinnedRemainingText, currencyCode: store.currencyCode)
        } else {
            store.pinnedCategoryName = nil
        }
    }

    private static func majorString(_ minorUnits: Int64, currencyCode: String) -> String {
        guard minorUnits > 0 else { return "" }
        let places = CurrencyLabel.decimalPlaces(for: currencyCode)
        let divisor = NSDecimalNumber(decimal: pow(10, places))
        let value = NSDecimalNumber(value: minorUnits).dividing(by: divisor)
        return value.stringValue
    }
}

#Preview {
    NavigationStack {
        GroceryModeView()
    }
}
