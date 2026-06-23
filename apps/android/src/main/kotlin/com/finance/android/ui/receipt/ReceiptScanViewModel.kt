// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.receipt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.receipt.ReceiptCaptureOutcome
import com.finance.android.receipt.ReceiptDraftMapper
import com.finance.android.receipt.ReceiptImageCapture
import com.finance.android.receipt.ReceiptImageRef
import com.finance.android.receipt.ReceiptImageRetentionStore
import com.finance.android.receipt.ReceiptPaymentHint
import com.finance.android.receipt.ReceiptTextRecognizer
import com.finance.android.receipt.ReceiptTransactionDraft
import com.finance.models.types.Cents
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import timber.log.Timber

/** Phases of the on-device receipt scan flow (#2388). */
enum class ReceiptScanPhase {
    /** Ready to start a capture. */
    Idle,

    /** Camera capture in progress. */
    Capturing,

    /** On-device OCR + parsing in progress. */
    Recognizing,

    /** A draft is ready for review and correction. */
    Review,

    /** Camera/ML Kit/permission unavailable — manual entry offered. */
    ManualFallback,

    /** A recoverable error occurred. */
    Error,
}

/**
 * UI state for the receipt scan flow (#2388).
 *
 * @property phase the current [ReceiptScanPhase].
 * @property draft the reviewable draft, or `null` before recognition.
 * @property retainImageOptIn whether the user opted in to keep the image.
 * @property cameraAvailable whether the capture pipeline is available.
 * @property message a non-sensitive status/error message for the user.
 * @property confirmedDraft set when the user confirms — drives navigation.
 */
data class ReceiptScanUiState(
    val phase: ReceiptScanPhase = ReceiptScanPhase.Idle,
    val draft: ReceiptTransactionDraft? = null,
    val retainImageOptIn: Boolean = false,
    val cameraAvailable: Boolean = true,
    val message: String? = null,
    val confirmedDraft: ReceiptTransactionDraft? = null,
)

/**
 * Orchestrates the on-device receipt scan: capture → OCR → draft → review (#2388).
 *
 * All collaborators are injected behind interfaces so the camera and ML Kit
 * stay decoupled and the flow is fully unit-testable. Receipt images are only
 * retained when the user explicitly opts in; otherwise transient copies are
 * discarded immediately.
 *
 * ## Security
 * Never logs receipt text, amounts, merchant names, or payment hints.
 */
class ReceiptScanViewModel(
    private val capture: ReceiptImageCapture,
    private val recognizer: ReceiptTextRecognizer,
    private val retentionStore: ReceiptImageRetentionStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        ReceiptScanUiState(cameraAvailable = capture.isAvailable && recognizer.isAvailable),
    )
    val uiState: StateFlow<ReceiptScanUiState> = _uiState.asStateFlow()

    /** Starts a capture + recognition pass, or routes to manual entry. */
    fun startScan() {
        if (!capture.isAvailable || !recognizer.isAvailable) {
            Timber.i("Receipt scan unavailable — routing to manual entry")
            _uiState.update {
                it.copy(
                    phase = ReceiptScanPhase.ManualFallback,
                    cameraAvailable = false,
                    message = "Camera or text recognition is unavailable. Enter the receipt manually.",
                )
            }
            return
        }

        _uiState.update { it.copy(phase = ReceiptScanPhase.Capturing, message = null) }
        viewModelScope.launch {
            when (val outcome = capture.capture()) {
                is ReceiptCaptureOutcome.Success -> recognize(outcome.image)
                ReceiptCaptureOutcome.PermissionDenied -> fallback(
                    "Camera permission is required to scan receipts. Enter the receipt manually.",
                )
                ReceiptCaptureOutcome.Unavailable -> fallback(
                    "Camera is unavailable on this device. Enter the receipt manually.",
                )
                ReceiptCaptureOutcome.Cancelled -> _uiState.update {
                    it.copy(phase = ReceiptScanPhase.Idle, message = null)
                }
                is ReceiptCaptureOutcome.Error -> {
                    Timber.w("Receipt capture failed: %s", outcome.reason)
                    _uiState.update {
                        it.copy(phase = ReceiptScanPhase.Error, message = "Capture failed. Please try again.")
                    }
                }
            }
        }
    }

    private suspend fun recognize(image: ReceiptImageRef) {
        _uiState.update { it.copy(phase = ReceiptScanPhase.Recognizing) }

        // Honor opt-in-only retention before any further processing.
        if (_uiState.value.retainImageOptIn) {
            retentionStore.retain(image)
        }

        recognizer.recognize(image)
            .onSuccess { extracted ->
                val draft = ReceiptDraftMapper.fromExtracted(extracted)
                Timber.d(
                    "Receipt parsed: confidence=%.2f, fieldsNeedingReview=%d",
                    draft.overallConfidence,
                    draft.fieldsNeedingReview.size,
                )
                _uiState.update { it.copy(phase = ReceiptScanPhase.Review, draft = draft, message = null) }
            }
            .onFailure { error ->
                Timber.w("Receipt OCR failed: %s", error.message ?: "unknown")
                _uiState.update {
                    it.copy(phase = ReceiptScanPhase.Error, message = "Could not read the receipt. Please try again.")
                }
            }

        if (!_uiState.value.retainImageOptIn) {
            retentionStore.discard(image)
        }
    }

    private fun fallback(message: String) {
        _uiState.update {
            it.copy(phase = ReceiptScanPhase.ManualFallback, message = message)
        }
    }

    /** Toggles the opt-in for retaining the receipt image. */
    fun onRetainImageOptInChanged(optIn: Boolean) {
        _uiState.update { it.copy(retainImageOptIn = optIn) }
    }

    /** Applies a user correction to the merchant field. */
    fun correctMerchant(value: String) = updateDraft { it.copy(merchant = it.merchant.corrected(value.trim())) }

    /** Applies a user correction to the date field. */
    fun correctDate(value: LocalDate) = updateDraft { it.copy(date = it.date.corrected(value)) }

    /** Applies a user correction to the total, supplied as dollars. */
    fun correctTotalDollars(dollars: Double) =
        updateDraft { it.copy(total = it.total.corrected(Cents.fromDollars(dollars).abs())) }

    /** Applies a user correction to the tax, supplied as dollars. */
    fun correctTaxDollars(dollars: Double) =
        updateDraft { it.copy(tax = it.tax.corrected(Cents.fromDollars(dollars).abs())) }

    /** Applies a user correction to the payment-method hint. */
    fun correctPaymentHint(hint: ReceiptPaymentHint) =
        updateDraft { it.copy(paymentHint = it.paymentHint.corrected(hint)) }

    /** Confirms the reviewed draft for transaction creation. */
    fun confirm() {
        val draft = _uiState.value.draft ?: return
        if (!draft.isUsable) {
            _uiState.update { it.copy(message = "Add a merchant and total before saving.") }
            return
        }
        Timber.d("Receipt draft confirmed (confidence=%.2f)", draft.overallConfidence)
        _uiState.update { it.copy(confirmedDraft = draft) }
    }

    /** Clears state to scan another receipt. */
    fun reset() {
        _uiState.update {
            ReceiptScanUiState(cameraAvailable = capture.isAvailable && recognizer.isAvailable)
        }
    }

    private inline fun updateDraft(transform: (ReceiptTransactionDraft) -> ReceiptTransactionDraft) {
        _uiState.update { state ->
            val draft = state.draft ?: return@update state
            state.copy(draft = transform(draft))
        }
    }
}
