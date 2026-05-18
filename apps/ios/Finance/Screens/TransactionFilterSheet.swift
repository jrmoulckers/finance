// SPDX-License-Identifier: BUSL-1.1

// TransactionFilterSheet.swift
// Finance
// References: #1484
//
// A sheet presenting advanced filter and sort controls for the transactions list.
// Includes date range, category multi-select, account, amount range, type, and status filters,
// plus sort options with ascending/descending toggle.

import SwiftUI

// MARK: - Sort Configuration

/// Sort field options for transactions.
enum TransactionSortField: String, CaseIterable, Sendable {
    case date, amount, payee, category

    var displayName: String {
        switch self {
        case .date: String(localized: "Date")
        case .amount: String(localized: "Amount")
        case .payee: String(localized: "Payee")
        case .category: String(localized: "Category")
        }
    }

    var systemImage: String {
        switch self {
        case .date: "calendar"
        case .amount: "dollarsign"
        case .payee: "person"
        case .category: "folder"
        }
    }
}

/// Sort direction.
enum SortDirection: String, CaseIterable, Sendable {
    case ascending, descending

    var displayName: String {
        switch self {
        case .ascending: String(localized: "Ascending")
        case .descending: String(localized: "Descending")
        }
    }

    var systemImage: String {
        switch self {
        case .ascending: "arrow.up"
        case .descending: "arrow.down"
        }
    }
}

/// Combined sort configuration.
struct TransactionSort: Equatable, Sendable {
    var field: TransactionSortField = .date
    var direction: SortDirection = .descending
}

// MARK: - Filter Sheet View

/// Advanced filter sheet for transactions.
struct TransactionFilterSheet: View {
    @Binding var filter: TransactionFilter
    @Binding var sort: TransactionSort
    let availableCategories: [String]
    let availableAccounts: [String]
    var onApply: () -> Void
    var onClear: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localFilter: TransactionFilter
    @State private var localSort: TransactionSort

    init(
        filter: Binding<TransactionFilter>,
        sort: Binding<TransactionSort>,
        availableCategories: [String],
        availableAccounts: [String],
        onApply: @escaping () -> Void,
        onClear: @escaping () -> Void
    ) {
        _filter = filter
        _sort = sort
        self.availableCategories = availableCategories
        self.availableAccounts = availableAccounts
        self.onApply = onApply
        self.onClear = onClear
        _localFilter = State(initialValue: filter.wrappedValue)
        _localSort = State(initialValue: sort.wrappedValue)
    }

    var body: some View {
        NavigationStack {
            Form {
                sortSection
                dateRangeSection
                amountRangeSection
                categorySection
                accountSection
                typeSection
                statusSection
            }
            .navigationTitle(String(localized: "Filter & Sort"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Apply")) {
                        filter = localFilter
                        sort = localSort
                        onApply()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .accessibilityLabel(String(localized: "Apply filters"))
                    .accessibilityHint(String(localized: "Applies the selected filters and sort options"))
                }
            }
            .safeAreaInset(edge: .bottom) {
                if localFilter.hasActiveFilters {
                    Button(role: .destructive) {
                        localFilter = TransactionFilter()
                        localSort = TransactionSort()
                    } label: {
                        Label(String(localized: "Clear All Filters"), systemImage: "xmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .padding()
                    .accessibilityLabel(String(localized: "Clear all filters"))
                    .accessibilityHint(String(localized: "Removes all active filters and resets sort to default"))
                }
            }
        }
    }

    // MARK: - Sort Section

    private var sortSection: some View {
        Section {
            Picker(String(localized: "Sort By"), selection: $localSort.field) {
                ForEach(TransactionSortField.allCases, id: \.self) { field in
                    Label(field.displayName, systemImage: field.systemImage)
                        .tag(field)
                }
            }
            .accessibilityLabel(String(localized: "Sort field"))

            Picker(String(localized: "Direction"), selection: $localSort.direction) {
                ForEach(SortDirection.allCases, id: \.self) { direction in
                    Label(direction.displayName, systemImage: direction.systemImage)
                        .tag(direction)
                }
            }
            .accessibilityLabel(String(localized: "Sort direction"))
        } header: {
            Label(String(localized: "Sort"), systemImage: "arrow.up.arrow.down")
        }
    }

    // MARK: - Date Range Section

    private var dateRangeSection: some View {
        Section {
            Toggle(String(localized: "Filter by Date"), isOn: $localFilter.dateRangeEnabled)
                .accessibilityLabel(String(localized: "Filter by date range"))
                .accessibilityHint(String(localized: "Enables filtering transactions to a specific date range"))

            if localFilter.dateRangeEnabled {
                DatePicker(
                    String(localized: "From"),
                    selection: $localFilter.startDate,
                    displayedComponents: .date
                )
                .accessibilityLabel(String(localized: "Start date"))

                DatePicker(
                    String(localized: "To"),
                    selection: $localFilter.endDate,
                    displayedComponents: .date
                )
                .accessibilityLabel(String(localized: "End date"))
            }
        } header: {
            Label(String(localized: "Date Range"), systemImage: "calendar")
        }
    }

    // MARK: - Amount Range Section

    private var amountRangeSection: some View {
        Section {
            Toggle(String(localized: "Filter by Amount"), isOn: $localFilter.amountRangeEnabled)
                .accessibilityLabel(String(localized: "Filter by amount range"))
                .accessibilityHint(String(localized: "Enables filtering transactions to a specific amount range"))

            if localFilter.amountRangeEnabled {
                HStack {
                    Text(String(localized: "Min"))
                        .foregroundStyle(.secondary)
                    TextField(
                        String(localized: "0.00"),
                        value: $localFilter.minAmount,
                        format: .number.precision(.fractionLength(2))
                    )
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel(String(localized: "Minimum amount"))
                }

                HStack {
                    Text(String(localized: "Max"))
                        .foregroundStyle(.secondary)
                    TextField(
                        String(localized: "No limit"),
                        value: $localFilter.maxAmount,
                        format: .number.precision(.fractionLength(2))
                    )
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel(String(localized: "Maximum amount"))
                }
            }
        } header: {
            Label(String(localized: "Amount"), systemImage: "dollarsign.circle")
        }
    }

    // MARK: - Category Section

    private var categorySection: some View {
        Section {
            if availableCategories.isEmpty {
                Text(String(localized: "No categories available"))
                    .foregroundStyle(.secondary)
                    .font(.caption)
            } else {
                ForEach(availableCategories, id: \.self) { category in
                    Button {
                        toggleCategory(category)
                    } label: {
                        HStack {
                            Text(category)
                                .foregroundStyle(.primary)
                            Spacer()
                            if localFilter.selectedCategories.contains(category) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.blue)
                                    .fontWeight(.semibold)
                            }
                        }
                    }
                    .accessibilityLabel(category)
                    .accessibilityAddTraits(localFilter.selectedCategories.contains(category) ? .isSelected : [])
                    .accessibilityHint(
                        localFilter.selectedCategories.contains(category)
                            ? String(localized: "Tap to deselect this category")
                            : String(localized: "Tap to filter by this category")
                    )
                }
            }
        } header: {
            HStack {
                Label(String(localized: "Categories"), systemImage: "folder")
                Spacer()
                if !localFilter.selectedCategories.isEmpty {
                    Text("\(localFilter.selectedCategories.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Account Section

    private var accountSection: some View {
        Section {
            if availableAccounts.isEmpty {
                Text(String(localized: "No accounts available"))
                    .foregroundStyle(.secondary)
                    .font(.caption)
            } else {
                Picker(String(localized: "Account"), selection: Binding(
                    get: { localFilter.selectedAccount ?? "" },
                    set: { localFilter.selectedAccount = $0.isEmpty ? nil : $0 }
                )) {
                    Text(String(localized: "All Accounts"))
                        .tag("")
                    ForEach(availableAccounts, id: \.self) { account in
                        Text(account).tag(account)
                    }
                }
                .accessibilityLabel(String(localized: "Account filter"))
                .accessibilityHint(String(localized: "Select an account to filter transactions"))
            }
        } header: {
            Label(String(localized: "Account"), systemImage: "building.columns")
        }
    }

    // MARK: - Type Section

    private var typeSection: some View {
        Section {
            ForEach(TransactionTypeUI.allCases, id: \.self) { type in
                Button {
                    toggleType(type)
                } label: {
                    HStack {
                        Image(systemName: type.systemImage)
                            .foregroundStyle(type.color)
                            .frame(width: 24)
                        Text(type.displayName)
                            .foregroundStyle(.primary)
                        Spacer()
                        if localFilter.selectedTypes.contains(type) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                                .fontWeight(.semibold)
                        }
                    }
                }
                .accessibilityLabel(type.displayName)
                .accessibilityAddTraits(localFilter.selectedTypes.contains(type) ? .isSelected : [])
                .accessibilityHint(
                    localFilter.selectedTypes.contains(type)
                        ? String(localized: "Tap to deselect this type")
                        : String(localized: "Tap to filter by this type")
                )
            }
        } header: {
            Label(String(localized: "Type"), systemImage: "arrow.left.arrow.right")
        }
    }

    // MARK: - Status Section

    private var statusSection: some View {
        Section {
            ForEach(TransactionStatusUI.allCases, id: \.self) { status in
                Button {
                    toggleStatus(status)
                } label: {
                    HStack {
                        Text(status.displayName)
                            .foregroundStyle(.primary)
                        Spacer()
                        if localFilter.selectedStatuses.contains(status) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                                .fontWeight(.semibold)
                        }
                    }
                }
                .accessibilityLabel(status.displayName)
                .accessibilityAddTraits(localFilter.selectedStatuses.contains(status) ? .isSelected : [])
                .accessibilityHint(
                    localFilter.selectedStatuses.contains(status)
                        ? String(localized: "Tap to deselect this status")
                        : String(localized: "Tap to filter by this status")
                )
            }
        } header: {
            Label(String(localized: "Status"), systemImage: "checkmark.circle")
        }
    }

    // MARK: - Actions

    private func toggleCategory(_ category: String) {
        if localFilter.selectedCategories.contains(category) {
            localFilter.selectedCategories.remove(category)
        } else {
            localFilter.selectedCategories.insert(category)
        }
    }

    private func toggleType(_ type: TransactionTypeUI) {
        if localFilter.selectedTypes.contains(type) {
            localFilter.selectedTypes.remove(type)
        } else {
            localFilter.selectedTypes.insert(type)
        }
    }

    private func toggleStatus(_ status: TransactionStatusUI) {
        if localFilter.selectedStatuses.contains(status) {
            localFilter.selectedStatuses.remove(status)
        } else {
            localFilter.selectedStatuses.insert(status)
        }
    }
}

// MARK: - Filter Chips Bar

/// Inline scrollable row of active filter chips with remove action.
struct FilterChipsBar: View {
    let labels: [FilterLabel]
    var onRemove: (FilterLabel) -> Void
    var onClearAll: () -> Void

    var body: some View {
        if !labels.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(labels) { label in
                        filterChip(label)
                    }

                    Button {
                        onClearAll()
                    } label: {
                        Text(String(localized: "Clear All"))
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(.red.opacity(0.1), in: Capsule())
                    }
                    .accessibilityLabel(String(localized: "Clear all filters"))
                    .accessibilityHint(String(localized: "Removes all active filters"))
                }
                .padding(.horizontal)
                .padding(.vertical, 4)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Active filters"))
        }
    }

    private func filterChip(_ label: FilterLabel) -> some View {
        HStack(spacing: 4) {
            Text(label.text)
                .font(.caption)
                .lineLimit(1)

            Image(systemName: "xmark")
                .font(.system(size: 9, weight: .bold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(.blue)
        .background(.blue.opacity(0.1), in: Capsule())
        .contentShape(Capsule())
        .onTapGesture { onRemove(label) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "Filter: \(label.text)"))
        .accessibilityHint(String(localized: "Tap to remove this filter"))
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var filter = TransactionFilter()
        @State private var sort = TransactionSort()

        var body: some View {
            TransactionFilterSheet(
                filter: $filter,
                sort: $sort,
                availableCategories: ["Groceries", "Dining", "Transport", "Entertainment", "Bills"],
                availableAccounts: ["Main Checking", "Savings", "Credit Card"],
                onApply: {},
                onClear: {}
            )
        }
    }

    return PreviewWrapper()
}
