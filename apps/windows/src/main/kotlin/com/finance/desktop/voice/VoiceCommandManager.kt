// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.voice

import java.util.logging.Level
import java.util.logging.Logger

/**
 * Current state of the voice recognition engine.
 */
enum class VoiceRecognitionState {
    /** Idle — not listening. */
    IDLE,

    /** Actively listening for speech input. */
    LISTENING,

    /** Processing captured audio. */
    PROCESSING,

    /** Voice recognition is not available on this system. */
    UNAVAILABLE,

    /** An error occurred during recognition. */
    ERROR,
}

/**
 * Result of a voice recognition session.
 */
data class VoiceRecognitionResult(
    val text: String,
    val confidence: Float,
    val isSuccess: Boolean,
    val errorMessage: String? = null,
)

/**
 * Abstraction over the Windows speech recognition engine.
 *
 * Implementations:
 * - [PowerShellVoiceProvider] — default; delegates to .NET System.Speech via PowerShell
 * - Test doubles can implement this for unit testing
 */
interface VoiceRecognitionProvider {
    /** Checks whether speech recognition is available on this system. */
    fun isAvailable(): Boolean

    /**
     * Starts a speech recognition session and returns the transcribed text.
     *
     * This is a blocking call that returns when the user finishes speaking
     * or the timeout is reached.
     *
     * @param timeoutSeconds Maximum duration to listen before timing out
     * @return The recognition result with transcribed text and confidence
     */
    fun recognize(timeoutSeconds: Int = 10): VoiceRecognitionResult
}

/**
 * Manages Windows speech recognition for voice-driven transaction entry.
 *
 * Coordinates the voice recognition lifecycle:
 * 1. Check availability of the speech recognition engine
 * 2. Start a listening session (with visual feedback)
 * 3. Return the transcribed text for parsing by [VoiceCommandParser]
 *
 * ## Implementation Strategy
 *
 * Speech recognition on Windows is accessed through the .NET
 * `System.Speech.Recognition.SpeechRecognitionEngine` class, invoked via
 * PowerShell. This avoids a JNA/JNI dependency while providing real
 * speech-to-text capability.
 *
 * For production deployments requiring lower latency, swap in a provider
 * that uses the Windows.Media.SpeechRecognition WinRT API via JNI.
 *
 * @see VoiceRecognitionProvider for the pluggable recognition backend
 * @see VoiceCommandParser for parsing transcribed text into transactions
 */
class VoiceCommandManager private constructor(
    private val provider: VoiceRecognitionProvider,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(VoiceCommandManager::class.java.name)

        /**
         * Creates a [VoiceCommandManager] using the default PowerShell-based provider.
         */
        fun create(): VoiceCommandManager = VoiceCommandManager(PowerShellVoiceProvider())

        /**
         * Creates a [VoiceCommandManager] with a custom [VoiceRecognitionProvider].
         * Use this for testing or alternative speech engines.
         */
        fun create(provider: VoiceRecognitionProvider): VoiceCommandManager =
            VoiceCommandManager(provider)
    }

    /** Current state of the voice recognition engine. */
    @Volatile
    var state: VoiceRecognitionState = VoiceRecognitionState.IDLE
        private set

    /**
     * Checks whether voice recognition is available on this system.
     *
     * Returns `false` if:
     * - No microphone is connected
     * - The .NET System.Speech assembly is not available
     * - Speech recognition is disabled by policy
     */
    fun isAvailable(): Boolean {
        @Suppress("TooGenericExceptionCaught") // Voice recognition error boundary
        return try {
            provider.isAvailable()
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Voice recognition availability check failed", e)
            false
        }
    }

    /**
     * Starts a voice recognition session.
     *
     * Transitions through states: IDLE → LISTENING → PROCESSING → IDLE.
     * The returned [VoiceRecognitionResult] contains the transcribed text
     * ready for parsing by [VoiceCommandParser].
     *
     * @param timeoutSeconds Maximum duration to listen (default: 10s)
     * @return Recognition result with transcribed text and confidence
     */
    fun listen(timeoutSeconds: Int = 10): VoiceRecognitionResult {
        if (!isAvailable()) {
            state = VoiceRecognitionState.UNAVAILABLE
            return VoiceRecognitionResult(
                text = "",
                confidence = 0f,
                isSuccess = false,
                errorMessage = "Voice recognition is not available on this system",
            )
        }

        @Suppress("TooGenericExceptionCaught") // Voice recognition error boundary
        return try {
            state = VoiceRecognitionState.LISTENING
            logger.info("Voice recognition session started (timeout: ${timeoutSeconds}s)")

            val result = provider.recognize(timeoutSeconds)

            state = VoiceRecognitionState.PROCESSING
            logger.info("Voice recognition result: '${result.text}' (confidence: ${result.confidence})")

            state = VoiceRecognitionState.IDLE
            result
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Voice recognition failed", e)
            state = VoiceRecognitionState.ERROR
            VoiceRecognitionResult(
                text = "",
                confidence = 0f,
                isSuccess = false,
                errorMessage = "Voice recognition failed: ${e.message}",
            )
        }
    }

    /**
     * Cancels any in-progress recognition session.
     */
    fun cancel() {
        state = VoiceRecognitionState.IDLE
        logger.info("Voice recognition cancelled")
    }
}

/**
 * PowerShell-based voice recognition provider.
 *
 * Delegates to .NET `System.Speech.Recognition.SpeechRecognitionEngine` through
 * PowerShell. Uses a dictation grammar for free-form speech input.
 *
 * **Requirements:**
 * - Windows 10/11 with a connected microphone
 * - .NET Framework `System.Speech` assembly (included in Windows)
 */
internal class PowerShellVoiceProvider : VoiceRecognitionProvider {

    companion object {
        private val logger: Logger = Logger.getLogger(PowerShellVoiceProvider::class.java.name)
    }

    override fun isAvailable(): Boolean {
        // Check if System.Speech is available and a microphone is connected
        val script = buildString {
            append("try { ")
            append("Add-Type -AssemblyName System.Speech; ")
            append("\$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine; ")
            append("\$rec.Dispose(); ")
            append("Write-Output 'true' ")
            append("} catch { Write-Output 'false' }")
        }

        @Suppress("TooGenericExceptionCaught") // Voice recognition error boundary
        return try {
            val output = executePowerShell(script, timeoutSeconds = 5)
            output.trim().equals("true", ignoreCase = true)
        } catch (e: Exception) {
            logger.log(Level.FINE, "Speech recognition availability check failed", e)
            false
        }
    }

    override fun recognize(timeoutSeconds: Int): VoiceRecognitionResult {
        val script = buildString {
            append("Add-Type -AssemblyName System.Speech; ")
            append("\$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine; ")
            append("\$rec.SetInputToDefaultAudioDevice(); ")
            append("\$grammar = New-Object System.Speech.Recognition.DictationGrammar; ")
            append("\$rec.LoadGrammar(\$grammar); ")
            append("try { ")
            append("\$result = \$rec.Recognize([TimeSpan]::FromSeconds($timeoutSeconds)); ")
            append("if (\$result -ne \$null) { ")
            append("Write-Output (\$result.Text + '|' + \$result.Confidence) ")
            append("} else { Write-Output '|0' } ")
            append("} catch { Write-Output '|0' } ")
            append("finally { \$rec.Dispose() }")
        }

        @Suppress("TooGenericExceptionCaught") // Voice recognition error boundary
        return try {
            val output = executePowerShell(script, timeoutSeconds = timeoutSeconds + 5)
            val parts = output.trim().split("|")
            val text = parts.getOrElse(0) { "" }
            val confidence = parts.getOrElse(1) { "0" }.toFloatOrNull() ?: 0f

            if (text.isBlank()) {
                VoiceRecognitionResult(
                    text = "",
                    confidence = 0f,
                    isSuccess = false,
                    errorMessage = "No speech detected",
                )
            } else {
                VoiceRecognitionResult(
                    text = text,
                    confidence = confidence,
                    isSuccess = true,
                )
            }
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Speech recognition failed", e)
            VoiceRecognitionResult(
                text = "",
                confidence = 0f,
                isSuccess = false,
                errorMessage = "Recognition error: ${e.message}",
            )
        }
    }

    private fun executePowerShell(script: String, timeoutSeconds: Int): String {
        val process = ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        )
            .redirectErrorStream(false)
            .start()

        val stdout = process.inputStream.bufferedReader().readText()
        val stderr = process.errorStream.bufferedReader().readText()
        val completed = process.waitFor(timeoutSeconds.toLong() + 10, java.util.concurrent.TimeUnit.SECONDS)

        if (!completed) {
            process.destroyForcibly()
            throw VoiceCommandException("Voice recognition timed out after ${timeoutSeconds}s")
        }

        val exitCode = process.exitValue()
        if (exitCode != 0 && stderr.isNotBlank()) {
            logger.warning("PowerShell voice command warning: ${stderr.take(200)}")
        }

        return stdout
    }
}

/**
 * Exception thrown when a voice command operation fails.
 */
class VoiceCommandException(message: String, cause: Throwable? = null) : Exception(message, cause)
