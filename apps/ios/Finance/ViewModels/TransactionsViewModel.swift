// SPDX-License-Identifier: BUSL-1.1
// TransactionsViewModel.swift - Finance - References: #477, #645
import Observation
import os
import SwiftUI
struct TransactionFilter: Equatable, Sendable {
    var dateRangeEnabled: Bool = false
    var startDate: Date = Calendar.current.date(byAdding: .month, value: -1, to: .now) ?? .now
    var endDate: Date = .now
    var amountRangeEnabled: Bool = false
    var minAmount: Double?
    var maxAmount: Double?
    var selectedCategories: Set<String> = []
    var selectedAccount: String?
    var selectedTypes: Set<TransactionTypeUI> = []
    var selectedStatuses: Set<TransactionStatusUI> = []
    var hasActiveFilters: Bool { dateRangeEnabled || amountRangeEnabled || !selectedCategories.isEmpty || selectedAccount != nil || !selectedTypes.isEmpty || !selectedStatuses.isEmpty }
    var activeFilterCount: Int { var c = 0; if dateRangeEnabled { c += 1 }; if amountRangeEnabled { c += 1 }; c += selectedCategories.count; if selectedAccount != nil { c += 1 }; c += selectedTypes.count; c += selectedStatuses.count; return c }
    var activeFilterLabels: [FilterLabel] {
        var labels: [FilterLabel] = []
        if dateRangeEnabled { let f = DateFormatter(); f.dateStyle = .short; labels.append(FilterLabel(id: "date", text: "\(f.string(from: startDate)) – \(f.string(from: endDate))", kind: .dateRange)) }
        if amountRangeEnabled { let minT = minAmount.map { String(format: "%.2f", $0) } ?? "0"; let maxT = maxAmount.map { String(format: "%.2f", $0) } ?? "∞"; labels.append(FilterLabel(id: "amount", text: "$\(minT) – $\(maxT)", kind: .amountRange)) }
        for cat in selectedCategories.sorted() { labels.append(FilterLabel(id: "cat-\(cat)", text: cat, kind: .category(cat))) }
        if let acct = selectedAccount { labels.append(FilterLabel(id: "acct-\(acct)", text: acct, kind: .account)) }
        for t in TransactionTypeUI.allCases where selectedTypes.contains(t) { labels.append(FilterLabel(id: "type-\(t.rawValue)", text: t.displayName, kind: .type(t))) }
        for s in TransactionStatusUI.allCases where selectedStatuses.contains(s) { labels.append(FilterLabel(id: "status-\(s.rawValue)", text: s.displayName, kind: .status(s))) }
        return labels
    }
}
struct FilterLabel: Identifiable, Equatable, Sendable { let id: String; let text: String; let kind: FilterLabelKind }
enum FilterLabelKind: Equatable, Sendable { case dateRange, amountRange, category(String), account, type(TransactionTypeUI), status(TransactionStatusUI) }
@Observable @MainActor
final class TransactionsViewModel {
    private let repository: TransactionRepository
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "TransactionsViewModel")
    var transactions: [TransactionItem] = []
    var isLoading = false
    var searchText = "" { didSet { scheduleSearchDebounce() } }
    var showingCreateTransaction = false
    var editingTransaction: TransactionItem?
    var showingDeleteConfirmation = false
    var pendingDeleteId: String?
    var errorMessage: String?
    var showingFilterSheet = false
    var filter = TransactionFilter()
    var debouncedSearchText = ""
    var recentSearches: [String] { get { Self.loadRecentSearches() } set { Self.saveRecentSearches(newValue) } }
    private var debounceTask: Task<Void, Never>?
    private func scheduleSearchDebounce() { debounceTask?.cancel(); debounceTask = Task { [searchText] in try? await Task.sleep(for: .milliseconds(300)); guard !Task.isCancelled else { return }; debouncedSearchText = searchText } }
    private static let recentSearchesKey = "finance_recent_transaction_searches"
    private static let maxRecentSearches = 5
    private static func loadRecentSearches() -> [String] { UserDefaults.standard.stringArray(forKey: recentSearchesKey) ?? [] }
    private static func saveRecentSearches(_ s: [String]) { UserDefaults.standard.set(Array(s.prefix(maxRecentSearches)), forKey: recentSearchesKey) }
    func commitSearch() { let term = searchText.trimmingCharacters(in: .whitespacesAndNewlines); guard !term.isEmpty else { return }; var s = recentSearches; s.removeAll { $0.caseInsensitiveCompare(term) == .orderedSame }; s.insert(term, at: 0); recentSearches = s }
    func removeRecentSearch(_ term: String) { var s = recentSearches; s.removeAll { $0 == term }; recentSearches = s }
    func clearRecentSearches() { recentSearches = [] }
    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }
    var activeFilterCount: Int { filter.activeFilterCount }
    var activeFilterLabels: [FilterLabel] { filter.activeFilterLabels }
    var availableCategories: [String] { Array(Set(transactions.map(\.category))).sorted() }
    var availableAccounts: [String] { Array(Set(transactions.map(\.accountName))).sorted() }
    struct DateGroup: Identifiable { let id: String; let date: Date; let transactions: [TransactionItem] }
    var filteredTransactions: [TransactionItem] { transactions.filter { matchesSearch($0) && matchesFilter($0) } }
    var groupedTransactions: [DateGroup] { let cal = Calendar.current; let grouped = Dictionary(grouping: filteredTransactions) { cal.startOfDay(for: $0.date) }; return grouped.sorted { $0.key > $1.key }.map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) } }
    var hasActiveFiltersOrSearch: Bool { !debouncedSearchText.isEmpty || filter.hasActiveFilters }
    init(repository: TransactionRepository) { self.repository = repository }
    func loadTransactions() async { isLoading = true; defer { isLoading = false }; do { transactions = try await repository.getTransactions() } catch { errorMessage = String(localized: "Failed to load transactions. Please try again."); Self.logger.error("Transactions load failed: \(error.localizedDescription, privacy: .public)"); transactions = [] } }
    func deleteTransaction(id: String) async { do { try await repository.deleteTransaction(id: id) } catch { errorMessage = String(localized: "Failed to delete transaction. Please try again."); Self.logger.error("Transaction deletion failed: \(error.localizedDescription, privacy: .public)") }; transactions.removeAll { $0.id == id }; pendingDeleteId = nil }
    func confirmDelete(id: String) { pendingDeleteId = id; showingDeleteConfirmation = true }
    func removeFilter(_ label: FilterLabel) { switch label.kind { case .dateRange: filter.dateRangeEnabled = false; case .amountRange: filter.amountRangeEnabled = false; case .category(let n): filter.selectedCategories.remove(n); case .account: filter.selectedAccount = nil; case .type(let t): filter.selectedTypes.remove(t); case .status(let s): filter.selectedStatuses.remove(s) }; View.announceForAccessibility(String(localized: "\(activeFilterCount) filters active")) }
    func clearAllFilters() { filter = TransactionFilter(); View.announceForAccessibility(String(localized: "All filters cleared")) }
    private func matchesSearch(_ t: TransactionItem) -> Bool { guard !debouncedSearchText.isEmpty else { return true }; return t.payee.localizedCaseInsensitiveContains(debouncedSearchText) || t.category.localizedCaseInsensitiveContains(debouncedSearchText) || t.accountName.localizedCaseInsensitiveContains(debouncedSearchText) }
    private func matchesFilter(_ t: TransactionItem) -> Bool {
        if filter.dateRangeEnabled { let start = Calendar.current.startOfDay(for: filter.startDate); let end = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: filter.endDate)) ?? filter.endDate; guard t.date >= start && t.date < end else { return false } }
        if filter.amountRangeEnabled { let absAmt = abs(Double(t.amountMinorUnits)) / 100.0; if let min = filter.minAmount, absAmt < min { return false }; if let max = filter.maxAmount, absAmt > max { return false } }
        if !filter.selectedCategories.isEmpty, !filter.selectedCategories.contains(t.category) { return false }
        if let acct = filter.selectedAccount, t.accountName != acct { return false }
        if !filter.selectedTypes.isEmpty, !filter.selectedTypes.contains(t.type) { return false }
        if !filter.selectedStatuses.isEmpty, !filter.selectedStatuses.contains(t.status) { return false }
        return true
    }
}
