// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.receipt

import com.finance.android.receipt.ReceiptCaptureOutcome
import com.finance.android.receipt.ReceiptImageCapture
import com.finance.android.receipt.ReceiptImageRef
import com.finance.android.receipt.ReceiptImageRetentionStore
import com.finance.android.receipt.ReceiptPaymentHint
import com.finance.android.receipt.ReceiptTextRecognizer
import com.finance.core.dataimport.ExtractedReceiptText
import com.finance.core.dataimport.parseReceiptText
import com.finance.models.types.Cents
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * JVM unit tests for [ReceiptScanViewModel] (#2388).
 *
 * Drives the capture → OCR → review flow with fakes to verify state
 * transitions, opt-in-only image retention, correction handling, and the
 * manual-entry fallback when the camera/OCR is unavailable.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReceiptScanViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @BeforeTest
    fun setUp() = Dispatchers.setMain(dispatcher)

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    private class FakeImageRef(override val id: String = "img-1") : ReceiptImageRef

    private class FakeCapture(
        override val isAvailable: Boolean = true,
        private val outcome: ReceiptCaptureOutcome = ReceiptCaptureOutcome.Success(FakeImageRef()),
    ) : ReceiptImageCapture {
        override suspend fun capture(): ReceiptCaptureOutcome = outcome
    }

    private class FakeRecognizer(
        override val isAvailable: Boolean = true,
        private val result: Result<ExtractedReceiptText> = Result.success(
            parseReceiptText("Cafe Roma\n2024-05-01\nLatte 4.50\nSales Tax 0.40\nTotal 4.90\nVISA"),
        ),
    ) : ReceiptTextRecognizer {
        override suspend fun recognize(image: ReceiptImageRef): Result<ExtractedReceiptText> = result
    }

    private class RecordingRetentionStore : ReceiptImageRetentionStore {
        var retained = 0
        var discarded = 0
        override suspend fun retain(image: ReceiptImageRef): Result<Unit> {
            retained++
            return Result.success(Unit)
        }

        override suspend fun discard(image: ReceiptImageRef) {
            discarded++
        }
    }

    @Test
    fun `successful scan produces a reviewable draft`() = runTest(dispatcher) {
        val store = RecordingRetentionStore()
        val vm = ReceiptScanViewModel(FakeCapture(), FakeRecognizer(), store)

        vm.startScan()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(ReceiptScanPhase.Review, state.phase)
        assertNotNull(state.draft)
        assertEquals("Cafe Roma", state.draft?.merchant?.value)
        assertEquals(Cents.fromDollars(4.90), state.draft?.total?.value)
        assertEquals(ReceiptPaymentHint.VISA, state.draft?.paymentHint?.value)
    }

    @Test
    fun `image is discarded when retention opt-in is off`() = runTest(dispatcher) {
        val store = RecordingRetentionStore()
        val vm = ReceiptScanViewModel(FakeCapture(), FakeRecognizer(), store)

        vm.startScan()
        advanceUntilIdle()

        assertEquals(0, store.retained)
        assertEquals(1, store.discarded)
    }

    @Test
    fun `image is retained only after explicit opt-in`() = runTest(dispatcher) {
        val store = RecordingRetentionStore()
        val vm = ReceiptScanViewModel(FakeCapture(), FakeRecognizer(), store)

        vm.onRetainImageOptInChanged(true)
        vm.startScan()
        advanceUntilIdle()

        assertEquals(1, store.retained)
        assertEquals(0, store.discarded)
    }

    @Test
    fun `unavailable camera routes to manual fallback`() = runTest(dispatcher) {
        val vm = ReceiptScanViewModel(
            FakeCapture(isAvailable = false),
            FakeRecognizer(isAvailable = false),
            RecordingRetentionStore(),
        )

        vm.startScan()
        advanceUntilIdle()

        assertEquals(ReceiptScanPhase.ManualFallback, vm.uiState.value.phase)
        assertFalse(vm.uiState.value.cameraAvailable)
    }

    @Test
    fun `permission denied routes to manual fallback`() = runTest(dispatcher) {
        val vm = ReceiptScanViewModel(
            FakeCapture(outcome = ReceiptCaptureOutcome.PermissionDenied),
            FakeRecognizer(),
            RecordingRetentionStore(),
        )

        vm.startScan()
        advanceUntilIdle()

        assertEquals(ReceiptScanPhase.ManualFallback, vm.uiState.value.phase)
    }

    @Test
    fun `recognition failure surfaces an error`() = runTest(dispatcher) {
        val vm = ReceiptScanViewModel(
            FakeCapture(),
            FakeRecognizer(result = Result.failure(IllegalStateException("ocr"))),
            RecordingRetentionStore(),
        )

        vm.startScan()
        advanceUntilIdle()

        assertEquals(ReceiptScanPhase.Error, vm.uiState.value.phase)
        assertNotNull(vm.uiState.value.message)
    }

    @Test
    fun `correction clears review flag and confirm emits draft`() = runTest(dispatcher) {
        val vm = ReceiptScanViewModel(
            FakeCapture(),
            FakeRecognizer(
                result = Result.success(
                    ExtractedReceiptText(
                        merchant = null,
                        total = Cents.fromDollars(12.00),
                        rawText = "??\nTotal 12.00",
                        confidence = 20.0,
                    ),
                ),
            ),
            RecordingRetentionStore(),
        )

        vm.startScan()
        advanceUntilIdle()
        assertNull(vm.uiState.value.draft?.merchant?.value)

        vm.correctMerchant("Hardware Store")
        assertEquals("Hardware Store", vm.uiState.value.draft?.merchant?.value)
        assertFalse(vm.uiState.value.draft?.merchant?.needsReview ?: true)

        vm.confirm()
        assertNotNull(vm.uiState.value.confirmedDraft)
        assertTrue(vm.uiState.value.confirmedDraft?.isUsable == true)
    }

    @Test
    fun `confirm is blocked until draft is usable`() = runTest(dispatcher) {
        val vm = ReceiptScanViewModel(
            FakeCapture(),
            FakeRecognizer(
                result = Result.success(
                    ExtractedReceiptText(merchant = null, total = null, rawText = "noise", confidence = 5.0),
                ),
            ),
            RecordingRetentionStore(),
        )

        vm.startScan()
        advanceUntilIdle()

        vm.confirm()
        assertNull(vm.uiState.value.confirmedDraft)
        assertNotNull(vm.uiState.value.message)
    }
}
