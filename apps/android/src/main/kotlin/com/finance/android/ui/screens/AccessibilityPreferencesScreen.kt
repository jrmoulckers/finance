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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.android.ui.accessibility.CognitiveAccessibilityManager

/**
 * Accessibility preferences screen.
 *
 * Allows users to configure cognitive accessibility features including
 * simplified mode, large touch targets, step-by-step wizards, plain
 * language, reduced animations, and font scaling.
 *
 * ## Accessibility
 * - All toggles have descriptive content descriptions.
 * - Section headings use semantic heading role.
 * - Slider announces its current value.
 *
 * @param accessibilityManager Manager for persisting preferences.
 */
@Composable
fun AccessibilityPreferencesScreen(
    accessibilityManager: CognitiveAccessibilityManager,
) {
    val simplifiedMode by accessibilityManager.simplifiedMode.collectAsState()
    val largeTouchTargets by accessibilityManager.largeTouchTargets.collectAsState()
    val stepByStepWizards by accessibilityManager.stepByStepWizards.collectAsState()
    val plainLanguage by accessibilityManager.plainLanguage.collectAsState()
    val reducedAnimations by accessibilityManager.reducedAnimations.collectAsState()
    val fontScale by accessibilityManager.fontScaleMultiplier.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .semantics { contentDescription = "Accessibility preferences" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "Accessibility",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(8.dp))

        // ── Simplified Mode ─────────────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Display",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(modifier = Modifier.height(8.dp))

                AccessibilityToggle(
                    label = "Simplified Mode",
                    description = "Show a simpler dashboard with less information",
                    checked = simplifiedMode,
                    onCheckedChange = { accessibilityManager.setSimplifiedMode(it) },
                )

                HorizontalDivider()

                AccessibilityToggle(
                    label = "Large Touch Targets",
                    description = "Make buttons and controls bigger for easier tapping",
                    checked = largeTouchTargets,
                    onCheckedChange = { accessibilityManager.setLargeTouchTargets(it) },
                )

                HorizontalDivider()

                AccessibilityToggle(
                    label = "Reduced Animations",
                    description = "Turn off or reduce motion and animations",
                    checked = reducedAnimations,
                    onCheckedChange = { accessibilityManager.setReducedAnimations(it) },
                )
            }
        }

        // ── Language & Understanding ────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Understanding",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(modifier = Modifier.height(8.dp))

                AccessibilityToggle(
                    label = "Plain Language",
                    description = "Use simpler words instead of financial terms",
                    checked = plainLanguage,
                    onCheckedChange = { accessibilityManager.setPlainLanguage(it) },
                )

                HorizontalDivider()

                AccessibilityToggle(
                    label = "Step-by-Step Guides",
                    description = "Break complex tasks into simple steps",
                    checked = stepByStepWizards,
                    onCheckedChange = { accessibilityManager.setStepByStepWizards(it) },
                )
            }
        }

        // ── Font Size ───────────────────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Text Size",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Additional text scaling: ${(fontScale * 100).toInt()}%",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(4.dp))

                Slider(
                    value = fontScale,
                    onValueChange = { accessibilityManager.setFontScaleMultiplier(it) },
                    valueRange = 1.0f..2.0f,
                    steps = 4,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription =
                                "Text size slider, currently ${(fontScale * 100).toInt()} percent"
                        },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Normal", style = MaterialTheme.typography.labelSmall)
                    Text("200%", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

/**
 * Reusable toggle row for accessibility preferences.
 */
@Composable
private fun AccessibilityToggle(
    label: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            modifier = Modifier.semantics {
                contentDescription = if (checked) {
                    "$label is on. Double tap to turn off."
                } else {
                    "$label is off. Double tap to turn on."
                }
            },
        )
    }
}