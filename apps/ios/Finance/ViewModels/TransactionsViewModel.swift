// SPDX-License-Identifier: BUSL-1.1
// TransactionsViewModel.swift - Finance - References: #414, #477, #645
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

    /// Cached short date formatter — avoids allocating a new
    /// `DateFormatter` on every `activeFilterLabels` access.
    private static nonisolated(unsafe) let shortDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        return f
    }()

    var activeFilterLabels: [FilterLabel] {
        var labels: [FilterLabel] = []
        if dateRangeEnabled { labels.append(FilterLabel(id: "date", text: "\(Self.shortDateFormatter.string(from: startDate)) – \(Self.shortDateFormatter.string(from: endDate))", kind: .dateRange)) }
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
@Observable
final class TransactionsViewModel {
    private let repository: TransactionRepository
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "TransactionsViewModel")

    // MARK: - Pagination (#645)

    /// Number of transactions to load per page.
    static let pageSize = 50

    /// The next page number to load (starts at 1; incremented after each page load).
    var currentPage = 1

    /// Whether additional pages of transactions may be available.
    var hasMorePages = true

    /// Current offset into the full transaction list for pagination.
    private var currentOffset = 0

    // MARK: - State

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
    private func scheduleSearchDebounce() { debounceTask?.cancel(); debounceTask = Task { [searchText] in try? await Task.sleep(for: .milliseconds(300)); guard !Task.isCancelled else { return }; debouncedSearchText = searchText; recomputeFilteredGroups() } }
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

    // MARK: - Cached Derived Collections
    //
    // `filteredTransactions` and `groupedTransactions` were computed
    // properties that re-filtered, re-sorted, and re-grouped on every
    // SwiftUI body evaluation.  With 1 000 transactions the O(n log n)
    // sort + Dictionary grouping was running multiple times per frame.
    // These are now stored properties recomputed only when the inputs
    // (`transactions`, `debouncedSearchText`, `filter`) change.

    private(set) var filteredTransactions: [TransactionItem] = []
    private(set) var groupedTransactions: [DateGroup] = []

    /// Recomputes `filteredTransactions` and `groupedTransactions` from
    /// the current `transactions`, search text, and filter state.
    private func recomputeFilteredGroups() {
        filteredTransactions = transactions.filter { matchesSearch($0) && matchesFilter($0) }
        let cal = Calendar.current
        let grouped = Dictionary(grouping: filteredTransactions) { cal.startOfDay(for: $0.date) }
        groupedTransactions = grouped.sorted { $0.key > $1.key }
            .map { DateGroup(id: $0.key.ISO8601Format(), date: $0.key, transactions: $0.value) }
    }

    var hasActiveFiltersOrSearch: Bool { !debouncedSearchText.isEmpty || filter.hasActiveFilters }
    init(repository: TransactionRepository) { self.repository = repository }

    // MARK: - Loading (paginated)

    /// Loads the first page of transactions, resetting pagination state.
    func loadTransactions() async {
        isLoading = true
        defer { isLoading = false }
        currentOffset = 0
        currentPage = 1
        do {
            let page = try await repository.getTransactions(offset: 0, limit: Self.pageSize)
            transactions = page
            currentOffset = page.count
            hasMorePages = page.count >= Self.pageSize
            currentPage = 2
            recomputeFilteredGroups()
        } catch {
            errorMessage = String(localized: "Failed to load transactions. Please try again.")
            Self.logger.error("Transactions load failed: \(error.localizedDescription, privacy: .public)")
            transactions = []
            hasMorePages = false
            recomputeFilteredGroups()
        }
    }

    /// Loads the next page of transactions and appends to the existing list.
    func loadMore() async {
        guard hasMorePages, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await repository.getTransactions(offset: currentOffset, limit: Self.pageSize)
            transactions.append(contentsOf: page)
            currentOffset += page.count
            hasMorePages = page.count >= Self.pageSize
            currentPage += 1
            recomputeFilteredGroups()
        } catch {
            errorMessage = String(localized: "Failed to load more transactions.")
            Self.logger.error("Load more failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Resets pagination and reloads the first page of transactions.
    func refresh() async {
        await loadTransactions()
    }

    /// Returns `true` when the given item is near the end of the loaded list,
    /// signalling that the view should trigger a `loadMore()` call (if ``hasMorePages``).
    func shouldLoadMore(for item: TransactionItem) -> Bool {
        guard let index = transactions.firstIndex(where: { $0.id == item.id }) else { return false }
        return index >= transactions.count - 5
    }

    // MARK: - Mutations

    func deleteTransaction(id: String) async { do { try await repository.deleteTransaction(id: id) } catch { errorMessage = String(localized: "Failed to delete transaction. Please try again."); Self.logger.error("Transaction deletion failed: \(error.localizedDescription, privacy: .public)") }; transactions.removeAll { $0.id == id }; pendingDeleteId = nil; recomputeFilteredGroups() }
    func confirmDelete(id: String) { pendingDeleteId = id; showingDeleteConfirmation = true }
    func removeFilter(_ label: FilterLabel) { switch label.kind { case .dateRange: filter.dateRangeEnabled = false; case .amountRange: filter.amountRangeEnabled = false; case .category(let n): filter.selectedCategories.remove(n); case .account: filter.selectedAccount = nil; case .type(let t): filter.selectedTypes.remove(t); case .status(let s): filter.selectedStatuses.remove(s) }; recomputeFilteredGroups(); AccessibilityNotification.Announcement(String(localized: "\(activeFilterCount) filters active")).post() }
    func clearAllFilters() { filter = TransactionFilter(); recomputeFilteredGroups(); AccessibilityNotification.Announcement(String(localized: "All filters cleared")).post() }

    // MARK: - Filtering

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
