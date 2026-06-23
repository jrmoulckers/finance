// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.receipt

import com.finance.core.dataimport.ExtractedReceiptText

/**
 * Opaque handle to a captured receipt image (#2388).
 *
 * Decouples the capture pipeline from any concrete bitmap/file type so the
 * orchestration layer and tests never depend on CameraX/Android graphics.
 * Android implementations wrap a `Bitmap` or file URI; tests use fakes.
 */
interface ReceiptImageRef {
    /** Stable identifier used for opt-in retention bookkeeping. */
    val id: String
}

/** Outcome of a single receipt capture attempt. */
sealed interface ReceiptCaptureOutcome {
    /** A frame was captured and is ready for on-device OCR. */
    data class Success(val image: ReceiptImageRef) : ReceiptCaptureOutcome

    /** The camera permission was denied — caller should offer manual entry. */
    data object PermissionDenied : ReceiptCaptureOutcome

    /** No camera/ML Kit available — caller must fall back to manual entry. */
    data object Unavailable : ReceiptCaptureOutcome

    /** The user dismissed the capture UI. */
    data object Cancelled : ReceiptCaptureOutcome

    /** Capture failed; [reason] is a non-sensitive diagnostic string. */
    data class Error(val reason: String) : ReceiptCaptureOutcome
}

/**
 * Captures a receipt frame from the device camera (#2388).
 *
 * Real implementations are backed by CameraX; the orchestration layer depends
 * only on this interface so it stays testable and degrades gracefully when the
 * camera or permission is unavailable.
 */
interface ReceiptImageCapture {
    /** Whether a camera + granted permission are currently available. */
    val isAvailable: Boolean

    /** Captures one frame, suspending until a result is produced. */
    suspend fun capture(): ReceiptCaptureOutcome
}

/**
 * Runs on-device OCR on a captured frame and returns the shared receipt
 * contract (#2388). No image or text ever leaves the device.
 */
interface ReceiptTextRecognizer {
    /** Whether the on-device text recogniser is available. */
    val isAvailable: Boolean

    /** Recognises and parses receipt text from [image]. */
    suspend fun recognize(image: ReceiptImageRef): Result<ExtractedReceiptText>
}

/**
 * Persists captured receipt images **only after explicit opt-in** (#2388).
 *
 * The default implementation discards everything; a real implementation stores
 * to encrypted app storage and is only invoked once the user opts in.
 */
interface ReceiptImageRetentionStore {
    /** Persists [image]; callers must gate this on user opt-in. */
    suspend fun retain(image: ReceiptImageRef): Result<Unit>

    /** Discards any transient copy of [image]. */
    suspend fun discard(image: ReceiptImageRef)
}

/**
 * Capture fallback used until the CameraX pipeline is wired (#2388).
 *
 * Always reports unavailable so the UI routes users to manual entry. This keeps
 * the feature shippable and the app compilable without a device-only dependency.
 */
class UnavailableReceiptImageCapture : ReceiptImageCapture {
    override val isAvailable: Boolean = false
    override suspend fun capture(): ReceiptCaptureOutcome = ReceiptCaptureOutcome.Unavailable
}

/**
 * Privacy-first default retention store: never persists images (#2388).
 *
 * Honors the opt-in-only requirement by discarding by default. Replace with an
 * encrypted-storage implementation when opt-in retention ships.
 */
class NoOpReceiptImageRetentionStore : ReceiptImageRetentionStore {
    override suspend fun retain(image: ReceiptImageRef): Result<Unit> = Result.success(Unit)
    override suspend fun discard(image: ReceiptImageRef) = Unit
}
