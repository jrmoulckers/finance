// SPDX-License-Identifier: BUSL-1.1

// HouseholdViewModel.swift
// Finance
//
// ViewModel for household management — creation, member management,
// invite codes, and activity feed display.
//
// References: #270

import Observation
import os
import SwiftUI

@Observable
final class HouseholdViewModel {
    private let repository: HouseholdRepository
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "HouseholdViewModel"
    )

    // MARK: - State

    var household: HouseholdItem?
    var activityFeed: [HouseholdActivity] = []
    var isLoading = false
    var errorMessage: String?
    var inviteCode: String?
    var showInviteSheet = false
    var showJoinSheet = false
    var joinCode = ""

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    /// Whether the current user has a household.
    var hasHousehold: Bool { household != nil }

    /// Current user's role in the household.
    var currentUserRole: HouseholdRole? {
        household?.members.first { $0.status == .active }?.role
    }

    /// Whether the current user can manage members.
    var canManageMembers: Bool {
        currentUserRole?.canManage ?? false
    }

    // MARK: - Init

    init(
        repository: HouseholdRepository,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.repository = repository
        self.formatter = formatter
    }

    // MARK: - Data Loading

    func loadHousehold() async {
        isLoading = true
        defer { isLoading = false }

        do {
            household = try await repository.getHousehold()
            if let householdId = household?.id {
                activityFeed = try await repository.getActivityFeed(
                    householdId: householdId,
                    limit: 20
                )
            }
            Self.logger.debug(
                "Household loaded: \(self.household?.name ?? "none", privacy: .public)"
            )
        } catch {
            errorMessage = String(localized: "Failed to load household data.")
            Self.logger.error("Household load failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func createHousehold(name: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            household = try await repository.createHousehold(name: name)
            Self.logger.info("Household created: \(name, privacy: .public)")
        } catch {
            errorMessage = String(localized: "Failed to create household.")
            Self.logger.error("Household creation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func generateInvite() async {
        guard let householdId = household?.id else { return }

        do {
            inviteCode = try await repository.generateInviteCode(householdId: householdId)
            showInviteSheet = true
        } catch {
            errorMessage = String(localized: "Failed to generate invite code.")
            Self.logger.error("Invite generation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func joinHousehold() async {
        guard !joinCode.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            household = try await repository.joinHousehold(inviteCode: joinCode)
            joinCode = ""
            showJoinSheet = false
            Self.logger.info("Joined household via invite code")
        } catch {
            errorMessage = String(localized: "Invalid or expired invite code.")
            Self.logger.error("Join failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func removeMember(_ memberId: String) async {
        guard let householdId = household?.id else { return }

        do {
            try await repository.removeMember(
                householdId: householdId,
                memberId: memberId
            )
            await loadHousehold()
        } catch {
            errorMessage = String(localized: "Failed to remove member.")
            Self.logger.error("Remove member failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func leaveHousehold() async {
        guard let householdId = household?.id else { return }

        do {
            try await repository.leaveHousehold(householdId: householdId)
            household = nil
            activityFeed = []
        } catch {
            errorMessage = String(localized: "Failed to leave household.")
            Self.logger.error("Leave household failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Formatting

    func formatCurrency(_ amountMinorUnits: Int64, currencyCode: String) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: false
        )
    }
}
