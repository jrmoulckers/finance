// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * Status of a feature's implementation on Android.
 */
enum class ParityStatus(val label: String) {
    COMPLETE("Complete"),
    PARTIAL("Partial"),
    MISSING("Missing"),
}

/**
 * A single feature parity item.
 */
@Immutable
data class ParityItem(
    val feature: String,
    val category: String,
    val status: ParityStatus,
    val notes: String = "",
)

/**
 * Platform parity audit screen showing feature completeness vs iOS/Web/Windows.
 *
 * Displays a categorised list of features with their implementation status
 * on Android. This screen is for internal developer use and is not
 * user-facing in production builds.
 *
 * ## Accessibility
 * - Each card has a descriptive `contentDescription`.
 * - Status icons have text labels for screen readers.
 * - Section headings use heading semantics.
 */
@Composable
fun PlatformParityScreen() {
    val parityItems = buildParityReport()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .semantics { contentDescription = "Platform parity audit" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Android,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(32.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Android Platform Parity",
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.semantics { heading() },
                )
            }
        }

        // Summary counts
        item {
            val complete = parityItems.count { it.status == ParityStatus.COMPLETE }
            val partial = parityItems.count { it.status == ParityStatus.PARTIAL }
            val missing = parityItems.count { it.status == ParityStatus.MISSING }
            ParitySummaryCard(complete, partial, missing)
        }

        // Group by category
        val grouped = parityItems.groupBy { it.category }
        grouped.forEach { (category, items) ->
            item {
                Text(
                    text = category,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .semantics { heading() },
                )
            }
            items(items, key = { it.feature }) { item ->
                ParityItemCard(item)
            }
        }
    }
}

@Composable
private fun ParitySummaryCard(complete: Int, partial: Int, missing: Int) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            SummaryCount("Complete", complete, Color(0xFF2E7D32))
            SummaryCount("Partial", partial, Color(0xFFF57F17))
            SummaryCount("Missing", missing, Color(0xFFC62828))
        }
    }
}

@Composable
private fun SummaryCount(label: String, count: Int, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.semantics {
            contentDescription = "$count features $label"
        },
    ) {
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.headlineLarge,
            color = color,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

@Composable
private fun ParityItemCard(item: ParityItem) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val (icon, tint, desc) = when (item.status) {
                ParityStatus.COMPLETE -> Triple(
                    Icons.Default.CheckCircle,
                    Color(0xFF2E7D32),
                    "Complete",
                )
                ParityStatus.PARTIAL -> Triple(
                    Icons.Default.Warning,
                    Color(0xFFF57F17),
                    "Partial",
                )
                ParityStatus.MISSING -> Triple(
                    Icons.Default.Error,
                    Color(0xFFC62828),
                    "Missing",
                )
            }

            Icon(
                imageVector = icon,
                contentDescription = desc,
                tint = tint,
                modifier = Modifier.size(24.dp),
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.feature,
                    style = MaterialTheme.typography.bodyLarge,
                )
                if (item.notes.isNotEmpty()) {
                    Text(
                        text = item.notes,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/**
 * Builds the platform parity report.
 *
 * Audits Android feature completeness against the shared platform
 * specification covering iOS, Web, and Windows targets.
 */
private fun buildParityReport(): List<ParityItem> = listOf(
    // ── Core Data ───────────────────────────────────────────────────
    ParityItem("Accounts CRUD", "Core Data", ParityStatus.COMPLETE),
    ParityItem("Transactions CRUD", "Core Data", ParityStatus.COMPLETE),
    ParityItem("Budgets CRUD", "Core Data", ParityStatus.COMPLETE),
    ParityItem("Goals CRUD", "Core Data", ParityStatus.COMPLETE),
    ParityItem("Categories CRUD", "Core Data", ParityStatus.COMPLETE),
    ParityItem("Recurring Transactions", "Core Data", ParityStatus.PARTIAL, "Rule engine wired; UI needs polish"),
    ParityItem("Transfer Transactions", "Core Data", ParityStatus.PARTIAL, "Model supports; UI pending"),

    // ── Authentication ──────────────────────────────────────────────
    ParityItem("Email/Password Auth", "Authentication", ParityStatus.COMPLETE),
    ParityItem("OAuth (Google/Apple)", "Authentication", ParityStatus.COMPLETE),
    ParityItem("Biometric Auth", "Authentication", ParityStatus.COMPLETE),
    ParityItem("Passkey Support", "Authentication", ParityStatus.COMPLETE),

    // ── Sync ────────────────────────────────────────────────────────
    ParityItem("Background Sync", "Sync", ParityStatus.COMPLETE),
    ParityItem("Conflict Resolution UI", "Sync", ParityStatus.COMPLETE, "Sprint 27"),
    ParityItem("Offline Support", "Sync", ParityStatus.COMPLETE),
    ParityItem("Delta Sync", "Sync", ParityStatus.PARTIAL, "KMP engine wired; needs E2E test"),

    // ── UI Features ─────────────────────────────────────────────────
    ParityItem("Dashboard", "UI", ParityStatus.COMPLETE),
    ParityItem("Analytics/Trends", "UI", ParityStatus.COMPLETE),
    ParityItem("Data Import/Export", "UI", ParityStatus.COMPLETE, "Sprint 26"),
    ParityItem("Custom Themes", "UI", ParityStatus.COMPLETE, "Sprint 29"),
    ParityItem("Simplified Dashboard", "UI", ParityStatus.COMPLETE, "Sprint 28"),
    ParityItem("Financial Glossary", "UI", ParityStatus.COMPLETE),
    ParityItem("NLP Transaction Input", "UI", ParityStatus.COMPLETE),
    ParityItem("Investment Portfolio", "UI", ParityStatus.COMPLETE),

    // ── Security ────────────────────────────────────────────────────
    ParityItem("Certificate Pinning", "Security", ParityStatus.COMPLETE, "Sprint 24"),
    ParityItem("RASP Checks", "Security", ParityStatus.COMPLETE, "Sprint 25"),
    ParityItem("SQLCipher Encryption", "Security", ParityStatus.COMPLETE),
    ParityItem("Keystore Integration", "Security", ParityStatus.COMPLETE),

    // ── Accessibility ───────────────────────────────────────────────
    ParityItem("TalkBack Support", "Accessibility", ParityStatus.COMPLETE),
    ParityItem("Content Descriptions", "Accessibility", ParityStatus.COMPLETE),
    ParityItem("High Contrast Mode", "Accessibility", ParityStatus.COMPLETE),
    ParityItem("Cognitive Accessibility", "Accessibility", ParityStatus.COMPLETE, "Sprint 28"),
    ParityItem("Font Scaling", "Accessibility", ParityStatus.COMPLETE),

    // ── Widgets ─────────────────────────────────────────────────────
    ParityItem("Balance Summary Widget", "Widgets", ParityStatus.COMPLETE),
    ParityItem("Quick Transaction Widget", "Widgets", ParityStatus.COMPLETE),
    ParityItem("Quick Entry Widget", "Widgets", ParityStatus.COMPLETE, "Sprint 30"),
    ParityItem("Budget Summary Widget", "Widgets", ParityStatus.COMPLETE),
    ParityItem("Goal Progress Widget", "Widgets", ParityStatus.COMPLETE),

    // ── Notifications ───────────────────────────────────────────────
    ParityItem("Bill Reminders", "Notifications", ParityStatus.COMPLETE, "Sprint 32"),
    ParityItem("Sync Status Notifications", "Notifications", ParityStatus.COMPLETE, "Sprint 32"),
    ParityItem("Budget Alerts", "Notifications", ParityStatus.PARTIAL, "Channel exists; threshold logic pending"),

    // ── Platform-Specific ───────────────────────────────────────────
    ParityItem("Baseline Profiles", "Performance", ParityStatus.COMPLETE, "Sprint 31"),
    ParityItem("Compose Optimisation", "Performance", ParityStatus.COMPLETE, "Sprint 31"),
    ParityItem("Quick Settings Tile", "Platform", ParityStatus.COMPLETE),
    ParityItem("Adaptive Navigation", "Platform", ParityStatus.COMPLETE),
)
