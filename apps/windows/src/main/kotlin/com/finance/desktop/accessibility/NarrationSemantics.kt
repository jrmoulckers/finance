// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.accessibility

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics

// =============================================================================
// Narration → Compose Desktop semantics / UI Automation mapping
// =============================================================================
//
// Bridges the deterministic narration contract (com.finance.desktop.narration)
// to Compose semantics so Windows Narrator and UI Automation can speak chart
// summaries. This complements the lower-level helpers in `NarratorSupport.kt`
// (labels, headings, roles) with the live-region announcer and the keyboard
// "request / replay narration" path required by issue #2707.

/**
 * Holds the current narration announcement and re-emits it for replay.
 *
 * Narrator/UI Automation only re-announces a polite live region when its text
 * actually changes. To support an explicit "replay" command for the same
 * narration, [announce] toggles an invisible zero-width marker (U+200B) so the
 * string differs each call without changing what is spoken.
 */
@Stable
class NarrationAnnouncer {

    /** The text currently exposed to the live region. */
    var announcement: String by mutableStateOf("")
        private set

    private var nonce = 0

    /** Sets (or re-emits) the announcement, forcing Narrator to speak it again. */
    fun announce(text: String) {
        nonce += 1
        announcement = if (nonce % 2 == 0) text else text + ZERO_WIDTH_SPACE
    }

    private companion object {
        const val ZERO_WIDTH_SPACE = "\u200B"
    }
}

/** Remembers a [NarrationAnnouncer] across recompositions. */
@Composable
fun rememberNarrationAnnouncer(): NarrationAnnouncer = remember { NarrationAnnouncer() }

/**
 * Marks the composable as a polite live region whose announced value is [text].
 *
 * Place on a small, otherwise-empty node fed by a [NarrationAnnouncer] so chart
 * summaries are spoken on update and on explicit replay without the user having
 * to navigate to the element.
 */
fun Modifier.narrationLiveRegion(text: String): Modifier =
    this.semantics {
        liveRegion = LiveRegionMode.Polite
        contentDescription = text
    }

/**
 * Routes the narration "request / replay" shortcut (<kbd>Alt+R</kbd>) to
 * [onReplay] when the host element (e.g. a focused chart panel) has focus.
 *
 * Alt is used (rather than a bare letter) so the shortcut does not collide with
 * Narrator scan-mode quick-navigation keys. Returns `true` to consume the event
 * only when the shortcut matches.
 */
fun Modifier.narrationReplayShortcut(onReplay: () -> Unit): Modifier =
    this.onPreviewKeyEvent { event ->
        if (event.type == KeyEventType.KeyDown && event.isAltPressed && event.key == Key.R) {
            onReplay()
            true
        } else {
            false
        }
    }
