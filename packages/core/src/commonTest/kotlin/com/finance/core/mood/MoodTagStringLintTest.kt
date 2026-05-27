// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mood

import kotlin.test.Test
import kotlin.test.assertFalse

class MoodTagStringLintTest {
    @Test fun moodTagCopyHasNoClinicalWords() {
        val forbidden = listOf("depression", "anxiety", "stress", "mental health", "disorder", "diagnosis", "therapy", "treatment")
        val copy = listOf(
            MoodTagCopy.SETTINGS_SECTION,
            MoodTagCopy.ALLOW_LABEL,
            MoodTagCopy.ALLOW_DESCRIPTION,
            MoodTagCopy.SYNC_LABEL,
            MoodTagCopy.SYNC_DESCRIPTION,
            MoodTagCopy.ERASE_LABEL,
            MoodTagCopy.ERASE_CONFIRM_TITLE,
            MoodTagCopy.ERASE_CONFIRM_MESSAGE,
            MoodTagCopy.ERASE_CONFIRM_ACTION,
            MoodTagCopy.PICKER_LABEL,
            MoodTagCopy.PICKER_HINT,
            MoodTagCopy.CLEAR_LABEL,
        ).joinToString(" ").lowercase()

        forbidden.forEach { word ->
            assertFalse(copy.contains(word), "Forbidden word in mood tag copy: $word")
        }
    }
}
