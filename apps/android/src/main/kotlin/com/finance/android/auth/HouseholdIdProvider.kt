// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.auth

import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.StateFlow

/**
 * Provides the authenticated user's household ID.
 *
 * The household ID scopes all financial data — accounts, transactions,
 * budgets, goals, and categories — to a specific household. ViewModels
 * inject this provider instead of hard-coding placeholder values.
 *
 * ## Usage
 * ```kotlin
 * class MyViewModel(
 *     private val householdIdProvider: HouseholdIdProvider,
 * ) : ViewModel() {
 *     private suspend fun loadData() {
 *         val id = householdIdProvider.householdId.value ?: return
 *         repository.observeAll(id).first()
 *     }
 * }
 * ```
 *
 * ## Unauthenticated state
 * When no user is signed in, [householdId] emits `null`. Consumers
 * should handle this gracefully — typically by showing empty state
 * or skipping data loads (the navigation graph already gates access
 * to authenticated screens).
 */
interface HouseholdIdProvider {

    /**
     * The current household ID, or `null` if no user is authenticated.
     *
     * Derived from the active [com.finance.sync.auth.AuthSession].
     * The value updates reactively when the user signs in or out.
     */
    val householdId: StateFlow<SyncId?>
}

/**
 * [HouseholdIdProvider] backed by [SupabaseAuthManager].
 *
 * Derives the household ID from the Supabase auth session:
 * - Parses `user.app_metadata.household_id` from the auth response.
 * - Falls back to the user's UUID as the household scope when the
 *   custom claim is absent (single-user household mode).
 * - Emits `null` when no session is active.
 *
 * @property authManager The Android [SupabaseAuthManager] that manages
 *   auth state and exposes the parsed household ID.
 */
class AuthHouseholdIdProvider(
    private val authManager: SupabaseAuthManager,
) : HouseholdIdProvider {

    override val householdId: StateFlow<SyncId?> = authManager.householdId
}
