// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.fake

import com.finance.sync.SyncConfig
import com.finance.sync.delta.InMemorySequenceTracker
import com.finance.sync.delta.SequenceTracker
import com.finance.sync.queue.InMemoryMutationQueue
import com.finance.sync.queue.MutationQueue
import org.koin.dsl.module

/**
 * Koin module providing fake sync infrastructure for E2E tests.
 *
 * Replaces production sync wiring with in-memory implementations
 * so that tests run without network/Supabase/PowerSync dependencies.
 * No real sync operations are performed — all data stays in-memory.
 */
val e2eSyncModule = module {

    // ── Sync configuration — points to a fake endpoint ──────────────────
    single {
        SyncConfig(
            endpoint = "https://fake-e2e.powersync.test",
            databaseName = "e2e_test.db",
        )
    }

    // ── Mutation queue — in-memory, no persistence ──────────────────────
    single<MutationQueue> { InMemoryMutationQueue() }

    // ── Sequence tracking — in-memory ───────────────────────────────────
    single<SequenceTracker> { InMemorySequenceTracker() }
}
