// SPDX-License-Identifier: BUSL-1.1

// DataExportView.swift
// Finance
//
// Enhanced data export screen with date-range filtering, account
// multi-select, format selection, and progress reporting. Navigated
// to from the Settings > Data section after biometric authentication.
// Refs #680

import SwiftUI

// MARK: - DataExportView

struct DataExportView: View {
    @State private var viewModel: DataExportViewModel

    init(viewModel: DataExportViewModel = DataExportViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        Form {
            formatSection
            dateRangeSection
            accountsSection
            summarySection
            exportSection
        }
        .navigationTitle(String(localized: "Export Data"))
        .navigationBarTitleDisplayMode(.large)
        .task { await viewModel.loadAccounts() }
        .overlay { exportProgressOverlay }
        .sheet(isPresented: $viewModel.showingShareSheet) {
            if let url = viewModel.exportedFileURL {
                ExportShareSheetView(fileURL: url)
            }
        }
        .alert(
            String(localized: "Export Failed"),
            isPresented: $viewModel.showingExportError
        ) {
            Button(String(localized: "OK"), role: .cancel) {}
                .accessibilityLabel(String(localized: "Dismiss export error"))
        } message: {
            if let message = viewModel.exportErrorMessage {
                Text(message)
            }
        }
    }

    // MARK: - Format Section

    private var formatSection: some View {
        Section {
            Picker(
                String(localized: "Format"),
                selection: $viewModel.selectedFormat
            ) {
                ForEach(ExportFormat.allCases, id: \.self) { format in
                    Text(format.displayName).tag(format)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel(String(localized: "Export format"))
            .accessibilityHint(
                String(localized: "Select CSV for transactions only, or JSON for all data")
            )
        } header: {
            Text(String(localized: "Format"))
        } footer: {
            Text(
                viewModel.selectedFormat == .csv
                    ? String(localized: "CSV exports transactions only. Compatible with spreadsheet apps.")
                    : String(localized: "JSON exports all data: accounts, transactions, budgets, and goals.")
            )
        }
    }

    // MARK: - Date Range Section

    private var dateRangeSection: some View {
        Section {
            Toggle(isOn: $viewModel.dateFilterEnabled) {
                Label(
                    String(localized: "Filter by Date"),
                    systemImage: "calendar"
                )
            }
            .accessibilityLabel(String(localized: "Filter by date range"))
            .accessibilityHint(
                String(localized: "When enabled, only transactions within the selected date range are exported")
            )
            .accessibilityValue(
                viewModel.dateFilterEnabled
                    ? String(localized: "Enabled")
                    : String(localized: "Disabled")
            )

            if viewModel.dateFilterEnabled {
                DatePicker(
                    String(localized: "Start Date"),
                    selection: $viewModel.startDate,
                    in: ...viewModel.endDate,
                    displayedComponents: .date
                )
                .accessibilityLabel(String(localized: "Export start date"))
                .accessibilityHint(
                    String(localized: "Transactions before this date are excluded")
                )

                DatePicker(
                    String(localized: "End Date"),
                    selection: $viewModel.endDate,
                    in: viewModel.startDate...,
                    displayedComponents: .date
                )
                .accessibilityLabel(String(localized: "Export end date"))
                .accessibilityHint(
                    String(localized: "Transactions after this date are excluded")
                )

                if viewModel.startDate > viewModel.endDate {
                    Label(
                        String(localized: "Start date must be before end date"),
                        systemImage: "exclamationmark.triangle"
                    )
                    .foregroundStyle(.red)
                    .font(.footnote)
                    .accessibilityLabel(
                        String(localized: "Error: Start date must be before end date")
                    )
                }
            }
        } header: {
            Text(String(localized: "Date Range"))
        } footer: {
            if !viewModel.dateFilterEnabled {
                Text(String(localized: "All transactions will be included regardless of date."))
            }
        }
    }

    // MARK: - Accounts Section

    private var accountsSection: some View {
        Section {
            Button {
                viewModel.toggleAllAccounts()
            } label: {
                HStack {
                    Label(
                        String(localized: "All Accounts"),
                        systemImage: viewModel.allAccountsSelected
                            ? "checkmark.circle.fill"
                            : "circle"
                    )
                    Spacer()
                    if !viewModel.allAccountsSelected {
                        Text(
                            String(localized: "\(viewModel.selectedAccountIDs.count) selected")
                        )
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                    }
                }
            }
            .accessibilityLabel(String(localized: "All accounts"))
            .accessibilityHint(
                String(localized: "Toggles between selecting all accounts and deselecting all")
            )
            .accessibilityValue(
                viewModel.allAccountsSelected
                    ? String(localized: "All selected")
                    : String(localized: "\(viewModel.selectedAccountIDs.count) of \(viewModel.availableAccounts.count) selected")
            )

            if !viewModel.hasLoadedAccounts {
                HStack {
                    Spacer()
                    ProgressView()
                        .accessibilityLabel(String(localized: "Loading accounts"))
                    Spacer()
                }
            } else {
                ForEach(viewModel.availableAccounts) { account in
                    Button {
                        viewModel.toggleAccount(account)
                    } label: {
                        HStack {
                            Image(
                                systemName: viewModel.selectedAccountIDs.contains(account.id)
                                    ? "checkmark.circle.fill"
                                    : "circle"
                            )
                            .foregroundStyle(
                                viewModel.selectedAccountIDs.contains(account.id)
                                    ? Color.accentColor
                                    : .secondary
                            )
                            .accessibilityHidden(true)

                            Image(systemName: account.type.systemImage)
                                .foregroundStyle(.secondary)
                                .frame(width: 24)
                                .accessibilityHidden(true)

                            Text(account.name)
                                .font(.body)
                        }
                    }
                    .accessibilityLabel(account.name)
                    .accessibilityHint(
                        String(localized: "Double-tap to toggle selection")
                    )
                    .accessibilityValue(
                        viewModel.selectedAccountIDs.contains(account.id)
                            ? String(localized: "Selected")
                            : String(localized: "Not selected")
                    )
                    .accessibilityAddTraits(
                        viewModel.selectedAccountIDs.contains(account.id)
                            ? .isSelected
                            : []
                    )
                }
            }
        } header: {
            Text(String(localized: "Accounts"))
        } footer: {
            Text(
                String(localized: "Select specific accounts to include, or leave all selected to export everything.")
            )
        }
    }

    // MARK: - Summary Section

    private var summarySection: some View {
        Section(String(localized: "Summary")) {
            Text(viewModel.filterSummary)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .accessibilityLabel(viewModel.filterSummary)
        }
    }

    // MARK: - Export Section

    private var exportSection: some View {
        Section {
            Button {
                Task { await viewModel.exportData() }
            } label: {
                HStack {
                    Spacer()
                    Label(
                        String(localized: "Export"),
                        systemImage: "square.and.arrow.up"
                    )
                    .font(.headline)
                    Spacer()
                }
                .frame(minHeight: 44)
            }
            .disabled(!viewModel.canExport || viewModel.isExporting)
            .accessibilityLabel(String(localized: "Export data"))
            .accessibilityHint(
                String(localized: "Exports your financial data with the selected filters and format")
            )
        }
    }

    // MARK: - Progress Overlay

    @ViewBuilder
    private var exportProgressOverlay: some View {
        if viewModel.isExporting {
            ZStack {
                Color.black.opacity(0.35)
                    .ignoresSafeArea()

                VStack(spacing: 16) {
                    ProgressView(
                        value: viewModel.progressFraction,
                        total: 1.0
                    )
                    .progressViewStyle(.linear)
                    .tint(.accentColor)
                    .frame(width: 200)
                    .accessibilityLabel(
                        String(localized: "Export progress")
                    )
                    .accessibilityValue(
                        String(localized: "\(Int(viewModel.progressFraction * 100)) percent")
                    )

                    Text(viewModel.progressDescription)
                        .foregroundStyle(.white)
                        .font(.subheadline.weight(.medium))
                        .accessibilityLabel(viewModel.progressDescription)

                    Text(
                        String(localized: "\(Int(viewModel.progressFraction * 100))%")
                    )
                    .foregroundStyle(.white.opacity(0.7))
                    .font(.caption)
                    .monospacedDigit()
                }
                .padding(24)
                .background(
                    .ultraThinMaterial,
                    in: RoundedRectangle(cornerRadius: 16)
                )
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                String(localized: "Exporting data, \(viewModel.progressDescription)")
            )
        }
    }
}

// MARK: - ExportShareSheetView

/// Wraps `UIActivityViewController` for sharing export files.
///
/// UIKit is required here because SwiftUI's `ShareLink` does not support
/// sharing arbitrary file URLs produced at runtime. This is the only UIKit
/// usage in the export flow.
private struct ExportShareSheetView: UIViewControllerRepresentable {
    let fileURL: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(
            activityItems: [fileURL],
            applicationActivities: nil
        )
    }

    func updateUIViewController(
        _ uiViewController: UIActivityViewController,
        context: Context
    ) {}
}

// MARK: - Preview

#Preview {
    NavigationStack {
        DataExportView()
    }
}
