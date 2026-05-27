// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.finance.android.receipt.AndroidMlKitReceiptOcrAdapter
import com.finance.core.dataimport.ExtractedReceiptLineItem
import com.finance.core.dataimport.ExtractedReceiptText
import kotlinx.coroutines.launch

/** Android camera/gallery receipt OCR flow backed by on-device ML Kit. */
@Composable
@Suppress("LongMethod")
fun ReceiptOcrScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val adapter = remember { AndroidMlKitReceiptOcrAdapter() }
    var state by remember { mutableStateOf<ReceiptOcrUiState>(ReceiptOcrUiState.Idle) }
    var acceptedItems by remember { mutableStateOf<Set<Int>>(emptySet()) }

    fun process(bitmap: Bitmap) {
        state = ReceiptOcrUiState.Processing
        scope.launch {
            state = try {
                val receipt = adapter.extract(bitmap)
                acceptedItems = receipt.lineItems.indices.toSet()
                ReceiptOcrUiState.Ready(receipt)
            } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
                ReceiptOcrUiState.Error(error.message ?: "Receipt OCR failed")
            }
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) process(bitmap)
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) cameraLauncher.launch(null) else state = ReceiptOcrUiState.Error("Camera permission is required")
    }
    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val bitmap = uri?.let {
            context.contentResolver.openInputStream(it)?.use(BitmapFactory::decodeStream)
        }
        if (bitmap != null) process(bitmap)
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = "Receipt OCR screen" },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Text(
                text = "Scan Receipt",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text("OCR runs on this Android device with ML Kit. Receipt images are not uploaded.")
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            cameraLauncher.launch(null)
                        } else {
                            permissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    },
                ) { Text("Take photo") }
                OutlinedButton(onClick = { galleryLauncher.launch("image/*") }) { Text("Choose image") }
                OutlinedButton(onClick = onBack) { Text("Back") }
            }
        }

        when (val current = state) {
            ReceiptOcrUiState.Idle -> item { Text("Take or choose a receipt image to begin.") }
            ReceiptOcrUiState.Processing -> item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(8.dp))
                    Text("Reading receipt on device…")
                }
            }
            is ReceiptOcrUiState.Error -> item { ErrorCard(current.message) }
            is ReceiptOcrUiState.Ready -> {
                item { ReceiptQuickEntryCard(current.receipt) }
                if (current.receipt.lineItems.isNotEmpty()) {
                    item {
                        Text(
                            text = "Itemized split suggestions",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.semantics { heading() },
                        )
                    }
                    itemsIndexed(current.receipt.lineItems) { index, item ->
                        ReceiptLineItemRow(
                            item = item,
                            accepted = index in acceptedItems,
                            onAcceptedChanged = {
                                acceptedItems = if (index in acceptedItems) {
                                    acceptedItems - index
                                } else {
                                    acceptedItems + index
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptQuickEntryCard(receipt: ExtractedReceiptText) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
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
private fun ReceiptLineItemRow(
    item: ExtractedReceiptLineItem,
    accepted: Boolean,
    onAcceptedChanged: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = accepted, onCheckedChange = { onAcceptedChanged() })
        Column(modifier = Modifier.weight(1f)) {
            Text(item.description)
            Text(
                text = item.suggestedCategory ?: "No category suggestion",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Text("$" + "%.2f".format(item.total.amount / 100.0))
    }
}

@Composable
private fun ErrorCard(message: String) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = message,
            color = MaterialTheme.colorScheme.onErrorContainer,
            modifier = Modifier.padding(16.dp),
        )
    }
}

private sealed interface ReceiptOcrUiState {
    data object Idle : ReceiptOcrUiState
    data object Processing : ReceiptOcrUiState
    data class Ready(val receipt: ExtractedReceiptText) : ReceiptOcrUiState
    data class Error(val message: String) : ReceiptOcrUiState
}
