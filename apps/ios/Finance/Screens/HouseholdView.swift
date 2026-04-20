// SPDX-License-Identifier: BUSL-1.1

// HouseholdView.swift
// Finance
//
// Household management screen supporting creation, member management,
// invite sharing, and activity feed display.
//
// References: #270

import SwiftUI

struct HouseholdView: View {
    @State private var viewModel: HouseholdViewModel
    @State private var showCreateSheet = false
    @State private var newHouseholdName = ""
    @State private var confirmLeave = false

    init(repository: HouseholdRepository) {
        _viewModel = State(initialValue: HouseholdViewModel(repository: repository))
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.household == nil {
                    ProgressView(String(localized: "Loading…"))
                        .accessibilityLabel(String(localized: "Loading household"))
                } else if let household = viewModel.household {
                    householdContent(household)
                } else {
                    noHouseholdView
                }
            }
            .navigationTitle(String(localized: "Household"))
            .task {
                await viewModel.loadHousehold()
            }
            .refreshable {
                await viewModel.loadHousehold()
            }
            .alert(
                String(localized: "Error"),
                isPresented: .init(
                    get: { viewModel.showError },
                    set: { if !$0 { viewModel.dismissError() } }
                )
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .sheet(isPresented: $showCreateSheet) {
                createHouseholdSheet
            }
            .sheet(isPresented: $viewModel.showJoinSheet) {
                joinHouseholdSheet
            }
            .sheet(isPresented: $viewModel.showInviteSheet) {
                inviteSheet
            }
            .confirmationDialog(
                String(localized: "Leave Household"),
                isPresented: $confirmLeave,
                titleVisibility: .visible
            ) {
                Button(String(localized: "Leave"), role: .destructive) {
                    Task { await viewModel.leaveHousehold() }
                }
            } message: {
                Text(String(localized: "You will lose access to all shared accounts and data."))
            }
        }
    }

    // MARK: - No Household

    private var noHouseholdView: some View {
        VStack(spacing: 24) {
            EmptyStateView(
                systemImage: "person.2.circle",
                title: String(localized: "No Household"),
                message: String(localized: "Create or join a household to share finances with family.")
            )

            VStack(spacing: 12) {
                Button {
                    showCreateSheet = true
                } label: {
                    Label(String(localized: "Create Household"), systemImage: "plus.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(String(localized: "Create a new household"))
                .accessibilityHint(String(localized: "Opens the household creation form"))

                Button {
                    viewModel.showJoinSheet = true
                } label: {
                    Label(String(localized: "Join with Code"), systemImage: "ticket")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "Join existing household"))
                .accessibilityHint(String(localized: "Enter an invite code to join"))
            }
            .padding(.horizontal, 40)
        }
    }

    // MARK: - Household Content

    @ViewBuilder
    private func householdContent(_ household: HouseholdItem) -> some View {
        List {
            // Members section
            Section {
                ForEach(household.members.filter { $0.status != .removed }) { member in
                    memberRow(member)
                }
            } header: {
                HStack {
                    Text(String(localized: "Members"))
                    Spacer()
                    Text(String(localized: "\(household.activeMemberCount) active"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "Members section, \(household.activeMemberCount) active")
                )
            }

            // Activity feed section
            if !viewModel.activityFeed.isEmpty {
                Section {
                    ForEach(viewModel.activityFeed) { activity in
                        activityRow(activity)
                    }
                } header: {
                    Text(String(localized: "Recent Activity"))
                        .accessibilityAddTraits(.isHeader)
                }
            }

            // Actions section
            Section {
                if viewModel.canManageMembers {
                    Button {
                        Task { await viewModel.generateInvite() }
                    } label: {
                        Label(
                            String(localized: "Invite Member"),
                            systemImage: "person.badge.plus"
                        )
                    }
                    .accessibilityLabel(String(localized: "Invite a new member"))
                    .accessibilityHint(String(localized: "Generates an invite code to share"))
                }

                Button(role: .destructive) {
                    confirmLeave = true
                } label: {
                    Label(
                        String(localized: "Leave Household"),
                        systemImage: "rectangle.portrait.and.arrow.right"
                    )
                }
                .accessibilityLabel(String(localized: "Leave this household"))
                .accessibilityHint(String(localized: "You will lose access to shared data"))
            }
        }
    }

    // MARK: - Member Row

    private func memberRow(_ member: HouseholdMember) -> some View {
        HStack(spacing: 12) {
            Text(member.avatarInitials)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(member.color)
                .clipShape(Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(member.displayName)
                    .font(.body)

                HStack(spacing: 4) {
                    Image(systemName: member.role.systemImage)
                        .font(.caption2)
                    Text(member.role.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityHidden(true)
            }

            Spacer()

            if member.status == .invited {
                Text(String(localized: "Pending"))
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(.orange.opacity(0.15))
                    .clipShape(Capsule())
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "\(member.displayName), \(member.role.displayName)")
        )
        .accessibilityValue(member.status.displayName)
        .contextMenu {
            if viewModel.canManageMembers && member.role != .owner {
                Button(role: .destructive) {
                    Task { await viewModel.removeMember(member.id) }
                } label: {
                    Label(String(localized: "Remove"), systemImage: "person.badge.minus")
                }
                .accessibilityLabel(String(localized: "Remove \(member.displayName)"))
            }
        }
    }

    // MARK: - Activity Row

    private func activityRow(_ activity: HouseholdActivity) -> some View {
        HStack(spacing: 12) {
            Image(systemName: activity.action.systemImage)
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(activity.memberName)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(activity.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                if let amount = activity.amountMinorUnits,
                   let currency = activity.currencyCode {
                    Text(viewModel.formatCurrency(amount, currencyCode: currency))
                        .font(.caption)
                        .fontWeight(.medium)
                }

                Text(activity.timestamp.formatted(.relative(presentation: .named)))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "\(activity.memberName): \(activity.description)")
        )
    }

    // MARK: - Create Sheet

    private var createHouseholdSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        String(localized: "Household Name"),
                        text: $newHouseholdName
                    )
                    .accessibilityLabel(String(localized: "Household name"))
                    .accessibilityHint(String(localized: "Enter a name for your household"))
                } footer: {
                    Text(String(localized: "Choose a name that your family members will recognize."))
                }
            }
            .navigationTitle(String(localized: "Create Household"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) {
                        showCreateSheet = false
                    }
                    .accessibilityLabel(String(localized: "Cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Create")) {
                        Task {
                            await viewModel.createHousehold(name: newHouseholdName)
                            showCreateSheet = false
                        }
                    }
                    .disabled(newHouseholdName.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityLabel(String(localized: "Create household"))
                }
            }
        }
    }

    // MARK: - Join Sheet

    private var joinHouseholdSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        String(localized: "Invite Code"),
                        text: $viewModel.joinCode
                    )
                    .textContentType(.oneTimeCode)
                    .autocorrectionDisabled()
                    .accessibilityLabel(String(localized: "Invite code"))
                    .accessibilityHint(String(localized: "Enter the code shared with you"))
                } footer: {
                    Text(String(localized: "Ask a household member for the invite code."))
                }
            }
            .navigationTitle(String(localized: "Join Household"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) {
                        viewModel.showJoinSheet = false
                    }
                    .accessibilityLabel(String(localized: "Cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Join")) {
                        Task { await viewModel.joinHousehold() }
                    }
                    .disabled(viewModel.joinCode.isEmpty)
                    .accessibilityLabel(String(localized: "Join household"))
                }
            }
        }
    }

    // MARK: - Invite Sheet

    private var inviteSheet: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "person.badge.plus")
                    .font(.system(size: 48))
                    .foregroundStyle(.accent)
                    .accessibilityHidden(true)

                Text(String(localized: "Share this code"))
                    .font(.headline)

                if let code = viewModel.inviteCode {
                    Text(code)
                        .font(.system(.title, design: .monospaced))
                        .fontWeight(.bold)
                        .padding()
                        .background(.fill.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel(String(localized: "Invite code"))
                        .accessibilityValue(code)
                }

                Text(String(localized: "Anyone with this code can join your household."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if let code = viewModel.inviteCode {
                    ShareLink(
                        item: code,
                        subject: Text(String(localized: "Join my Finance household")),
                        message: Text(String(localized: "Use this code to join: \(code)"))
                    ) {
                        Label(String(localized: "Share Code"), systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel(String(localized: "Share invite code"))
                }
            }
            .padding()
            .navigationTitle(String(localized: "Invite"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Done")) {
                        viewModel.showInviteSheet = false
                    }
                    .accessibilityLabel(String(localized: "Done"))
                }
            }
        }
    }
}

#Preview("Household View") {
    HouseholdView(repository: StubHouseholdRepository())
}
