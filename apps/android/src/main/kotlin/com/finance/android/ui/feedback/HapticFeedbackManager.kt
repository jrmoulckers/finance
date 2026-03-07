package com.finance.android.ui.feedback

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.content.getSystemService

/**
 * Maps [FinancialEvent]s to distinct haptic-feedback patterns.
 *
 * Pattern catalogue:
 * | Event              | Pattern                        |
 * |--------------------|--------------------------------|
 * | TransactionSaved   | Confirm (single tick)          |
 * | BudgetThreshold    | Warning (two short ticks)      |
 * | GoalMilestone      | Heavy click + confirm          |
 * | SyncComplete       | Light tick                     |
 * | Error              | Reject (three sharp pulses)    |
 *
 * The manager respects the user preference [hapticsEnabled]. When haptics
 * are disabled no vibration is emitted.
 *
 * @param context        Application context for accessing the [Vibrator] service.
 * @param hapticsEnabled Whether haptic feedback is currently enabled by the user.
 */
class HapticFeedbackManager(
    private val context: Context,
    var hapticsEnabled: Boolean = true,
) {
    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService<VibratorManager>()?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    /**
     * Triggers the haptic pattern associated with [event].
     *
     * No-ops silently when [hapticsEnabled] is `false` or the device
     * lacks a vibrator.
     */
    fun triggerEvent(event: FinancialEvent) {
        if (!hapticsEnabled) return
        val vib = vibrator ?: return
        if (!vib.hasVibrator()) return

        when (event) {
            is FinancialEvent.TransactionSaved -> vibrateConfirm(vib)
            is FinancialEvent.BudgetThreshold -> vibrateWarning(vib)
            is FinancialEvent.GoalMilestone -> vibrateGoalMilestone(vib)
            is FinancialEvent.SyncComplete -> vibrateLightTick(vib)
            is FinancialEvent.Error -> vibrateReject(vib)
        }
    }

    // ── Patterns ────────────────────────────────────────────────────────

    /** Single confirm tick. */
    private fun vibrateConfirm(vib: Vibrator) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(DURATION_CLICK_MS)
        }
    }

    /** Two short ticks — budget warning. */
    private fun vibrateWarning(vib: Vibrator) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createWaveform(
                longArrayOf(0, DURATION_TICK_MS, GAP_SHORT_MS, DURATION_TICK_MS),
                -1, // no repeat
            )
            vib.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(longArrayOf(0, DURATION_TICK_MS, GAP_SHORT_MS, DURATION_TICK_MS), -1)
        }
    }

    /** Heavy click followed by a confirm tick — goal milestone. */
    private fun vibrateGoalMilestone(vib: Vibrator) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
            // The predefined effect is short; queue a confirm after a brief gap.
            vib.vibrate(
                VibrationEffect.createOneShot(DURATION_CLICK_MS, VibrationEffect.DEFAULT_AMPLITUDE),
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createWaveform(
                longArrayOf(0, DURATION_HEAVY_MS, GAP_SHORT_MS, DURATION_CLICK_MS),
                -1,
            )
            vib.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(longArrayOf(0, DURATION_HEAVY_MS, GAP_SHORT_MS, DURATION_CLICK_MS), -1)
        }
    }

    /** Single light tick — sync complete. */
    private fun vibrateLightTick(vib: Vibrator) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vib.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(DURATION_TICK_MS)
        }
    }

    /** Three sharp pulses — error / rejection. */
    private fun vibrateReject(vib: Vibrator) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createWaveform(
                longArrayOf(
                    0, DURATION_REJECT_MS, GAP_SHORT_MS,
                    DURATION_REJECT_MS, GAP_SHORT_MS,
                    DURATION_REJECT_MS,
                ),
                -1,
            )
            vib.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(
                longArrayOf(
                    0, DURATION_REJECT_MS, GAP_SHORT_MS,
                    DURATION_REJECT_MS, GAP_SHORT_MS,
                    DURATION_REJECT_MS,
                ),
                -1,
            )
        }
    }

    companion object {
        private const val DURATION_CLICK_MS = 50L
        private const val DURATION_TICK_MS = 30L
        private const val DURATION_HEAVY_MS = 80L
        private const val DURATION_REJECT_MS = 40L
        private const val GAP_SHORT_MS = 60L
    }
}

/**
 * Remembers a [HapticFeedbackManager] scoped to the current Compose context.
 *
 * @param hapticsEnabled Whether haptics are enabled (e.g. from user preferences).
 */
@Composable
fun rememberHapticFeedbackManager(hapticsEnabled: Boolean = true): HapticFeedbackManager {
    val context = LocalContext.current
    return remember(context, hapticsEnabled) {
        HapticFeedbackManager(context = context, hapticsEnabled = hapticsEnabled)
    }
}
