// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.auth

import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Test implementation of [HouseholdIdProvider] for use in unit tests.
 *
 * Provides a mutable household ID that defaults to a well-known test
 * value. Tests can set [_householdId] to `null` to simulate the
 * unauthenticated state.
 *
 * @param initial The initial household ID. Defaults to `SyncId("household-1")`.
 */
class TestHouseholdIdProvider(
    initial: SyncId? = SyncId("household-1"),
) : HouseholdIdProvider {

    private val _householdId = MutableStateFlow(initial)
    override val householdId: StateFlow<SyncId?> = _householdId.asStateFlow()

    /** Update the household ID (or set to `null` to simulate sign-out). */
    fun setHouseholdId(id: SyncId?) {
        _householdId.value = id
    }
}
