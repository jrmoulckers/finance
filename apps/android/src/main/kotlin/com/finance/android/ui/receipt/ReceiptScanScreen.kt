// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.receipt

import java.util.Locale
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.receipt.ReceiptDraftField
import com.finance.android.receipt.ReceiptPaymentHint
import com.finance.android.receipt.ReceiptTransactionDraft
import com.finance.android.ui.theme.FinanceTheme
import com.finance.models.types.Cents
import org.koin.compose.viewmodel.koinViewModel

/**
 * On-device receipt scanning screen (#2388).
 *
 * Captures a receipt with the camera, runs OCR + parsing entirely on device,
 * and shows a reviewable transaction draft with correction UI for
 * low-confidence fields. Falls back to manual entry when the camera, ML Kit, or
 * camera permission is unavailable. Receipt images are kept only after explicit
 * opt-in.
 *
 * @param onBack navigation callback.
 * @param onDraftConfirmed invoked with the reviewed draft to seed transaction creation.
 * @param onManualEntry invoked when the user chooses manual entry as a fallback.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReceiptScanScreen(
    onBack: () -> Unit = {},
    onDraftConfirmed: (ReceiptTransactionDraft) -> Unit = {},
    onManualEntry: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ReceiptScanViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    state.confirmedDraft?.let { onDraftConfirmed(it) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Scan Receipt",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Scan receipt screen"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        ReceiptScanContent(
            state = state,
            onStartScan = viewModel::startScan,
            onRetainOptInChanged = viewModel::onRetainImageOptInChanged,
            onCorrectMerchant = viewModel::correctMerchant,
            onCorrectTotalDollars = viewModel::correctTotalDollars,
            onCorrectTaxDollars = viewModel::correctTaxDollars,
            onCorrectPaymentHint = viewModel::correctPaymentHint,
            onConfirm = viewModel::confirm,
            onReset = viewModel::reset,
            onManualEntry = onManualEntry,
            modifier = Modifier.padding(padding),
        )
    }
}

@Suppress("LongMethod", "LongParameterList") // Cohesive Compose layout for one screen.
@Composable
internal fun ReceiptScanContent(
    state: ReceiptScanUiState,
    onStartScan: () -> Unit,
    onRetainOptInChanged: (Boolean) -> Unit,
    onCorrectMerchant: (String) -> Unit,
    onCorrectTotalDollars: (Double) -> Unit,
    onCorrectTaxDollars: (Double) -> Unit,
    onCorrectPaymentHint: (ReceiptPaymentHint) -> Unit,
    onConfirm: () -> Unit,
    onReset: () -> Unit,
    onManualEntry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        state.message?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { contentDescription = message },
            )
        }

        when (state.phase) {
            ReceiptScanPhase.Idle, ReceiptScanPhase.Error -> {
                RetentionOptInRow(
                    optIn = state.retainImageOptIn,
                    onChanged = onRetainOptInChanged,
                )
                Button(
                    onClick = onStartScan,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Capture a receipt with the camera" },
                ) {
                    Icon(Icons.Filled.PhotoCamera, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Scan a receipt")
                }
                ManualEntryButton(onManualEntry)
            }

            ReceiptScanPhase.Capturing, ReceiptScanPhase.Recognizing -> {
                val label = if (state.phase == ReceiptScanPhase.Capturing) {
                    "Opening camera…"
                } else {
                    "Reading receipt on device…"
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = label },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    Text(label, style = MaterialTheme.typography.bodyMedium)
                }
            }

            ReceiptScanPhase.ManualFallback -> {
                Text(
                    text = "Scanning isn't available right now. You can still add this receipt by hand.",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.semantics {
                        contentDescription = "Scanning unavailable. Add the receipt manually."
                    },
                )
                ManualEntryButton(onManualEntry)
            }

            ReceiptScanPhase.Review -> state.draft?.let { draft ->
                ReceiptReviewCard(
                    draft = draft,
                    onCorrectMerchant = onCorrectMerchant,
                    onCorrectTotalDollars = onCorrectTotalDollars,
                    onCorrectTaxDollars = onCorrectTaxDollars,
                    onCorrectPaymentHint = onCorrectPaymentHint,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier
                            .weight(1f)
                            .semantics { contentDescription = "Confirm and create transaction from this receipt" },
                    ) {
                        Icon(Icons.Filled.Check, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Create transaction")
                    }
                    IconButton(
                        onClick = onReset,
                        modifier = Modifier.semantics { contentDescription = "Discard and scan another receipt" },
                    ) {
                        Icon(Icons.Filled.Refresh, contentDescription = null)
                    }
                }
            }
        }
    }
}

@Composable
private fun RetentionOptInRow(optIn: Boolean, onChanged: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Keep receipt image: ${if (optIn) "on" else "off"}. " +
                    "Images are stored on device only when this is on."
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Keep receipt image", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                "Off by default. Nothing is uploaded.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = optIn, onCheckedChange = onChanged)
    }
}

@Composable
private fun ManualEntryButton(onManualEntry: () -> Unit) {
    AssistChip(
        onClick = onManualEntry,
        label = { Text("Enter manually instead") },
        leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(18.dp)) },
        modifier = Modifier.semantics { contentDescription = "Enter the receipt details manually instead" },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongParameterList")
@Composable
private fun ReceiptReviewCard(
    draft: ReceiptTransactionDraft,
    onCorrectMerchant: (String) -> Unit,
    onCorrectTotalDollars: (Double) -> Unit,
    onCorrectTaxDollars: (Double) -> Unit,
    onCorrectPaymentHint: (ReceiptPaymentHint) -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Review draft",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            ConfidenceBadge(draft.overallConfidence, draft.fieldsNeedingReview.size)

            CorrectableTextField(
                label = "Merchant",
                field = draft.merchant,
                display = { it },
                onCorrect = onCorrectMerchant,
            )
            CorrectableTextField(
                label = "Total",
                field = draft.total,
                display = { it.toDisplayDollars() },
                onCorrect = { it.toDoubleOrNull()?.let(onCorrectTotalDollars) },
            )
            CorrectableTextField(
                label = "Tax",
                field = draft.tax,
                display = { it.toDisplayDollars() },
                onCorrect = { it.toDoubleOrNull()?.let(onCorrectTaxDollars) },
            )

            Text("Payment", style = MaterialTheme.typography.labelMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ReceiptPaymentHint.entries
                    .filter { it != ReceiptPaymentHint.UNKNOWN }
                    .forEach { hint ->
                        FilterChip(
                            selected = draft.paymentHint.value == hint,
                            onClick = { onCorrectPaymentHint(hint) },
                            label = { Text(hint.label()) },
                            modifier = Modifier.semantics {
                                contentDescription = "Payment ${hint.label()}" +
                                    if (draft.paymentHint.value == hint) ", selected" else ""
                            },
                        )
                    }
            }

            draft.date.value?.let { date ->
                Text(
                    text = "Date: $date",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics { contentDescription = "Date: $date" },
                )
            }
        }
    }
}

@Composable
private fun <T> CorrectableTextField(
    label: String,
    field: ReceiptDraftField<T>,
    display: (T) -> String,
    onCorrect: (String) -> Unit,
) {
    val current = field.value?.let(display) ?: ""
    val reviewHint = if (field.needsReview) " — please review" else ""
    OutlinedTextField(
        value = current,
        onValueChange = onCorrect,
        label = { Text(label + reviewHint) },
        isError = field.needsReview,
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$label field${if (field.needsReview) ", low confidence, please review" else ""}." +
                    " Current value: ${current.ifEmpty { "empty" }}"
            },
    )
}

@Composable
private fun ConfidenceBadge(confidence: Float, needingReview: Int) {
    val color = when {
        confidence >= 0.7f -> Color(0xFF2E7D32)
        confidence >= 0.4f -> Color(0xFFFF9800)
        else -> MaterialTheme.colorScheme.error
    }
    val label = when {
        needingReview == 0 -> "All fields look good"
        else -> "$needingReview field(s) need review"
    }
    Text(
        text = "${(confidence * 100).toInt()}% confident — $label",
        style = MaterialTheme.typography.labelSmall,
        color = color,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.semantics {
            contentDescription = "Parse confidence ${(confidence * 100).toInt()} percent. $label"
        },
    )
}

private fun Cents.toDisplayDollars(): String =
    String.format(Locale.ROOT, "%.2f", amount / 100.0)

private fun ReceiptPaymentHint.label(): String =
    name.lowercase().replaceFirstChar { it.uppercase() }

// ── Previews ────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember")
@Preview(showBackground = true, name = "Receipt Scan - Idle")
@Composable
private fun ReceiptScanIdlePreview() {
    FinanceTheme(dynamicColor = false) {
        ReceiptScanContent(
            state = ReceiptScanUiState(phase = ReceiptScanPhase.Idle),
            onStartScan = {},
            onRetainOptInChanged = {},
            onCorrectMerchant = {},
            onCorrectTotalDollars = {},
            onCorrectTaxDollars = {},
            onCorrectPaymentHint = {},
            onConfirm = {},
            onReset = {},
            onManualEntry = {},
        )
    }
}

@Suppress("UnusedPrivateMember")
@Preview(showBackground = true, name = "Receipt Scan - Review")
@Composable
private fun ReceiptScanReviewPreview() {
    FinanceTheme(dynamicColor = false) {
        ReceiptScanContent(
            state = ReceiptScanUiState(
                phase = ReceiptScanPhase.Review,
                draft = ReceiptTransactionDraft(
                    merchant = ReceiptDraftField("Whole Foods Market", 0.9f, false),
                    total = ReceiptDraftField(Cents(4231), 0.9f, false),
                    tax = ReceiptDraftField(Cents(312), 0.5f, true),
                    paymentHint = ReceiptDraftField(ReceiptPaymentHint.VISA, 0.8f, false),
                    overallConfidence = 0.9f,
                ),
            ),
            onStartScan = {},
            onRetainOptInChanged = {},
            onCorrectMerchant = {},
            onCorrectTotalDollars = {},
            onCorrectTaxDollars = {},
            onCorrectPaymentHint = {},
            onConfirm = {},
            onReset = {},
            onManualEntry = {},
        )
    }
}
