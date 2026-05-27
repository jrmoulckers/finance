// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.receipt

import com.finance.core.dataimport.ExtractedReceiptText
import com.finance.core.dataimport.parseReceiptText
import java.nio.file.Path
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Windows receipt OCR adapter backed by the built-in Windows.Media.Ocr API.
 *
 * The adapter invokes local Windows Runtime OCR through PowerShell and parses
 * the recognised text with the shared import parser. It does not call an app
 * backend or any network OCR service.
 */
class WindowsMediaOcrReceiptAdapter {
    /** OCRs [imagePath] using Windows.Media.Ocr and returns the shared contract. */
    suspend fun extract(imagePath: Path): ExtractedReceiptText = withContext(Dispatchers.IO) {
        val rawText = runWindowsMediaOcr(imagePath)
        parseReceiptText(rawText = rawText, ocrConfidence = null)
    }

    /** Offline smoke-test path for known fixtures where OCR text is preloaded. */
    fun extractFromRecognizedText(rawText: String, confidence: Double? = null): ExtractedReceiptText =
        parseReceiptText(rawText = rawText, ocrConfidence = confidence)

    private fun runWindowsMediaOcr(imagePath: Path): String {
        val script = """
            Add-Type -AssemblyName System.Runtime.WindowsRuntime
            ${'$'}path = ${'$'}args[0]
            ${'$'}file = [Windows.Storage.StorageFile]::GetFileFromPathAsync(${'$'}path).GetAwaiter().GetResult()
            ${'$'}stream = ${'$'}file.OpenAsync([Windows.Storage.FileAccessMode]::Read).GetAwaiter().GetResult()
            ${'$'}decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync(${'$'}stream).GetAwaiter().GetResult()
            ${'$'}bitmap = ${'$'}decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()
            ${'$'}engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
            ${'$'}result = ${'$'}engine.RecognizeAsync(${'$'}bitmap).GetAwaiter().GetResult()
            ${'$'}result.Text
        """.trimIndent()

        val process = ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
            imagePath.toAbsolutePath().toString(),
        ).redirectErrorStream(true).start()

        val output = process.inputStream.bufferedReader().use { it.readText() }.trim()
        val exitCode = process.waitFor()
        check(exitCode == 0) { "Windows.Media.Ocr failed: $output" }
        return output
    }
}
