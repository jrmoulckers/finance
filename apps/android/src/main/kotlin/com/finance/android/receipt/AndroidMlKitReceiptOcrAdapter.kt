// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.receipt

import android.graphics.Bitmap
import com.finance.core.dataimport.ExtractedReceiptText
import com.finance.core.dataimport.parseReceiptText
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/** Runs receipt OCR on Android using ML Kit Text Recognition v2 on device. */
class AndroidMlKitReceiptOcrAdapter {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    /** Recognises text from [bitmap] and parses it into the shared receipt contract. */
    suspend fun extract(bitmap: Bitmap): ExtractedReceiptText = suspendCancellableCoroutine { continuation ->
        val image = InputImage.fromBitmap(bitmap, 0)
        recognizer.process(image)
            .addOnSuccessListener { visionText ->
                continuation.resume(
                    parseReceiptText(
                        rawText = visionText.text,
                        ocrConfidence = estimateConfidence(visionText.textBlocks.size),
                    ),
                )
            }
            .addOnFailureListener { error -> continuation.resumeWithException(error) }
    }

    private fun estimateConfidence(blockCount: Int): Double = when {
        blockCount >= MANY_TEXT_BLOCKS -> 90.0
        blockCount > 0 -> 75.0
        else -> 0.0
    }

    private companion object {
        private const val MANY_TEXT_BLOCKS = 4
    }
}
