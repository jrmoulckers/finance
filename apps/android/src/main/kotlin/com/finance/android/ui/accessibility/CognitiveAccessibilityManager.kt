// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.accessibility

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

/**
 * Manages cognitive accessibility preferences for simplified UI mode.
 *
 * Provides reactive state for UI components to switch between standard
 * and simplified layouts. When simplified mode is active:
 * - Dashboard shows fewer cards with larger text
 * - Touch targets are enlarged to minimum 56dp
 * - Complex financial flows use step-by-step wizards
 * - Terminology is adjusted to plain language
 *
 * ## Persistence
 * All preferences are stored in [SharedPreferences] and survive
 * app restarts.
 *
 * @param prefs App's SharedPreferences instance.
 */
class CognitiveAccessibilityManager(private val prefs: SharedPreferences) {

    internal companion object {
        const val KEY_SIMPLIFIED_MODE = "cognitive_simplified_mode"
        const val KEY_LARGE_TOUCH_TARGETS = "cognitive_large_touch_targets"
        const val KEY_STEP_BY_STEP_WIZARDS = "cognitive_step_by_step"
        const val KEY_PLAIN_LANGUAGE = "cognitive_plain_language"
        const val KEY_REDUCED_ANIMATIONS = "cognitive_reduced_animations"
        const val KEY_FONT_SCALE_MULTIPLIER = "cognitive_font_scale"
    }

    private val _simplifiedMode = MutableStateFlow(
        prefs.getBoolean(KEY_SIMPLIFIED_MODE, false),
    )

    /** Whether simplified UI mode is active. */
    val simplifiedMode: StateFlow<Boolean> = _simplifiedMode.asStateFlow()

    private val _largeTouchTargets = MutableStateFlow(
        prefs.getBoolean(KEY_LARGE_TOUCH_TARGETS, false),
    )

    /** Whether touch targets should be enlarged beyond the 48dp minimum. */
    val largeTouchTargets: StateFlow<Boolean> = _largeTouchTargets.asStateFlow()

    private val _stepByStepWizards = MutableStateFlow(
        prefs.getBoolean(KEY_STEP_BY_STEP_WIZARDS, false),
    )

    /** Whether complex flows should use step-by-step wizards. */
    val stepByStepWizards: StateFlow<Boolean> = _stepByStepWizards.asStateFlow()

    private val _plainLanguage = MutableStateFlow(
        prefs.getBoolean(KEY_PLAIN_LANGUAGE, false),
    )

    /** Whether financial terminology should use plain language. */
    val plainLanguage: StateFlow<Boolean> = _plainLanguage.asStateFlow()

    private val _reducedAnimations = MutableStateFlow(
        prefs.getBoolean(KEY_REDUCED_ANIMATIONS, false),
    )

    /** Whether animations should be reduced or disabled. */
    val reducedAnimations: StateFlow<Boolean> = _reducedAnimations.asStateFlow()

    private val _fontScaleMultiplier = MutableStateFlow(
        prefs.getFloat(KEY_FONT_SCALE_MULTIPLIER, 1.0f),
    )

    /** Additional font scale multiplier (1.0 = normal, 1.5 = 50% larger). */
    val fontScaleMultiplier: StateFlow<Float> = _fontScaleMultiplier.asStateFlow()

    /**
     * Enables or disables simplified UI mode.
     *
     * When enabled, also activates large touch targets, step-by-step
     * wizards, and plain language as a convenience.
     */
    fun setSimplifiedMode(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_SIMPLIFIED_MODE, enabled).apply()
        _simplifiedMode.value = enabled

        if (enabled) {
            setLargeTouchTargets(true)
            setStepByStepWizards(true)
            setPlainLanguage(true)
        }

        Timber.d("Simplified mode: %s", enabled)
    }

    /** Enables or disables enlarged touch targets. */
    fun setLargeTouchTargets(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_LARGE_TOUCH_TARGETS, enabled).apply()
        _largeTouchTargets.value = enabled
    }

    /** Enables or disables step-by-step wizard flows. */
    fun setStepByStepWizards(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_STEP_BY_STEP_WIZARDS, enabled).apply()
        _stepByStepWizards.value = enabled
    }

    /** Enables or disables plain language for financial terms. */
    fun setPlainLanguage(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_PLAIN_LANGUAGE, enabled).apply()
        _plainLanguage.value = enabled
    }

    /** Enables or disables reduced animations. */
    fun setReducedAnimations(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_REDUCED_ANIMATIONS, enabled).apply()
        _reducedAnimations.value = enabled
    }

    /**
     * Sets the additional font scale multiplier.
     *
     * @param multiplier Value between 1.0 and 2.0. Values outside
     *   this range are clamped.
     */
    fun setFontScaleMultiplier(multiplier: Float) {
        val clamped = multiplier.coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE)
        prefs.edit().putFloat(KEY_FONT_SCALE_MULTIPLIER, clamped).apply()
        _fontScaleMultiplier.value = clamped
        Timber.d("Font scale multiplier: %.1f", clamped)
    }

    /**
     * Translates financial terminology to plain language.
     *
     * @param term The financial term to translate.
     * @return The plain-language equivalent, or the original term if
     *   no translation exists or plain language mode is off.
     */
    fun translateTerm(term: String): String {
        if (!_plainLanguage.value) return term
        return PLAIN_LANGUAGE_MAP[term.lowercase()] ?: term
    }
}

/** Minimum font scale multiplier. */
private const val MIN_FONT_SCALE = 1.0f

/** Maximum font scale multiplier. */
private const val MAX_FONT_SCALE = 2.0f

/**
 * Mapping of financial terms to plain-language equivalents.
 */
private val PLAIN_LANGUAGE_MAP = mapOf(
    "net worth" to "Total value of what you own minus what you owe",
    "budget" to "Spending plan",
    "transaction" to "Money in or money out",
    "reconciliation" to "Checking your records match your bank",
    "amortization" to "Spreading payments over time",
    "compound interest" to "Interest earned on interest",
    "liquidity" to "How quickly you can access your money",
    "portfolio" to "Collection of investments",
    "dividend" to "Share of company profits paid to you",
    "depreciation" to "Decrease in value over time",
    "equity" to "What you own after paying debts",
    "liability" to "Money you owe",
    "asset" to "Something you own that has value",
    "principal" to "Original amount borrowed or invested",
    "yield" to "Return on your investment",
    "allocation" to "How your money is divided",
    "rollover" to "Moving leftover money to next period",
)
