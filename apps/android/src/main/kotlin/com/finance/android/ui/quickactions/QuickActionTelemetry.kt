// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

import timber.log.Timber

/**
 * Aggregate usefulness telemetry for predictive quick-actions (#2396).
 *
 * The acceptance criteria require tracking how useful the predictions are
 * **without logging transaction details**. Every method therefore accepts only
 * a non-PII [QuickActionType] (a stable action category) plus coarse position /
 * count integers. No amounts, payees, categories, dates, or account identifiers
 * ever cross this boundary.
 */
interface QuickActionTelemetry {
    /** Records that a set of actions was surfaced, with how many were shown. */
    fun onSurfaced(shown: List<QuickActionType>)

    /** Records that the user activated [type] shown at zero-based [position]. */
    fun onActivated(type: QuickActionType, position: Int)

    /** Records that the user dismissed [type]. */
    fun onDismissed(type: QuickActionType)

    /** Records that the user pinned ([pinned]=true) or unpinned [type]. */
    fun onPinChanged(type: QuickActionType, pinned: Boolean)

    /** Records that the user disabled [type] (opt-out). */
    fun onDisabled(type: QuickActionType)
}

/**
 * [QuickActionTelemetry] backed by structured Timber logging.
 *
 * Emits only aggregate, non-PII signals. A production build can fan these out
 * to an opt-in metrics collector; the log statements here are deliberately free
 * of any transaction-level data so they are safe even on shared devices.
 */
class TimberQuickActionTelemetry : QuickActionTelemetry {

    override fun onSurfaced(shown: List<QuickActionType>) {
        Timber.tag(TAG).d(
            "surfaced count=%d ids=%s",
            shown.size,
            shown.joinToString(",") { it.id },
        )
    }

    override fun onActivated(type: QuickActionType, position: Int) {
        Timber.tag(TAG).d("activated id=%s position=%d", type.id, position)
    }

    override fun onDismissed(type: QuickActionType) {
        Timber.tag(TAG).d("dismissed id=%s", type.id)
    }

    override fun onPinChanged(type: QuickActionType, pinned: Boolean) {
        Timber.tag(TAG).d("pin_changed id=%s pinned=%b", type.id, pinned)
    }

    override fun onDisabled(type: QuickActionType) {
        Timber.tag(TAG).d("disabled id=%s", type.id)
    }

    private companion object {
        const val TAG = "QuickActions"
    }
}
