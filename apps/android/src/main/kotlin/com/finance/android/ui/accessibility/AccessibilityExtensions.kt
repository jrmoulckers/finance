// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.accessibility

import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.traversalIndex

/**
 * Reusable Compose [Modifier] extensions for TalkBack / Switch Access
 * accessibility across the Finance application.
 *
 * Every interactive or informational Composable **must** use at least
 * [financeSemantic] to provide a content description for screen readers.
 */

/**
 * Combines [contentDescription] and an optional action hint into a single
 * semantic modifier.
 *
 * @param label The primary text that TalkBack will announce for this element.
 * @param hint  An optional action hint (e.g. "Double-tap to open details").
 */
fun Modifier.financeSemantic(label: String, hint: String? = null): Modifier = this.semantics {
    contentDescription = label
    if (hint != null) {
        stateDescription = hint
    }
}

/**
 * Marks this Composable as a heading for assistive technology navigation.
 *
 * TalkBack allows users to jump between headings, making it essential to
 * annotate section titles properly.
 *
 * @param level The logical heading level (1–6). Currently used for
 *              documentation; Compose semantics has a single [heading] flag.
 */
@Suppress("UNUSED_PARAMETER")
fun Modifier.headingLevel(level: Int): Modifier = this.semantics {
    heading()
}

/**
 * Marks this element as a **live region** so that TalkBack automatically
 * announces content changes (e.g. balance updates, sync status).
 *
 * Uses [LiveRegionMode.Polite] to avoid interrupting the current
 * announcement.
 */
fun Modifier.liveRegion(): Modifier = this.semantics {
    liveRegion = LiveRegionMode.Polite
}

/**
 * Sets a custom traversal (reading) order index for this Composable.
 *
 * Lower values are read first. Use this sparingly — only when the default
 * spatial ordering produces an illogical reading sequence.
 *
 * @param index The traversal priority (lower = earlier).
 */
@OptIn(ExperimentalComposeUiApi::class)
fun Modifier.traversalOrder(index: Int): Modifier = this.semantics {
    traversalIndex = index.toFloat()
}
