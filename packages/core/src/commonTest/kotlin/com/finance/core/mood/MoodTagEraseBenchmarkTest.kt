// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mood

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.measureTime

class MoodTagEraseBenchmarkTest {
    @Test fun eraseAllMoodData_10kRowsCompletesUnderOneSecond() = runTest {
        val rows = MutableList(10_000) { "😊" as String? }
        val service = MoodTagEraseService(
            store = MoodTagStore {
                var changed = 0
                for (index in rows.indices) {
                    if (rows[index] != null) {
                        rows[index] = null
                        changed++
                    }
                }
                changed
            },
            savePreferences = { assertEquals(MoodTagPreferences(), it) },
        )

        val elapsed = measureTime {
            assertEquals(10_000, service.eraseAll())
        }

        assertTrue(rows.all { it == null })
        assertTrue(elapsed.inWholeMilliseconds < 1_000, "Erase took ${elapsed.inWholeMilliseconds}ms")
    }
}
