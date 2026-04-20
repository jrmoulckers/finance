// SPDX-License-Identifier: BUSL-1.1

// HouseholdModels.swift
// Finance
//
// Data models for family/household collaboration features.
// Supports household creation, member management, shared accounts,
// and activity feeds.
//
// References: #270

import SwiftUI

// MARK: - Household

/// A household unit for shared financial management.
struct HouseholdItem: Identifiable, Sendable {
    let id: String
    let name: String
    let createdAt: Date
    let members: [HouseholdMember]
    let inviteCode: String?

    /// Number of active members.
    var activeMemberCount: Int {
        members.filter { $0.status == .active }.count
    }
}

// MARK: - Household Member

/// A member of a household with a defined role.
struct HouseholdMember: Identifiable, Hashable, Sendable {
    let id: String
    let displayName: String
    let email: String
    let role: HouseholdRole
    let status: MemberStatus
    let avatarInitials: String
    let joinedAt: Date

    /// The color assigned to this member for chart differentiation.
    var color: Color {
        let colors: [Color] = [
            ChartColorPalette.blue, ChartColorPalette.purple,
            ChartColorPalette.magenta, ChartColorPalette.orange,
            ChartColorPalette.gold, ChartColorPalette.teal,
        ]
        let hash = abs(id.hashValue)
        return colors[hash % colors.count]
    }
}

/// Role within a household determining permission levels.
enum HouseholdRole: String, CaseIterable, Sendable {
    case owner, admin, member, viewer

    var displayName: String {
        switch self {
        case .owner: String(localized: "Owner")
        case .admin: String(localized: "Admin")
        case .member: String(localized: "Member")
        case .viewer: String(localized: "Viewer")
        }
    }

    var systemImage: String {
        switch self {
        case .owner: "crown"
        case .admin: "person.badge.key"
        case .member: "person"
        case .viewer: "eye"
        }
    }

    /// Whether this role can create transactions and budgets.
    var canEdit: Bool {
        switch self {
        case .owner, .admin, .member: true
        case .viewer: false
        }
    }

    /// Whether this role can manage members and settings.
    var canManage: Bool {
        switch self {
        case .owner, .admin: true
        case .member, .viewer: false
        }
    }
}

/// Membership status within a household.
enum MemberStatus: String, Sendable {
    case active, invited, removed

    var displayName: String {
        switch self {
        case .active: String(localized: "Active")
        case .invited: String(localized: "Invited")
        case .removed: String(localized: "Removed")
        }
    }
}

// MARK: - Shared Account

/// An account shared between household members.
struct SharedAccountItem: Identifiable, Sendable {
    let id: String
    let account: AccountItem
    let sharedWith: [HouseholdMember]
    let permissions: SharedPermission
}

/// Permission level for a shared account.
enum SharedPermission: String, CaseIterable, Sendable {
    case readOnly, contribute, fullAccess

    var displayName: String {
        switch self {
        case .readOnly: String(localized: "View Only")
        case .contribute: String(localized: "Can Add Transactions")
        case .fullAccess: String(localized: "Full Access")
        }
    }
}

// MARK: - Activity Feed

/// An activity entry in the household feed.
struct HouseholdActivity: Identifiable, Sendable {
    let id: String
    let memberName: String
    let action: ActivityAction
    let description: String
    let timestamp: Date
    let amountMinorUnits: Int64?
    let currencyCode: String?
}

/// Types of household activity actions.
enum ActivityAction: String, Sendable {
    case transactionCreated, budgetUpdated, goalContributed
    case memberJoined, memberInvited, accountShared

    var systemImage: String {
        switch self {
        case .transactionCreated: "arrow.left.arrow.right"
        case .budgetUpdated: "chart.pie"
        case .goalContributed: "target"
        case .memberJoined: "person.badge.plus"
        case .memberInvited: "envelope"
        case .accountShared: "person.2"
        }
    }

    var displayName: String {
        switch self {
        case .transactionCreated: String(localized: "Transaction")
        case .budgetUpdated: String(localized: "Budget Update")
        case .goalContributed: String(localized: "Goal Contribution")
        case .memberJoined: String(localized: "Member Joined")
        case .memberInvited: String(localized: "Invitation Sent")
        case .accountShared: String(localized: "Account Shared")
        }
    }
}
