// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

import com.finance.models.HouseholdRole
import com.finance.models.types.SyncId
import kotlin.test.*

class DataPartitioningTest {

    private val ownerId = SyncId("owner-1"); private val partnerId = SyncId("partner-1"); private val memberId = SyncId("member-1"); private val viewerId = SyncId("viewer-1")
    private data class TestItem(val id: String, val ownerId: SyncId, val scope: DataPartitioning.DataScope)
    private val allItems = listOf(TestItem("s1", ownerId, DataPartitioning.DataScope.SHARED), TestItem("s2", partnerId, DataPartitioning.DataScope.SHARED), TestItem("p1", ownerId, DataPartitioning.DataScope.PERSONAL), TestItem("p2", partnerId, DataPartitioning.DataScope.PERSONAL), TestItem("p3", memberId, DataPartitioning.DataScope.PERSONAL))

    @Test fun owner_seesSharedAndOwnPersonal() { val v = DataPartitioning.filterVisible(allItems, ownerId, HouseholdRole.OWNER, { it.ownerId }, { it.scope }); assertEquals(3, v.size); assertTrue(v.any { it.id == "s1" }); assertTrue(v.any { it.id == "p1" }); assertFalse(v.any { it.id == "p2" }) }
    @Test fun partner_seesSharedAndOwnPersonal() { val v = DataPartitioning.filterVisible(allItems, partnerId, HouseholdRole.PARTNER, { it.ownerId }, { it.scope }); assertEquals(3, v.size); assertTrue(v.any { it.id == "p2" }) }
    @Test fun member_seesSharedAndOwnPersonal() { val v = DataPartitioning.filterVisible(allItems, memberId, HouseholdRole.MEMBER, { it.ownerId }, { it.scope }); assertEquals(3, v.size); assertTrue(v.any { it.id == "p3" }) }
    @Test fun viewer_seesOnlyShared() { val v = DataPartitioning.filterVisible(allItems, viewerId, HouseholdRole.VIEWER, { it.ownerId }, { it.scope }); assertEquals(2, v.size); assertTrue(v.all { it.scope == DataPartitioning.DataScope.SHARED }) }

    @Test fun partition_splitsCorrectly() { val r = DataPartitioning.partition(allItems) { it.scope }; assertEquals(2, r.shared.size); assertEquals(3, r.personal.size); assertEquals(5, r.totalCount) }

    @Test fun transactionScope_usesConfig() { val id = SyncId("acct-1"); assertEquals(DataPartitioning.DataScope.SHARED, DataPartitioning.transactionScope(mapOf(id to DataPartitioning.AccountSharingConfig(id, ownerId, DataPartitioning.DataScope.SHARED)), id)) }
    @Test fun transactionScope_defaultsPersonal() { assertEquals(DataPartitioning.DataScope.PERSONAL, DataPartitioning.transactionScope(emptyMap(), SyncId("unknown"))) }

    @Test fun canModify_ownerShared() { assertTrue(DataPartitioning.canModify(ownerId, HouseholdRole.OWNER, partnerId, DataPartitioning.DataScope.SHARED)) }
    @Test fun canModify_partnerShared() { assertTrue(DataPartitioning.canModify(partnerId, HouseholdRole.PARTNER, ownerId, DataPartitioning.DataScope.SHARED)) }
    @Test fun canModify_memberCannotOthersShared() { assertFalse(DataPartitioning.canModify(memberId, HouseholdRole.MEMBER, ownerId, DataPartitioning.DataScope.SHARED)) }
    @Test fun canModify_memberOwnData() { assertTrue(DataPartitioning.canModify(memberId, HouseholdRole.MEMBER, memberId, DataPartitioning.DataScope.SHARED)) }
    @Test fun canModify_viewerNothing() { assertFalse(DataPartitioning.canModify(viewerId, HouseholdRole.VIEWER, viewerId, DataPartitioning.DataScope.PERSONAL)) }
    @Test fun canModify_cannotOthersPersonal() { assertFalse(DataPartitioning.canModify(ownerId, HouseholdRole.OWNER, memberId, DataPartitioning.DataScope.PERSONAL)) }
}
