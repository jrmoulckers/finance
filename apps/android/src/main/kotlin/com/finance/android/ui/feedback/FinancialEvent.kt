package com.finance.android.ui.feedback

/**
 * Sealed hierarchy of financial events that trigger haptic feedback.
 *
 * Each event maps to a specific vibration pattern via [HapticFeedbackManager].
 */
sealed class FinancialEvent {

    /** A transaction has been successfully saved. */
    data object TransactionSaved : FinancialEvent()

    /**
     * A budget threshold has been reached or exceeded.
     *
     * @property percentUsed The current budget utilisation (0–100+).
     */
    data class BudgetThreshold(val percentUsed: Int) : FinancialEvent()

    /**
     * A savings / investment goal milestone has been reached.
     *
     * @property percentComplete The current goal progress (0–100).
     */
    data class GoalMilestone(val percentComplete: Int) : FinancialEvent()

    /** Background data sync completed successfully. */
    data object SyncComplete : FinancialEvent()

    /**
     * An error occurred that the user should be aware of.
     *
     * @property message A human-readable description of the error.
     */
    data class Error(val message: String) : FinancialEvent()
}
