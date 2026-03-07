package com.finance.android.security

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * Manages biometric authentication using [BiometricPrompt].
 *
 * The manager prefers **BIOMETRIC_STRONG** (Class 3 — fingerprint / face)
 * and falls back to device credentials (PIN / pattern / password) when
 * strong biometrics are not enrolled.
 *
 * Usage:
 * ```
 * val authManager = BiometricAuthManager()
 * if (authManager.canAuthenticate(activity)) {
 *     authManager.authenticate(
 *         activity = this,
 *         onSuccess = { /* proceed */ },
 *         onError = { msg -> /* show error */ },
 *     )
 * }
 * ```
 */
class BiometricAuthManager {

    /**
     * Returns `true` when the device can authenticate with either strong
     * biometrics **or** device credentials.
     */
    fun canAuthenticate(activity: FragmentActivity): Boolean {
        val biometricManager = BiometricManager.from(activity)
        val strongResult = biometricManager.canAuthenticate(BIOMETRIC_STRONG)
        if (strongResult == BiometricManager.BIOMETRIC_SUCCESS) return true

        // Fall back to device credential check
        val credentialResult = biometricManager.canAuthenticate(DEVICE_CREDENTIAL)
        return credentialResult == BiometricManager.BIOMETRIC_SUCCESS
    }

    /**
     * Shows the system biometric prompt and invokes the appropriate callback.
     *
     * If strong biometrics are enrolled the prompt uses fingerprint/face.
     * Otherwise, it allows device credentials as a fallback.
     *
     * @param activity  The hosting [FragmentActivity].
     * @param onSuccess Called on successful authentication.
     * @param onError   Called with an error message on failure or cancellation.
     */
    fun authenticate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val executor = ContextCompat.getMainExecutor(activity)

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                onError(errString.toString())
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                // Individual attempt failed — the system prompt remains visible
                // and the user can retry, so we do not invoke onError here.
            }
        }

        val biometricPrompt = BiometricPrompt(activity, executor, callback)
        val promptInfo = buildPromptInfo(activity)
        biometricPrompt.authenticate(promptInfo)
    }

    /**
     * Builds a [BiometricPrompt.PromptInfo] with strong-biometric preference
     * and device-credential fallback.
     */
    private fun buildPromptInfo(activity: FragmentActivity): BiometricPrompt.PromptInfo {
        val biometricManager = BiometricManager.from(activity)
        val strongAvailable =
            biometricManager.canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

        return if (strongAvailable) {
            // Strong biometric available — show biometric-only prompt with
            // a negative button that the user can tap to cancel.
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(PROMPT_TITLE)
                .setSubtitle(PROMPT_SUBTITLE)
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .setNegativeButtonText(NEGATIVE_BUTTON_TEXT)
                .build()
        } else {
            // No strong biometric enrolled — allow device credential fallback.
            // Note: setNegativeButtonText must NOT be set when DEVICE_CREDENTIAL
            // is included in the allowed authenticators.
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(PROMPT_TITLE)
                .setSubtitle(PROMPT_SUBTITLE)
                .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
                .build()
        }
    }

    companion object {
        const val PROMPT_TITLE = "Verify your identity"
        const val PROMPT_SUBTITLE = "Use your fingerprint or face to access Finance"
        private const val NEGATIVE_BUTTON_TEXT = "Cancel"
    }
}
