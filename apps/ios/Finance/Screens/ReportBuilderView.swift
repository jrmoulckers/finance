// SPDX-License-Identifier: BUSL-1.1

// ReportBuilderView.swift
// Finance
//
// Report configuration screen where users select report type, date range,
// and filters (accounts, categories) before generating a report.
// Navigates to ReportResultView upon generation.
//
// References: #1111

import SwiftUI

// MARK: - View

/// Configuration screen for custom report generation.
///
/// Users select a report type, date range, and optional filters
/// before tapping "Generate Report" to see results.
struct ReportBuilderView: View {
    @State private var viewModel: ReportBuilderViewModel
    @State private var showingResult = false

    init(viewModel: ReportBuilderViewModel = ReportBuilderViewModel(
        transactionRepository: RepositoryProvider.shared.transactions,
        accountRepository: RepositoryProvider.shared.accounts,
        categoryRepository: RepositoryProvider.shared.categories
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                reportTypeSection
                dateRangeSection
                generateSection
            }
            .navigationTitle(String(localized: "Report Builder"))
            .task { await viewModel.loadFilterOptions() }
            .navigationDestination(isPresented: $showingResult) {
                if let result = viewModel.reportResult {
                    ReportResultView(result: result, viewModel: viewModel)
                }
            }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Report Type Section

    private var reportTypeSection: some View {
        Section {
            ForEach(ReportType.allCases, id: \.self) { type in
                Button {
                    viewModel.selectedReportType = type
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: type.systemImage)
                            .font(.title3)
                            .foregroundStyle(.blue)
                            .frame(width: 32)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(type.displayName)
                                .font(.body)
                                .fontWeight(.medium)
                                .foregroundStyle(.primary)
                            Text(type.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if viewModel.selectedReportType == type {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                                .fontWeight(.semibold)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(type.displayName)
                .accessibilityValue(
                    viewModel.selectedReportType == type
                        ? String(localized: "Selected")
                        : String(localized: "Not selected")
                )
                .accessibilityHint(type.description)
            }
        } header: {
            Text(String(localized: "Report Type"))
        }
    }

    // MARK: - Date Range Section

    private var dateRangeSection: some View {
        Section {
            Picker(String(localized: "Date Range"), selection: $viewModel.selectedDateRange) {
                ForEach(ReportDateRange.allCases, id: \.self) { range in
                    Text(range.displayName).tag(range)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel(String(localized: "Report date range"))
        } header: {
            Text(String(localized: "Date Range"))
        }
    }

    // MARK: - Generate Section

    private var generateSection: some View {
        Section {
            Button {
                Task {
                    await viewModel.generateReport()
                    if viewModel.reportResult != nil {
                        showingResult = true
                    }
                }
            } label: {
                HStack {
                    Spacer()
                    if viewModel.isGenerating {
                        ProgressView()
                            .accessibilityLabel(String(localized: "Generating report"))
                    } else {
                        Label(String(localized: "Generate Report"), systemImage: "doc.text.magnifyingglass")
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .disabled(viewModel.isGenerating)
            .accessibilityLabel(String(localized: "Generate report"))
            .accessibilityHint(String(localized: "Creates a report with the selected configuration"))
        } footer: {
            Text(String(localized: "Reports are generated from your local transaction data."))
        }
    }
}

#Preview {
    ReportBuilderView(viewModel: ReportBuilderViewModel(
        transactionRepository: MockTransactionRepository(),
        accountRepository: MockAccountRepository(),
        categoryRepository: MockCategoryRepository()
    ))
    .environment(BiometricAuthManager())
}
