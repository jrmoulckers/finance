// SPDX-License-Identifier: BUSL-1.1
// QuickTransactionView.swift - FinanceClip - Refs #648
import os
import StoreKit
import SwiftUI
struct QuickTransactionView: View {
    let initialAmountMinorUnits: Int64?
    let initialCategoryId: String?
    @State private var amountText = ""
    @State private var selectedCategory: TransactionCategory?
    @State private var payeeText = ""
    @State private var isSaved = false
    @State private var showAppStoreOverlay = false
    @State private var store = ClipTransactionStore()
    @FocusState private var isAmountFocused: Bool
    private let categoryColumns = [GridItem(.adaptive(minimum: 80, maximum: 120), spacing: 12)]
    var body: some View {
        if isSaved { confirmationView } else { transactionFormView }
    }
    private var transactionFormView: some View {
        ScrollView {
            VStack(spacing: 24) { headerView; amountInputView; categoryGridView; payeeInputView; saveButton }
            .padding(.horizontal, 20).padding(.vertical, 16)
        }.background(Color(.systemGroupedBackground)).task { prefillFromURL(); isAmountFocused = true }
    }
    private var headerView: some View {
        VStack(spacing: 4) {
            Image(systemName: "plus.circle.fill").font(.system(.largeTitle, design: .rounded)).foregroundStyle(.blue).accessibilityHidden(true)
            Text(String(localized: "Quick Expense")).font(.title2).fontWeight(.bold).accessibilityAddTraits(.isHeader)
        }.padding(.top, 8)
    }
    private var amountInputView: some View {
        VStack(spacing: 8) {
            Text(String(localized: "Amount")).font(.subheadline).foregroundStyle(.secondary).accessibilityHidden(true)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(currencySymbol).font(.system(.title, design: .rounded)).fontWeight(.semibold).foregroundStyle(.secondary).accessibilityHidden(true)
                TextField(String(localized: "0.00"), text: $amountText)
                    .font(.system(size: 48, weight: .bold, design: .rounded)).keyboardType(.decimalPad).multilineTextAlignment(.center).focused($isAmountFocused)
                    .accessibilityLabel(String(localized: "Transaction amount")).accessibilityHint(String(localized: "Enter the expense amount"))
                    .onChange(of: amountText) { _, newValue in amountText = sanitizeAmountInput(newValue) }
            }.padding(.vertical, 16).padding(.horizontal, 24)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color(.systemBackground)).shadow(color: .black.opacity(0.06), radius: 8, y: 2))
        }
    }
    private var categoryGridView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Category")).font(.subheadline).foregroundStyle(.secondary).accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: categoryColumns, spacing: 12) { ForEach(TransactionCategory.quickCategories) { category in categoryButton(for: category) } }
        }
    }
    private func categoryButton(for category: TransactionCategory) -> some View {
        let isSelected = selectedCategory == category
        return Button { withAnimation(.easeInOut(duration: 0.2)) { selectedCategory = category } } label: {
            VStack(spacing: 6) {
                Image(systemName: category.systemImage).font(.title3).frame(width: 32, height: 32).accessibilityHidden(true)
                Text(category.displayName).font(.caption).lineLimit(1)
            }.frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 12).fill(isSelected ? Color.blue.opacity(0.15) : Color(.systemBackground)).shadow(color: .black.opacity(0.04), radius: 4, y: 1))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(isSelected ? Color.blue : Color.clear, lineWidth: 2))
        }.buttonStyle(.plain).accessibilityLabel(category.displayName)
        .accessibilityHint(isSelected ? String(localized: "Selected") : String(localized: "Double-tap to select"))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
    private var payeeInputView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Payee (optional)")).font(.subheadline).foregroundStyle(.secondary).accessibilityHidden(true)
            TextField(String(localized: "e.g. Coffee Shop"), text: $payeeText).font(.body).textContentType(.organizationName).padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemBackground)).shadow(color: .black.opacity(0.04), radius: 4, y: 1))
                .accessibilityLabel(String(localized: "Payee name")).accessibilityHint(String(localized: "Optional"))
        }
    }
    private var saveButton: some View {
        Button { saveTransaction() } label: {
            HStack(spacing: 8) { Image(systemName: "checkmark.circle.fill").accessibilityHidden(true); Text(String(localized: "Save Expense")).fontWeight(.semibold) }
            .font(.body).frame(maxWidth: .infinity).frame(minHeight: 50).foregroundStyle(.white)
            .background(RoundedRectangle(cornerRadius: 14).fill(isSaveEnabled ? Color.blue : Color.gray))
        }.disabled(!isSaveEnabled).accessibilityLabel(String(localized: "Save expense")).padding(.top, 8)
    }
    private var confirmationView: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark.circle.fill").font(.system(size: 72)).foregroundStyle(.green).accessibilityHidden(true)
            Text(String(localized: "Expense Saved!")).font(.title).fontWeight(.bold).accessibilityAddTraits(.isHeader)
            Spacer()
            VStack(spacing: 12) {
                Text(String(localized: "Get the Full App")).font(.headline).accessibilityAddTraits(.isHeader)
                Text(String(localized: "Track all your finances, set budgets, and reach your savings goals.")).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button { showAppStoreOverlay = true } label: {
                    HStack(spacing: 8) { Image(systemName: "arrow.down.app.fill").accessibilityHidden(true); Text(String(localized: "Download Finance")).fontWeight(.semibold) }
                    .font(.body).frame(maxWidth: .infinity).frame(minHeight: 50).foregroundStyle(.white).background(RoundedRectangle(cornerRadius: 14).fill(Color.blue))
                }.accessibilityLabel(String(localized: "Download Finance app"))
            }.padding(20).background(RoundedRectangle(cornerRadius: 20).fill(Color(.systemBackground)).shadow(color: .black.opacity(0.08), radius: 12, y: 4))
            Button { resetForm() } label: { Text(String(localized: "Add Another Expense")).font(.body).fontWeight(.medium).foregroundStyle(.blue).frame(maxWidth: .infinity).frame(minHeight: 44) }
            .accessibilityLabel(String(localized: "Add another expense")).padding(.bottom, 8)
        }.padding(.horizontal, 20).padding(.vertical, 16).background(Color(.systemGroupedBackground))
        .appStoreOverlay(isPresented: $showAppStoreOverlay) { SKOverlay.AppClipConfiguration(position: .bottom) }
    }
    private var isSaveEnabled: Bool { parsedAmountMinorUnits > 0 && selectedCategory != nil }
    private var parsedAmountMinorUnits: Int64 {
        guard let decimal = Decimal(string: amountText), decimal > 0 else { return 0 }
        return NSDecimalNumber(decimal: decimal * 100).int64Value
    }
    private var formattedAmount: String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "USD"
        return f.string(from: NSDecimalNumber(value: parsedAmountMinorUnits).dividing(by: 100)) ?? amountText
    }
    private var currencySymbol: String { let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "USD"; return f.currencySymbol ?? "$" }
    private func saveTransaction() {
        guard isSaveEnabled, let category = selectedCategory else { return }
        let transaction = ClipTransaction(amountMinorUnits: parsedAmountMinorUnits, categoryId: category.id, payee: payeeText.trimmingCharacters(in: .whitespacesAndNewlines))
        let saved = store.save(transaction)
        if saved { playSuccessHaptic(); View.announceForAccessibility(String(localized: "Expense saved")) }
        else { playErrorHaptic() }
        withAnimation(.easeInOut(duration: 0.3)) { isSaved = true }
    }
    private func resetForm() { withAnimation(.easeInOut(duration: 0.3)) { amountText = ""; selectedCategory = nil; payeeText = ""; isSaved = false }; isAmountFocused = true }
    private func prefillFromURL() {
        if let m = initialAmountMinorUnits, m > 0 { amountText = NSDecimalNumber(decimal: Decimal(m) / 100).stringValue }
        if let c = initialCategoryId { selectedCategory = TransactionCategory.quickCategories.first { $0.id == c } }
    }
    private func sanitizeAmountInput(_ input: String) -> String {
        var s = input.filter { $0.isNumber || $0 == "." }
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count > 2 { s = "\(parts[0]).\(parts[1])" }
        if let d = s.firstIndex(of: ".") { let a = s[s.index(after: d)...]; if a.count > 2 { s = String(s.prefix(through: d)) + String(a.prefix(2)) } }
        if s.count > 10 { s = String(s.prefix(10)) }; return s
    }
    private func playSuccessHaptic() { let g = UINotificationFeedbackGenerator(); g.prepare(); g.notificationOccurred(.success) }
    private func playErrorHaptic() { let g = UINotificationFeedbackGenerator(); g.prepare(); g.notificationOccurred(.error) }
}
#Preview("Empty") { QuickTransactionView(initialAmountMinorUnits: nil, initialCategoryId: nil) }
#Preview("Pre-filled") { QuickTransactionView(initialAmountMinorUnits: 1250, initialCategoryId: "food") }
