// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

/**
 * Bridges ranked quick-actions to Android launcher shortcuts (#2396).
 *
 * The ranking model is fully unit-tested on the JVM; publishing the result as
 * **dynamic launcher shortcuts** requires real device/emulator APIs
 * (`ShortcutManagerCompat`, deep-link `Intent`s targeting `MainActivity`) and
 * on-device validation (long-press the launcher icon → confirm shortcuts appear
 * and deep-link correctly). Those steps are intentionally left for a human with
 * a device, per the issue's "native module landing spots" note.
 *
 * This class exposes the device-independent mapping so the human-completed
 * publishing step has a tested, ready-made input.
 */
object QuickActionShortcuts {

    /**
     * Maps ranked actions to immutable shortcut descriptors (id + route),
     * truncated to the platform's typical dynamic-shortcut budget.
     *
     * Pure and unit-testable — no Android imports — so the ranking-to-shortcut
     * contract is verifiable without a device.
     */
    fun toDescriptors(ranked: List<RankedQuickAction>): List<ShortcutDescriptor> =
        ranked.take(MAX_DYNAMIC_SHORTCUTS).map { action ->
            ShortcutDescriptor(
                id = action.type.id,
                shortLabel = action.type.label,
                longLabel = action.type.contentDescription,
                route = action.type.route,
            )
        }

    /**
     * Publishes [descriptors] as dynamic launcher shortcuts.
     *
     * Device-only: must use `ShortcutManagerCompat.setDynamicShortcuts(...)`
     * with deep-link intents and requires emulator/device validation.
     */
    fun publish(descriptors: List<ShortcutDescriptor>) {
        check(descriptors.size <= MAX_DYNAMIC_SHORTCUTS) {
            "Too many dynamic shortcuts: ${descriptors.size} > $MAX_DYNAMIC_SHORTCUTS"
        }
        // TODO(human): Implement on-device dynamic shortcut publishing using
        // ShortcutManagerCompat + deep-link Intents to MainActivity, then
        // validate by long-pressing the launcher icon on a device/emulator.
        // See "## Needs Human Action" in the PR description.
    }

    /** Maximum dynamic shortcuts most launchers will surface. */
    const val MAX_DYNAMIC_SHORTCUTS = 4
}

/**
 * Device-independent description of a single launcher shortcut.
 *
 * @property id Stable, non-PII shortcut id (matches [QuickActionType.id]).
 * @property shortLabel Short launcher label.
 * @property longLabel Longer/accessible label.
 * @property route `FinanceNavHost` route the shortcut deep-links to.
 */
data class ShortcutDescriptor(
    val id: String,
    val shortLabel: String,
    val longLabel: String,
    val route: String,
)
