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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.finance.desktop.narration.A11yMetadata
import com.finance.desktop.narration.AriaLive
import com.finance.desktop.narration.Narration
import com.finance.desktop.narration.screenReaderText

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

// =============================================================================
// Narration A11yMetadata → Compose semantics descriptor (pure, unit-tested)
// =============================================================================
//
// The narration contract attaches an [A11yMetadata] to every segment carrying
// the spoken text, live-region politeness, role, and heading level. To satisfy
// #2707 ("labels, descriptions, headings, and live regions") the merged chart
// summary node must honour ALL of these — not just the content description.
//
// The mapping is split into a *pure* descriptor (this section) and a thin
// [Modifier] applier (below). Keeping the projection pure lets CI assert the
// label/heading/live-region mapping in plain JVM tests with no Compose UI
// harness or Narrator device.
//
// TODO(human): the pure descriptor mapping is unit-tested here, but the
// end-to-end Narrator/UIA behaviour (does Narrator actually speak the heading
// and re-announce the polite live region on Alt+R?) still needs a manual pass
// on a Windows build. Follow `docs/windows/chart-narration-validation-checklist.md`
// and record the result there — see "## Needs Human Action".

/** Live-region politeness projected onto Compose's [LiveRegionMode]. */
enum class NarrationLiveRegion {
    /** Not a live region — Narrator announces only on focus/navigation. */
    OFF,

    /** Narrator waits for a pause before announcing (routine state). */
    POLITE,

    /** Narrator interrupts to announce (reserved for critical results). */
    ASSERTIVE,
}

/**
 * The UI-Automation-facing projection of a narration's accessibility metadata:
 * the spoken [contentDescription], whether the node is a heading (and at what
 * [headingLevel]), and its [liveRegion] politeness.
 *
 * This is the deterministic seam #2707 asks for — everything Narrator/UIA needs
 * to surface a narration, computed without touching Compose so it is testable.
 */
data class NarrationSemanticsDescriptor(
    val contentDescription: String,
    val headingLevel: Int?,
    val liveRegion: NarrationLiveRegion,
) {
    /** True when this node should be exposed as a UIA heading. */
    val isHeading: Boolean get() = headingLevel != null
}

/** Maps an [AriaLive] value from the contract onto the Compose-facing enum. */
fun AriaLive.toNarrationLiveRegion(): NarrationLiveRegion =
    when (this) {
        AriaLive.OFF -> NarrationLiveRegion.OFF
        AriaLive.POLITE -> NarrationLiveRegion.POLITE
        AriaLive.ASSERTIVE -> NarrationLiveRegion.ASSERTIVE
    }

/** Projects a single segment's [A11yMetadata] to a [NarrationSemanticsDescriptor]. */
fun A11yMetadata.toSemanticsDescriptor(): NarrationSemanticsDescriptor =
    NarrationSemanticsDescriptor(
        contentDescription = screenReaderText,
        headingLevel = headingLevel,
        liveRegion = ariaLive.toNarrationLiveRegion(),
    )

/**
 * Projects a whole [Narration] to a single merged [NarrationSemanticsDescriptor].
 *
 * The spoken label is the headline + every segment ([screenReaderText]) so a
 * Narrator user hears the complete chart summary from one node, while the
 * heading level and live-region politeness are taken from the headline (the
 * node's primary role in the reading order).
 */
fun Narration.toSemanticsDescriptor(): NarrationSemanticsDescriptor =
    NarrationSemanticsDescriptor(
        contentDescription = screenReaderText(),
        headingLevel = headline.a11y.headingLevel,
        liveRegion = headline.a11y.ariaLive.toNarrationLiveRegion(),
    )

// =============================================================================
// Descriptor → Compose Modifier appliers
// =============================================================================

/**
 * Applies [descriptor] to this node's semantics, mapping the narration's label,
 * heading, and live-region politeness onto Compose/UI Automation.
 *
 * @param mergeDescendants when true (default for chart canvases) the node's
 *   children are cleared so Narrator reads the single merged summary instead of
 *   the inaccessible Canvas draw commands.
 */
fun Modifier.narrationSemantics(
    descriptor: NarrationSemanticsDescriptor,
    mergeDescendants: Boolean = true,
): Modifier {
    val apply: androidx.compose.ui.semantics.SemanticsPropertyReceiver.() -> Unit = {
        contentDescription = descriptor.contentDescription
        if (descriptor.isHeading) heading()
        when (descriptor.liveRegion) {
            NarrationLiveRegion.OFF -> Unit
            NarrationLiveRegion.POLITE -> liveRegion = LiveRegionMode.Polite
            NarrationLiveRegion.ASSERTIVE -> liveRegion = LiveRegionMode.Assertive
        }
    }
    return if (mergeDescendants) {
        this.clearAndSetSemantics(apply)
    } else {
        this.semantics(properties = apply)
    }
}

/**
 * Exposes [narration] as a single merged chart-summary node: the spoken
 * summary label, a heading (per the narration's heading level), and the
 * narration's live-region politeness — the full #2707 mapping in one call.
 */
fun Modifier.narrationSemantics(narration: Narration): Modifier =
    narrationSemantics(narration.toSemanticsDescriptor())
