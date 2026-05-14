// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.ThemeManager
import com.finance.android.ui.theme.ThemeMode

/**
 * Preset accent colors available for selection.
 */
private val ACCENT_COLORS = listOf(
    Color(0xFF1565C0) to "Blue",
    Color(0xFF2E7D32) to "Green",
    Color(0xFFC62828) to "Red",
    Color(0xFF6A1B9A) to "Purple",
    Color(0xFFE65100) to "Orange",
    Color(0xFF00838F) to "Teal",
    Color(0xFF4E342E) to "Brown",
    Color(0xFF37474F) to "Blue Grey",
)

/**
 * Theme personalization screen.
 *
 * Allows users to customize:
 * - Theme mode (light/dark/system)
 * - Accent color from presets
 * - Dynamic color toggle (Material You)
 * - Font size scaling
 * - High contrast mode
 *
 * ## Accessibility
 * - Color swatches have text labels for screen readers.
 * - Slider announces current value.
 * - All toggles have descriptive content descriptions.
 *
 * @param themeManager Manager for persisting theme preferences.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
fun ThemePreferencesScreen(
    themeManager: ThemeManager,
) {
    val themeMode by themeManager.themeMode.collectAsState()
    val accentColor by themeManager.accentColor.collectAsState()
    val dynamicColor by themeManager.dynamicColorEnabled.collectAsState()
    val highContrast by themeManager.highContrastEnabled.collectAsState()
    val fontScale by themeManager.fontScale.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .semantics { contentDescription = "Theme preferences" },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Appearance",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.semantics { heading() },
        )

        // ── Theme Mode ──────────────────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Theme",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(modifier = Modifier.height(8.dp))

                ThemeMode.entries.forEach { mode ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { themeManager.setThemeMode(mode) }
                            .padding(vertical = 8.dp)
                            .semantics {
                                contentDescription = "${mode.displayName}. " +
                                    if (themeMode == mode) "Selected." else "Not selected."
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = themeMode == mode,
                            onClick = { themeManager.setThemeMode(mode) },
                        )
                        Text(
                            text = mode.displayName,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        }

        // ── Dynamic Color ───────────────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Material You",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        text = "Use colors from your wallpaper",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = dynamicColor,
                    onCheckedChange = { themeManager.setDynamicColorEnabled(it) },
                    modifier = Modifier.semantics {
                        contentDescription = "Material You dynamic colors: " +
                            if (dynamicColor) "on" else "off"
                    },
                )
            }
        }

        // ── Accent Color Picker ─────────────────────────────────────
        if (!dynamicColor) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Accent Color",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        ACCENT_COLORS.forEach { (color, name) ->
                            ColorSwatch(
                                color = color,
                                name = name,
                                isSelected = accentColor == color,
                                onClick = { themeManager.setAccentColor(color) },
                            )
                        }
                    }
                }
            }
        }

        // ── High Contrast ───────────────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "High Contrast",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        text = "Increase contrast for better visibility",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = highContrast,
                    onCheckedChange = { themeManager.setHighContrastEnabled(it) },
                    modifier = Modifier.semantics {
                        contentDescription = "High contrast mode: " +
                            if (highContrast) "on" else "off"
                    },
                )
            }
        }

        // ── Font Scale ──────────────────────────────────────────────
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Text Size",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Scale: ${(fontScale * 100).toInt()}%",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Slider(
                    value = fontScale,
                    onValueChange = { themeManager.setFontScale(it) },
                    valueRange = 0.8f..2.0f,
                    steps = 5,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription =
                                "Text size: ${(fontScale * 100).toInt()} percent"
                        },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Small", style = MaterialTheme.typography.labelSmall)
                    Text("Large", style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        // ── Reset ───────────────────────────────────────────────────
        OutlinedButton(
            onClick = { themeManager.resetToDefaults() },
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Reset theme to defaults" },
        ) {
            Text("Reset to Defaults")
        }
    }
}

/**
 * Circular color swatch with checkmark for selection state.
 */
@Composable
private fun ColorSwatch(
    color: Color,
    name: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(color)
            .then(
                if (isSelected) {
                    Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = "$name color. " +
                    if (isSelected) "Selected." else "Double tap to select."
            },
        contentAlignment = Alignment.Center,
    ) {
        if (isSelected) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}
