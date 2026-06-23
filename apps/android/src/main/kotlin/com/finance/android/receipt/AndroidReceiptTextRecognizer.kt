// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.receipt

import android.graphics.Bitmap
import com.finance.core.dataimport.ExtractedReceiptText

/**
 * A [ReceiptImageRef] backed by an in-memory [Bitmap] captured on device (#2388).
 *
 * Used by the CameraX capture pipeline to hand a frame to the on-device OCR
 * recogniser without leaking Android graphics types into the orchestration layer.
 */
class BitmapReceiptImageRef(
    override val id: String,
    val bitmap: Bitmap,
) : ReceiptImageRef

/**
 * On-device receipt OCR using ML Kit Text Recognition v2 (#2388).
 *
 * Wraps [AndroidMlKitReceiptOcrAdapter] behind the platform-agnostic
 * [ReceiptTextRecognizer] contract. Recognition runs entirely on device — no
 * image or text is uploaded.
 */
class AndroidReceiptTextRecognizer(
    private val adapter: AndroidMlKitReceiptOcrAdapter = AndroidMlKitReceiptOcrAdapter(),
) : ReceiptTextRecognizer {

    override val isAvailable: Boolean = true

    override suspend fun recognize(image: ReceiptImageRef): Result<ExtractedReceiptText> {
        val bitmap = (image as? BitmapReceiptImageRef)?.bitmap
            ?: return Result.failure(
                IllegalArgumentException("Unsupported image ref: ${image::class.simpleName}"),
            )
        return runCatching { adapter.extract(bitmap) }
    }
}
