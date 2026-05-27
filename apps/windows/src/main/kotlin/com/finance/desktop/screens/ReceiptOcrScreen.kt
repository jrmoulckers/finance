// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.core.dataimport.ExtractedReceiptLineItem
import com.finance.core.dataimport.ExtractedReceiptText
import com.finance.desktop.receipt.WindowsMediaOcrReceiptAdapter
import java.awt.FileDialog
import java.awt.Frame
import java.nio.file.Path
import kotlinx.coroutines.launch

/** Windows receipt OCR quick-entry flow using Windows.Media.Ocr on device. */
@Composable
@Suppress("LongMethod")
fun ReceiptOcrScreen(modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    val adapter = remember { WindowsMediaOcrReceiptAdapter() }
    var state by remember { mutableStateOf<ReceiptOcrUiState>(ReceiptOcrUiState.Idle) }
    var acceptedItems by remember { mutableStateOf<Set<Int>>(emptySet()) }

    fun scanFile(path: Path) {
        state = ReceiptOcrUiState.Processing
        scope.launch {
            state = try {
                val receipt = adapter.extract(path)
                acceptedItems = receipt.lineItems.indices.toSet()
                ReceiptOcrUiState.Ready(receipt)
            } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
                ReceiptOcrUiState.Error(error.message ?: "Windows.Media.Ocr failed")
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp)
            .semantics { contentDescription = "Receipt OCR screen" },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Scan Receipt",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.semantics { heading() },
        )
        Text("OCR uses Windows.Media.Ocr locally. Receipt images and text are not uploaded.")
        Button(onClick = { chooseImageFile()?.let(::scanFile) }) {
            Text("Choose receipt image")
        }

        when (val current = state) {
            ReceiptOcrUiState.Idle -> Text("Choose a receipt photo or scanned image to begin.")
            ReceiptOcrUiState.Processing -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator()
                Text("Reading receipt on this Windows device…", modifier = Modifier.padding(start = 12.dp))
            }
            is ReceiptOcrUiState.Error -> Text(current.message, color = MaterialTheme.colorScheme.error)
            is ReceiptOcrUiState.Ready -> {
                QuickEntryCard(current.receipt)
                if (current.receipt.lineItems.isNotEmpty()) {
                    Text("Itemized split suggestions", style = MaterialTheme.typography.titleMedium)
                    current.receipt.lineItems.forEachIndexed { index, item ->
                        ReceiptLineItemRow(
                            item = item,
                            accepted = index in acceptedItems,
                            onToggle = {
                                acceptedItems = if (index in acceptedItems) acceptedItems - index else acceptedItems + index
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickEntryCard(receipt: ExtractedReceiptText) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Quick entry", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(value = receipt.merchant.orEmpty(), onValueChange = {}, label = { Text("Merchant") })
            OutlinedTextField(
                value = receipt.total?.let { "%.2f".format(it.amount / 100.0) }.orEmpty(),
                onValueChange = {},
                label = { Text("Total") },
            )
            OutlinedTextField(value = receipt.date?.toString().orEmpty(), onValueChange = {}, label = { Text("Date") })
            Text("Confidence: ${receipt.confidence.toInt()}%")
        }
    }
}

@Composable
private fun ReceiptLineItemRow(item: ExtractedReceiptLineItem, accepted: Boolean, onToggle: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = accepted, onCheckedChange = { onToggle() })
        Column(modifier = Modifier.weight(1f)) {
            Text(item.description)
            Text(item.suggestedCategory ?: "No category suggestion", style = MaterialTheme.typography.bodySmall)
        }
        Text("$" + "%.2f".format(item.total.amount / 100.0))
    }
}

private fun chooseImageFile(): Path? {
    val dialog = FileDialog(null as Frame?, "Choose receipt image", FileDialog.LOAD)
    dialog.file = "*.png;*.jpg;*.jpeg;*.webp"
    dialog.isVisible = true
    val directory = dialog.directory ?: return null
    val file = dialog.file ?: return null
    return Path.of(directory, file)
}

private sealed interface ReceiptOcrUiState {
    data object Idle : ReceiptOcrUiState
    data object Processing : ReceiptOcrUiState
    data class Ready(val receipt: ExtractedReceiptText) : ReceiptOcrUiState
    data class Error(val message: String) : ReceiptOcrUiState
}
