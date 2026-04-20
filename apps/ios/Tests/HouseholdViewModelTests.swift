// SPDX-License-Identifier: BUSL-1.1

// HouseholdViewModelTests.swift
// FinanceTests
//
// Tests for HouseholdViewModel — household CRUD, member management,
// invite codes, and activity feed loading.
//
// References: #270

import XCTest
@testable import FinanceApp

// MARK: - Stub Household Repository

final class StubHouseholdRepository: HouseholdRepository, @unchecked Sendable {
    var householdToReturn: HouseholdItem?
    var activityToReturn: [HouseholdActivity] = []
    var errorToThrow: Error?
    private(set) var createdHouseholdNames: [String] = []
    private(set) var removedMemberIds: [String] = []
    private(set) var leftHouseholdIds: [String] = []
    private(set) var joinedCodes: [String] = []

    func getHousehold() async throws -> HouseholdItem? {
        if let error = errorToThrow { throw error }
        return householdToReturn
    }

    func createHousehold(name: String) async throws -> HouseholdItem {
        if let error = errorToThrow { throw error }
        createdHouseholdNames.append(name)
        return HouseholdItem(
            id: "h-new", name: name, createdAt: .now,
            members: [SampleHouseholdData.ownerMember],
            inviteCode: nil
        )
    }

    func generateInviteCode(householdId: String) async throws -> String {
        if let error = errorToThrow { throw error }
        return "INVITE-ABC123"
    }

    func joinHousehold(inviteCode: String) async throws -> HouseholdItem {
        if let error = errorToThrow { throw error }
        joinedCodes.append(inviteCode)
        return SampleHouseholdData.household
    }

    func removeMember(householdId: String, memberId: String) async throws {
        if let error = errorToThrow { throw error }
        removedMemberIds.append(memberId)
    }

    func updateMemberRole(
        householdId: String,
        memberId: String,
        newRole: HouseholdRole
    ) async throws {
        if let error = errorToThrow { throw error }
    }

    func leaveHousehold(householdId: String) async throws {
        if let error = errorToThrow { throw error }
        leftHouseholdIds.append(householdId)
    }

    func getActivityFeed(
        householdId: String,
        limit: Int
    ) async throws -> [HouseholdActivity] {
        if let error = errorToThrow { throw error }
        return activityToReturn
    }
}

// MARK: - Sample Household Data

enum SampleHouseholdData {
    static let ownerMember = HouseholdMember(
        id: "m1", displayName: "Alice", email: "alice@example.com",
        role: .owner, status: .active, avatarInitials: "AL",
        joinedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )

    static let memberTwo = HouseholdMember(
        id: "m2", displayName: "Bob", email: "bob@example.com",
        role: .member, status: .active, avatarInitials: "BO",
        joinedAt: Date(timeIntervalSince1970: 1_700_100_000)
    )

    static let invitedMember = HouseholdMember(
        id: "m3", displayName: "Charlie", email: "charlie@example.com",
        role: .viewer, status: .invited, avatarInitials: "CH",
        joinedAt: Date(timeIntervalSince1970: 1_700_200_000)
    )

    static let household = HouseholdItem(
        id: "h1", name: "Smith Family",
        createdAt: Date(timeIntervalSince1970: 1_700_000_000),
        members: [ownerMember, memberTwo, invitedMember],
        inviteCode: nil
    )

    static let sampleActivity = HouseholdActivity(
        id: "act1", memberName: "Bob",
        action: .transactionCreated,
        description: "Added grocery expense",
        timestamp: Date(timeIntervalSince1970: 1_700_300_000),
        amountMinorUnits: 85_40,
        currencyCode: "USD"
    )
}

// MARK: - Tests

final class HouseholdViewModelTests: XCTestCase {

    @MainActor
    private func makeViewModel(
        household: HouseholdItem? = SampleHouseholdData.household,
        activity: [HouseholdActivity] = [SampleHouseholdData.sampleActivity],
        error: Error? = nil
    ) -> (HouseholdViewModel, StubHouseholdRepository) {
        let repo = StubHouseholdRepository()
        repo.householdToReturn = household
        repo.activityToReturn = activity
        repo.errorToThrow = error
        let vm = HouseholdViewModel(repository: repo)
        return (vm, repo)
    }

    @MainActor
    func testLoadHouseholdPopulatesData() async {
        let (vm, _) = makeViewModel()

        await vm.loadHousehold()

        XCTAssertNotNil(vm.household)
        XCTAssertEqual(vm.household?.name, "Smith Family")
        XCTAssertFalse(vm.activityFeed.isEmpty)
        XCTAssertFalse(vm.isLoading)
        XCTAssertNil(vm.errorMessage)
    }

    @MainActor
    func testLoadHouseholdWithNoHousehold() async {
        let (vm, _) = makeViewModel(household: nil, activity: [])

        await vm.loadHousehold()

        XCTAssertNil(vm.household)
        XCTAssertFalse(vm.hasHousehold)
        XCTAssertTrue(vm.activityFeed.isEmpty)
    }

    @MainActor
    func testLoadHouseholdErrorSetsMessage() async {
        let (vm, _) = makeViewModel(error: TestError.simulated)

        await vm.loadHousehold()

        XCTAssertNotNil(vm.errorMessage)
        XCTAssertNil(vm.household)
    }

    @MainActor
    func testCreateHouseholdSetsData() async {
        let (vm, repo) = makeViewModel(household: nil, activity: [])

        await vm.createHousehold(name: "New Family")

        XCTAssertNotNil(vm.household)
        XCTAssertEqual(repo.createdHouseholdNames, ["New Family"])
    }

    @MainActor
    func testGenerateInviteSetsCode() async {
        let (vm, _) = makeViewModel()
        await vm.loadHousehold()

        await vm.generateInvite()

        XCTAssertEqual(vm.inviteCode, "INVITE-ABC123")
        XCTAssertTrue(vm.showInviteSheet)
    }

    @MainActor
    func testJoinHouseholdSetsData() async {
        let (vm, repo) = makeViewModel(household: nil, activity: [])
        vm.joinCode = "TEST-CODE"

        await vm.joinHousehold()

        XCTAssertNotNil(vm.household)
        XCTAssertEqual(repo.joinedCodes, ["TEST-CODE"])
        XCTAssertFalse(vm.showJoinSheet)
    }

    @MainActor
    func testJoinHouseholdEmptyCodeDoesNothing() async {
        let (vm, repo) = makeViewModel(household: nil, activity: [])
        vm.joinCode = ""

        await vm.joinHousehold()

        XCTAssertTrue(repo.joinedCodes.isEmpty)
    }

    @MainActor
    func testRemoveMember() async {
        let (vm, repo) = makeViewModel()
        await vm.loadHousehold()

        await vm.removeMember("m2")

        XCTAssertEqual(repo.removedMemberIds, ["m2"])
    }

    @MainActor
    func testLeaveHousehold() async {
        let (vm, repo) = makeViewModel()
        await vm.loadHousehold()

        await vm.leaveHousehold()

        XCTAssertNil(vm.household)
        XCTAssertTrue(vm.activityFeed.isEmpty)
        XCTAssertEqual(repo.leftHouseholdIds, ["h1"])
    }

    @MainActor
    func testCanManageMembers() async {
        let (vm, _) = makeViewModel()
        await vm.loadHousehold()

        // Owner role can manage
        XCTAssertTrue(vm.canManageMembers)
    }

    @MainActor
    func testActiveMemberCount() {
        let household = SampleHouseholdData.household
        // owner + memberTwo = 2 active, invitedMember is .invited
        XCTAssertEqual(household.activeMemberCount, 2)
    }

    @MainActor
    func testHouseholdRolePermissions() {
        XCTAssertTrue(HouseholdRole.owner.canEdit)
        XCTAssertTrue(HouseholdRole.owner.canManage)
        XCTAssertTrue(HouseholdRole.admin.canEdit)
        XCTAssertTrue(HouseholdRole.admin.canManage)
        XCTAssertTrue(HouseholdRole.member.canEdit)
        XCTAssertFalse(HouseholdRole.member.canManage)
        XCTAssertFalse(HouseholdRole.viewer.canEdit)
        XCTAssertFalse(HouseholdRole.viewer.canManage)
    }

    @MainActor
    func testDismissErrorClearsMessage() async {
        let (vm, _) = makeViewModel(error: TestError.simulated)
        await vm.loadHousehold()

        XCTAssertTrue(vm.showError)
        vm.dismissError()
        XCTAssertFalse(vm.showError)
    }
}
