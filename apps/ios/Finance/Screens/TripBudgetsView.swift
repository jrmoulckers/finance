// SPDX-License-Identifier: BUSL-1.1

// TripBudgetsView.swift
// Finance
//
// Lists trip/country budgets with per-trip spend progress, plus archived
// trips retained for historical reporting (#2205).

import SwiftUI

struct TripBudgetsView: View {
    @State private var viewModel: TripBudgetsViewModel

    init(viewModel: TripBudgetsViewModel = TripBudgetsViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel(String(localized: "Loading"))
            } else if viewModel.isEmpty {
                EmptyStateView(
                    systemImage: "airplane.departure",
                    title: String(localized: "No Trip Budgets"),
                    message: String(localized: "Create a trip budget for a country or date range — like “Bangkok Jan–Mar” — to plan against local spend."),
                    actionLabel: String(localized: "Create Trip Budget"),
                    action: { viewModel.showingCreate = true }
                )
            } else {
                content
            }
        }
        .navigationTitle(String(localized: "Trip Budgets"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { viewModel.showingCreate = true } label: {
                    Image(systemName: "plus")
                }
                .accessibilityIdentifier("create_trip_budget_button")
                .accessibilityLabel(String(localized: "Create trip budget"))
                .accessibilityHint(String(localized: "Opens a form to create a new trip budget"))
            }
        }
        .sheet(isPresented: $viewModel.showingCreate, onDismiss: { Task { await viewModel.load() } }) {
            TripBudgetCreateView(viewModel: TripBudgetCreateViewModel()) { trip in
                viewModel.save(trip)
            }
        }
        .sheet(item: $viewModel.editingTrip, onDismiss: { Task { await viewModel.load() } }) { trip in
            TripBudgetCreateView(viewModel: TripBudgetCreateViewModel(trip: trip)) { updated in
                viewModel.save(updated)
            }
        }
        .refreshable { await viewModel.load() }
        .task { await viewModel.load() }
    }

    private var content: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if !viewModel.activeTrips.isEmpty {
                    sectionHeader(String(localized: "Active"))
                    ForEach(viewModel.activeTrips) { trip in
                        tripCard(trip, archived: false)
                    }
                }
                if !viewModel.archivedTrips.isEmpty {
                    sectionHeader(String(localized: "Archived"))
                    ForEach(viewModel.archivedTrips) { trip in
                        tripCard(trip, archived: true)
                    }
                }
            }
            .padding()
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title).font(.headline).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.top, 4)
    }

    private func tripCard(_ trip: TripBudget, archived: Bool) -> some View {
        let progress = viewModel.progress(for: trip)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(trip.name).font(.body).fontWeight(.semibold)
                    if !trip.country.isEmpty {
                        Label(trip.country, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(dateRange(trip))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                ProgressRing(
                    progress: progress.fraction,
                    lineWidth: 6,
                    progressColor: progress.isOverBudget ? .red : .green,
                    size: 52
                )
            }

            HStack(spacing: 4) {
                CurrencyLabel(amountInMinorUnits: progress.spentMinorUnits, currencyCode: trip.currencyCode, showSign: false, font: .caption)
                Text(String(localized: "of")).font(.caption).foregroundStyle(.secondary)
                CurrencyLabel(amountInMinorUnits: trip.limitMinorUnits, currencyCode: trip.currencyCode, showSign: false, font: .caption)
                Spacer()
                Text(String(localized: "\(progress.transactionCount) txns"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if progress.containsConversions {
                Label(
                    String(localized: "Includes converted amounts"),
                    systemImage: progress.usedStaleRate ? "exclamationmark.triangle" : "arrow.left.arrow.right"
                )
                .font(.caption2)
                .foregroundStyle(progress.usedStaleRate ? .orange : .secondary)
            }
        }
        .padding()
        .cardBackground(cornerRadius: 12)
        .opacity(archived ? 0.7 : 1)
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .onTapGesture { viewModel.editingTrip = trip }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) { viewModel.delete(trip) } label: {
                Label(String(localized: "Delete"), systemImage: "trash")
            }
            if archived {
                Button { viewModel.unarchive(trip) } label: {
                    Label(String(localized: "Unarchive"), systemImage: "tray.and.arrow.up")
                }
            } else {
                Button { viewModel.archive(trip) } label: {
                    Label(String(localized: "Archive"), systemImage: "archivebox")
                }
                .tint(.gray)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(trip.name)
        .accessibilityValue(
            String(localized: "\(Int(progress.fraction * 100)) percent of trip budget spent")
        )
        .accessibilityHint(String(localized: "Double tap to edit this trip budget"))
    }

    private func dateRange(_ trip: TripBudget) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return "\(formatter.string(from: trip.startDate)) – \(formatter.string(from: trip.endDate))"
    }
}

#Preview {
    NavigationStack {
        TripBudgetsView(viewModel: TripBudgetsViewModel(
            store: InMemoryTripBudgetStore(trips: [
                TripBudget(
                    name: "Bangkok Jan–Mar",
                    country: "Thailand",
                    currencyCode: "THB",
                    limitMinorUnits: 8_000_00,
                    startDate: .now,
                    endDate: Calendar.current.date(byAdding: .day, value: 60, to: .now) ?? .now
                )
            ]),
            transactionRepository: MockTransactionRepository()
        ))
    }
}
