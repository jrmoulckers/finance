// SPDX-License-Identifier: BUSL-1.1

// TransactionsView.swift
// Finance
//
// Date-grouped transaction list with search, swipe actions, and pull-to-refresh.

import SwiftUI

// MARK: - View

struct TransactionsView: View {
    @Environment(BiometricAuthManager.self) private var biometricManager
    @Environment(DeepLinkHandler.self) private var deepLinkHandler
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var viewModel: TransactionsViewModel
    @State private var showingQuickAdd = false

    init(viewModel: TransactionsViewModel = TransactionsViewModel(
        repository: RepositoryProvider.shared.transactions
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.transactions.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.filteredTransactions.isEmpty && !viewModel.isLoading {
                    if viewModel.searchText.isEmpty {
                        EmptyStateView(
                            systemImage: "arrow.left.arrow.right",
                            title: String(localized: "No Transactions"),
                            message: String(localized: "Add your first transaction to start tracking your spending."),
                            actionLabel: String(localized: "Add Transaction"),
                            action: { viewModel.showingCreateTransaction = true }
                        )
                    } else {
                        ContentUnavailableView.search(text: viewModel.searchText)
                    }
                } else {
                    transactionsList
                }
            }
            .overlay(alignment: .bottomTrailing) {
                // One-thumb quick expense capture (#2167).
                QuickAddExpenseButton { showingQuickAdd = true }
                    .padding(.trailing, 20)
                    .padding(.bottom, 20)
            }
            .offlineAware()
            .navigationTitle(String(localized: "Transactions"))
            .searchable(text: $viewModel.searchText, prompt: String(localized: "Search by payee, category, or account"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        viewModel.showingFilterSheet = true
                    } label: {
                        IconView(.filter, size: 22)
                            .overlay(alignment: .topTrailing) {
                                if viewModel.activeFilterCount > 0 {
                                    Text("\(viewModel.activeFilterCount)")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 16, height: 16)
                                        .background(.red, in: Circle())
                                        .offset(x: 6, y: -6)
                                }
                            }
                    }
                    .accessibilityLabel(String(localized: "Filter transactions"))
                    .accessibilityHint(String(localized: "Opens filter and sort options"))
                    .accessibilityValue(
                        viewModel.activeFilterCount > 0
                            ? String(localized: "\(viewModel.activeFilterCount) active filters")
                            : String(localized: "No active filters")
                    )
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            viewModel.showingCreateTransaction = true
                        } label: {
                            Label(String(localized: "Manual Entry"), systemImage: "square.and.pencil")
                        }
                        .accessibilityIdentifier("manual_entry_button")

                        Button {
                            viewModel.showingNlpInput = true
                        } label: {
                            Label(String(localized: "Quick Add (NLP)"), systemImage: "text.bubble")
                        }
                        .accessibilityIdentifier("nlp_input_button")
                    } label: {
                        IconView(.add, size: 20)
                    }
                    .accessibilityIdentifier("add_transaction_button")
                    .accessibilityLabel(String(localized: "Add transaction"))
                    .accessibilityHint(String(localized: "Opens options to create a new transaction"))
                }
            }
            .sheet(isPresented: $viewModel.showingCreateTransaction, onDismiss: {
                deepLinkHandler.consumeQuickEntry()
                Task { await viewModel.loadTransactions() }
            }) {
                TransactionCreateView(viewModel: TransactionCreateViewModel(
                    transactionRepository: RepositoryProvider.shared.transactions,
                    accountRepository: RepositoryProvider.shared.accounts,
                    quickEntryAction: deepLinkHandler.pendingQuickEntryAction
                ))
            }
            .sheet(isPresented: $viewModel.showingNlpInput, onDismiss: {
                Task { await viewModel.loadTransactions() }
            }) {
                NlpInputView()
            }
            .sheet(isPresented: $showingQuickAdd, onDismiss: {
                Task { await viewModel.loadTransactions() }
            }) {
                QuickAddExpenseSheet(onSaved: {
                    Task { await viewModel.loadTransactions() }
                })
            }
            .sheet(isPresented: $viewModel.showingFilterSheet) {
                TransactionFilterSheet(
                    filter: $viewModel.filter,
                    sort: $viewModel.sort,
                    availableCategories: viewModel.availableCategories,
                    availableAccounts: viewModel.availableAccounts,
                    onApply: { viewModel.applyFiltersAndSort() },
                    onClear: { viewModel.clearAllFilters() }
                )
                .presentationDetents([.medium, .large])
            }
            .sheet(item: $viewModel.editingTransaction, onDismiss: {
                Task { await viewModel.loadTransactions() }
            }) { transaction in
                TransactionEditView(transaction: transaction) {
                    Task { await viewModel.loadTransactions() }
                }
            }
            .alert(String(localized: "Delete Transaction"), isPresented: $viewModel.showingDeleteConfirmation) {
                Button(String(localized: "Cancel"), role: .cancel) {
                    viewModel.pendingDeleteId = nil
                }
                Button(String(localized: "Delete"), role: .destructive) {
                    if let id = viewModel.pendingDeleteId {
                        Task { await viewModel.deleteTransaction(id: id) }
                    }
                }
            } message: {
                Text(String(localized: "Are you sure you want to delete this transaction? This action cannot be undone."))
            }
            .refreshable { await viewModel.loadTransactions() }
            .task {
                await viewModel.loadTransactions()
                if deepLinkHandler.hasPendingQuickEntry {
                    await openBiometricQuickEntry()
                }
            }
            .onChange(of: deepLinkHandler.hasPendingQuickEntry) { _, hasPending in
                guard hasPending else { return }
                Task { await openBiometricQuickEntry() }
            }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadTransactions() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private func openBiometricQuickEntry() async {
        guard deepLinkHandler.hasPendingQuickEntry else { return }

        let appLockEnabled = UserDefaults.standard.bool(
            forKey: BiometricAuthManager.appLockEnabledKey
        )

        if !appLockEnabled, biometricManager.canAuthenticate() {
            do {
                try await biometricManager.authenticate(
                    reason: String(localized: "Authenticate to log a transaction")
                )
            } catch {
                deepLinkHandler.consumeQuickEntry()
                return
            }
        }

        viewModel.showingCreateTransaction = true
    }

    private var transactionsList: some View {
        VStack(spacing: 0) {
            // Active filter chips
            if !viewModel.activeFilterLabels.isEmpty {
                FilterChipsBar(
                    labels: viewModel.activeFilterLabels,
                    onRemove: { viewModel.removeFilter($0) },
                    onClearAll: { viewModel.clearAllFilters() }
                )
            }

            List {
                ForEach(viewModel.groupedTransactions) { group in
                    Section {
                        ForEach(group.transactions) { transaction in
                            transactionRow(transaction)
                                .contentShape(Rectangle())
                                .onTapGesture { viewModel.editingTransaction = transaction }
                                .onAppear {
                                    // Trigger pagination when approaching the
                                    // end of the loaded list (within 5 items).
                                    if viewModel.hasMorePages,
                                       viewModel.shouldLoadMore(for: transaction) {
                                        Task { await viewModel.loadMore() }
                                    }
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        viewModel.confirmDelete(id: transaction.id)
                                    } label: {
                                        Label(String(localized: "Delete"), systemImage: "trash")
                                    }
                                    .accessibilityLabel(String(localized: "Delete transaction"))
                                }
                                .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                    Button {
                                        viewModel.editingTransaction = transaction
                                    } label: {
                                        Label(String(localized: "Edit"), systemImage: "pencil")
                                    }
                                    .tint(.blue)
                                    .accessibilityLabel(String(localized: "Edit transaction"))
                                }
                        }
                    } header: {
                        Text(group.date, style: .date)
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    private func transactionRow(_ transaction: TransactionItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconView(transaction.type.iconToken, size: 16)
                .foregroundStyle(transaction.type.color)
                .frame(width: 32, height: 32)
                .background(transaction.type.color.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(transaction.payee)
                        .font(.body)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        .fixedSize(horizontal: false, vertical: true)
                    if transaction.status == .pending {
                        Text(transaction.status.displayName)
                            .font(.caption2).foregroundStyle(.orange)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.orange.opacity(0.1), in: Capsule())
                    }
                }
                HStack(spacing: 4) {
                    Text(transaction.category)
                    Text("·")
                    Text(transaction.accountName)
                }
                .font(.caption).foregroundStyle(.secondary)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                .fixedSize(horizontal: false, vertical: true)

                // Tags row (show up to 2 tag chips)
                if !transaction.tags.isEmpty {
                    TagsRow(
                        tags: transaction.tags,
                        maxVisible: 2,
                        onTagTap: { tag in viewModel.filterByTag(tag) }
                    )
                }
                // At accessibility text sizes stack the amount below the
                // details so nothing is truncated. (#2119)
                if dynamicTypeSize.isAccessibilitySize {
                    CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
                }
            }
            if !dynamicTypeSize.isAccessibilitySize {
                Spacer()
                CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(transaction.accessibilityRowLabel())
        .accessibilityHint(String(localized: "Tap to edit. Swipe for more actions."))
    }
}

#Preview {
    TransactionsView(viewModel: TransactionsViewModel(repository: MockTransactionRepository()))
        .environment(BiometricAuthManager())
        .environment(DeepLinkHandler())
}
