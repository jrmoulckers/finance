// SPDX-License-Identifier: BUSL-1.1

// TransactionsView.swift
// Finance
//
// Date-grouped transaction list with search, advanced filtering,
// swipe actions, and pull-to-refresh.
// NavigationStack is provided by MainTabView for deep-link support (#470).

import SwiftUI

// MARK: - View

struct TransactionsView: View {
    @State private var viewModel: TransactionsViewModel
    @State private var transactionToEdit: TransactionItem?

    init(viewModel: TransactionsViewModel = TransactionsViewModel(repository: MockTransactionRepository())) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        ZStack {
            if viewModel.isLoading && viewModel.transactions.isEmpty {
                ProgressView(String(localized: "Loading..."))
                    .accessibilityLabel(String(localized: "Loading data"))
            } else if let error = viewModel.errorMessage, viewModel.transactions.isEmpty {
                ContentUnavailableView {
                    Label(String(localized: "Something Went Wrong"), systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button(String(localized: "Try Again")) {
                        Task { await viewModel.loadTransactions() }
                    }
                }
            } else if viewModel.filteredTransactions.isEmpty && !viewModel.isLoading {
                if viewModel.searchText.isEmpty && !viewModel.filters.isActive {
                    EmptyStateView(
                        systemImage: "arrow.left.arrow.right",
                        title: String(localized: "No Transactions"),
                        message: String(localized: "Add your first transaction to start tracking your spending."),
                        actionLabel: String(localized: "Add Transaction"),
                        action: { viewModel.showingCreateTransaction = true }
                    )
                } else if viewModel.filters.isActive {
                    ContentUnavailableView(
                        String(localized: "No Matching Transactions"),
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text(String(localized: "Try adjusting your filters to see more transactions."))
                    )
                } else {
                    ContentUnavailableView.search(text: viewModel.searchText)
                }
            } else {
                transactionsList
            }
        }
        .overlay(alignment: .top) {
            if let error = viewModel.errorMessage, !viewModel.transactions.isEmpty {
                ErrorBannerView(message: error) {
                    await viewModel.loadTransactions()
                }
            }
        }
        .safeAreaInset(edge: .top) {
            if viewModel.filters.isActive {
                filterChipBar
            }
        }
        .navigationTitle(String(localized: "Transactions"))
        .searchable(text: $viewModel.searchText, prompt: String(localized: "Search by payee, category, or account"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { viewModel.showingCreateTransaction = true } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(String(localized: "Add transaction"))
                .accessibilityHint(String(localized: "Opens a form to create a new transaction"))
            }
            ToolbarItem(placement: .secondaryAction) {
                Button { viewModel.showFilterSheet = true } label: {
                    filterButtonLabel
                }
                .accessibilityLabel(String(localized: "Filter transactions"))
                .accessibilityHint(String(localized: "Opens the filter sheet to refine the transaction list"))
            }
        }
        .sheet(isPresented: $viewModel.showingCreateTransaction) { TransactionCreateView() }
        .sheet(isPresented: $viewModel.showFilterSheet) {
            TransactionFilterView(
                filters: $viewModel.filters,
                availableCategories: viewModel.availableCategories
            )
        }
        .sheet(item: $transactionToEdit, onDismiss: {
            Task { await viewModel.loadTransactions() }
        }) { transaction in
            TransactionEditView(viewModel: TransactionEditViewModel(
                transaction: transaction,
                repository: MockTransactionRepository(),
                accountRepository: MockAccountRepository()
            ))
        }
        .refreshable { await viewModel.loadTransactions() }
        .task { await viewModel.loadTransactions() }
    }

    // MARK: - Filter Button Label

    @ViewBuilder
    private var filterButtonLabel: some View {
        if viewModel.activeFilterCount > 0 {
            Image(systemName: "line.3.horizontal.decrease.circle.fill")
                .symbolRenderingMode(.hierarchical)
                .overlay(alignment: .topTrailing) {
                    Text("\(viewModel.activeFilterCount)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(.red, in: Circle())
                        .offset(x: 6, y: -6)
                        .accessibilityHidden(true)
                }
                .accessibilityValue(String(localized: "\(viewModel.activeFilterCount) active filters"))
        } else {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
    }

    // MARK: - Filter Chip Bar

    private var filterChipBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.filters.activeChipLabels) { chip in
                    FilterChipView(label: chip.label) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.removeFilterChip(chip)
                        }
                    }
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        viewModel.clearAllFilters()
                    }
                } label: {
                    Text(String(localized: "Clear All"))
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(minHeight: 44)
                        .foregroundStyle(.red)
                }
                .accessibilityLabel(String(localized: "Clear all filters"))
                .accessibilityHint(String(localized: "Removes all active filters"))
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
        }
        .background(.bar)
    }

    // MARK: - Transactions List

    private var transactionsList: some View {
        List {
            ForEach(viewModel.groupedTransactions) { group in
                Section {
                    ForEach(group.transactions) { transaction in
                        transactionRow(transaction)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { await viewModel.deleteTransaction(id: transaction.id) }
                                } label: {
                                    Label(String(localized: "Delete"), systemImage: "trash")
                                }
                                .accessibilityLabel(String(localized: "Delete transaction"))
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button {
                                    transactionToEdit = transaction
                                } label: {
                                    Label(String(localized: "Edit"), systemImage: "pencil")
                                }
                                .tint(.blue)
                                .accessibilityLabel(String(localized: "Edit transaction"))
                                .accessibilityHint(String(localized: "Opens the edit form for this transaction"))
                            }
                    }
                } header: {
                    Text(group.date, style: .date)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func transactionRow(_ transaction: TransactionItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.type.systemImage)
                .font(.caption).foregroundStyle(transaction.type.color)
                .frame(width: 32, height: 32)
                .background(transaction.type.color.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(transaction.payee).font(.body).lineLimit(1)
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
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.payee), \(transaction.category), \(transaction.accountName)")
        .accessibilityHint(String(localized: "Swipe for edit and delete actions"))
    }
}

#Preview {
    NavigationStack {
        TransactionsView(viewModel: TransactionsViewModel(repository: MockTransactionRepository()))
    }
}
