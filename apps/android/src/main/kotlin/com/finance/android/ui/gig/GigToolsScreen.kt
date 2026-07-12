// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/** Minimum touch target per Material accessibility guidance (drivers tap on the go). */
private val MinTouchTarget = 48.dp

/**
 * **Gig Tools** screen — one place for gig / delivery drivers to see payouts grouped by
 * platform (#2133), track mileage by shift (#2137), and jump to a Schedule C quick-add
 * (#2141).
 *
 * The screen is deliberately large-target and one-handed friendly: primary actions live
 * near the bottom, chips and buttons meet the 48dp minimum, and every control carries a
 * TalkBack content description.
 *
 * @param onBack navigation back callback.
 * @param onLogDeduction opens quick-add so the driver can log a Schedule C deduction.
 * @param viewModel injected [GigToolsViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GigToolsScreen(
    onBack: () -> Unit = {},
    onLogDeduction: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: GigToolsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Gig Tools",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Gig tools screen"
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
        GigToolsContent(
            state = state,
            onStartShift = viewModel::startShift,
            onEndShift = viewModel::endShift,
            onLogDeduction = onLogDeduction,
            modifier = Modifier.padding(padding),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GigToolsContent(
    state: GigToolsUiState,
    onStartShift: (GigPlatform, Int?) -> Unit,
    onEndShift: (Int?) -> Unit,
    onLogDeduction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        MileageSection(state = state, onStartShift = onStartShift, onEndShift = onEndShift)
        PayoutSection(state = state)
        ScheduleCSection(state = state, onLogDeduction = onLogDeduction)
    }
}

// ── Mileage (#2137) ──────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MileageSection(
    state: GigToolsUiState,
    onStartShift: (GigPlatform, Int?) -> Unit,
    onEndShift: (Int?) -> Unit,
) {
    var selectedPlatform by remember { mutableStateOf(GigPlatform.knownPlatforms.first()) }
    var odometer by remember { mutableStateOf("") }

    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Mileage by shift",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                "${state.totalMiles} mi · ${state.totalDeductionFormatted} est. deduction",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics {
                    contentDescription =
                        "Total ${state.totalMiles} business miles, estimated deduction ${state.totalDeductionFormatted}"
                },
            )

            if (!state.hasActiveShift) {
                Text("Platform", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GigPlatform.knownPlatforms.forEach { platform ->
                        val selected = platform == selectedPlatform
                        FilterChip(
                            selected = selected,
                            onClick = { selectedPlatform = platform },
                            label = { Text(platform.displayName) },
                            leadingIcon = if (selected) {
                                { Icon(Icons.Filled.Check, contentDescription = null) }
                            } else {
                                null
                            },
                            modifier = Modifier
                                .sizeIn(minHeight = MinTouchTarget)
                                .semantics {
                                    contentDescription =
                                        if (selected) "${platform.displayName}, selected platform" else platform.displayName
                                },
                        )
                    }
                }
            }

            OutlinedTextField(
                value = odometer,
                onValueChange = { odometer = it.filter(Char::isDigit) },
                label = { Text(if (state.hasActiveShift) "End odometer (mi)" else "Start odometer (mi)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                isError = state.error == GigError.INVALID_MILEAGE,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            if (state.hasActiveShift) "Ending odometer reading in miles" else "Starting odometer reading in miles"
                    },
            )

            if (state.hasActiveShift) {
                Button(
                    onClick = { onEndShift(odometer.toIntOrNull()); odometer = "" },
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = MinTouchTarget)
                        .semantics { contentDescription = "End shift and record mileage" },
                ) {
                    Text("End shift")
                }
            } else {
                Button(
                    onClick = { onStartShift(selectedPlatform, odometer.toIntOrNull()); odometer = "" },
                    modifier = Modifier
                        .fillMaxWidth()
                        .sizeIn(minHeight = MinTouchTarget)
                        .semantics { contentDescription = "Start a driving shift" },
                ) {
                    Text("Start shift")
                }
            }

            val errorText = when (state.error) {
                GigError.INVALID_MILEAGE -> "Check odometer readings — end must be higher than start."
                GigError.SHIFT_ALREADY_ACTIVE -> "A shift is already in progress."
                GigError.NO_ACTIVE_SHIFT -> "No shift is currently active."
                null -> ""
            }
            if (errorText.isNotEmpty()) {
                Text(
                    errorText,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            if (state.shiftRows.isNotEmpty()) {
                HorizontalDivider()
                state.shiftRows.forEach { shift ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            if (shift.isActive) "${shift.platformName} · active" else shift.platformName,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            when {
                                shift.isActive -> "in progress"
                                shift.miles != null -> "${shift.miles} mi · ${shift.deductionFormatted}"
                                else -> "—"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

// ── Payouts grouped by platform (#2133) ────────────────────────────────────────

@Composable
private fun PayoutSection(state: GigToolsUiState) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Payouts by platform",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            if (state.payoutRows.isEmpty()) {
                Text(
                    "No gig payouts detected yet. Income from Uber, DoorDash, Instacart and more will group here automatically.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                Text(
                    "Total ${state.totalPayoutFormatted}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                HorizontalDivider()
                state.payoutRows.forEach { row ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                contentDescription =
                                    "${row.platformName}: ${row.totalFormatted} across ${row.payoutCount} payouts"
                            },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(row.platformName, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                "${row.payoutCount} payouts",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            row.totalFormatted,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

// ── Schedule C presets reference (#2141) ────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScheduleCSection(
    state: GigToolsUiState,
    onLogDeduction: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Schedule C deductions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                "Common gig write-offs. Tap “Log a deduction” to quick-add one with the right Schedule C label.",
                style = MaterialTheme.typography.bodyMedium,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                state.presets.forEach { preset ->
                    AssistChip(
                        onClick = onLogDeduction,
                        label = { Text(preset.label) },
                        modifier = Modifier
                            .sizeIn(minHeight = MinTouchTarget)
                            .semantics {
                                contentDescription = "${preset.label}, ${preset.scheduleCLine}"
                            },
                    )
                }
            }
            OutlinedButton(
                onClick = onLogDeduction,
                modifier = Modifier
                    .fillMaxWidth()
                    .sizeIn(minHeight = MinTouchTarget)
                    .semantics { contentDescription = "Log a Schedule C deduction with quick add" },
            ) {
                Text("Log a deduction")
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Preview(showBackground = true)
@Composable
private fun GigToolsContentPreview() {
    FinanceTheme {
        GigToolsContent(
            state = GigToolsUiState(
                isLoading = false,
                payoutRows = listOf(
                    GigPayoutRowUi("Uber", "$412.50", 6),
                    GigPayoutRowUi("DoorDash", "$188.20", 11),
                ),
                totalPayoutFormatted = "$600.70",
                totalMiles = 214,
                totalDeductionFormatted = "$143.38",
            ),
            onStartShift = { _, _ -> },
            onEndShift = {},
            onLogDeduction = {},
        )
    }
}
