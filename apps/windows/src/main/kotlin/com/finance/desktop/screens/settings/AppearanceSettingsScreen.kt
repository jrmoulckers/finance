// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.core.icons.IconPack
import com.finance.core.icons.IconPacks
import com.finance.core.icons.IconToken
import com.finance.core.icons.Platform
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.ui.components.IconView
import com.finance.desktop.ui.components.LocalIconPack

@Composable
fun AppearanceSettingsScreen(
    selectedIconPackId: String,
    onIconPackSelected: (String) -> Unit,
    highContrastMode: String = "Auto",
    onHighContrastModeSelected: (String) -> Unit = {},
    compactDensity: Boolean = false,
    onCompactDensityChange: (Boolean) -> Unit = {},
) {
    Column(verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg)) {
        IconStyleCard(
            selectedIconPackId = selectedIconPackId,
            onIconPackSelected = onIconPackSelected,
        )
        HighContrastCard(
            selectedMode = highContrastMode,
            onModeSelected = onHighContrastModeSelected,
        )
        DensityCard(
            compact = compactDensity,
            onCompactChange = onCompactDensityChange,
        )
    }
}

/**
 * High Contrast preference card (#3665): Auto / On / Off radio options.
 */
@Composable
private fun HighContrastCard(
    selectedMode: String,
    onModeSelected: (String) -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "High contrast settings" },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            Text(
                text = "High Contrast",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "System detection is unreliable — force high contrast on or off.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            listOf(
                "Auto" to "Follow the Windows high-contrast setting",
                "On" to "Always use a high-contrast color scheme",
                "Off" to "Never use a high-contrast color scheme",
            ).forEach { (value, description) ->
                RadioOptionRow(
                    label = value,
                    description = description,
                    selected = selectedMode.equals(value, ignoreCase = true),
                    onSelected = { onModeSelected(value) },
                )
            }
        }
    }
}

/**
 * Information-density card (#3722): Comfortable / Compact radio options.
 */
@Composable
private fun DensityCard(
    compact: Boolean,
    onCompactChange: (Boolean) -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Density settings" },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Compact density",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Tighter spacing shows more rows per screen on list views.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = compact,
                    onCheckedChange = onCompactChange,
                    modifier = Modifier.semantics {
                        contentDescription = "Compact density, ${if (compact) "enabled" else "disabled"}"
                    },
                )
            }
        }
    }
}

@Composable
private fun RadioOptionRow(
    label: String,
    description: String,
    selected: Boolean,
    onSelected: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(
                selected = selected,
                onClick = onSelected,
                role = Role.RadioButton,
            )
            .padding(vertical = FinanceDesktopTheme.spacing.xs)
            .semantics {
                contentDescription = "$label. $description"
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
    ) {
        RadioButton(selected = selected, onClick = onSelected)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = label, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun IconStyleCard(
    selectedIconPackId: String,
    onIconPackSelected: (String) -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Icon Style settings" },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
        ) {
            Text(
                text = "Icon Style",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            IconPacks.forPlatform(Platform.WINDOWS).forEach { pack ->
                IconPackOption(
                    pack = pack,
                    selected = selectedIconPackId == pack.id,
                    onSelected = { onIconPackSelected(pack.id) },
                )
            }
        }
    }
}

@Composable
private fun IconPackOption(
    pack: IconPack,
    selected: Boolean,
    onSelected: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(
                selected = selected,
                onClick = onSelected,
                role = Role.RadioButton,
            )
            .padding(vertical = FinanceDesktopTheme.spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
    ) {
        RadioButton(
            selected = selected,
            onClick = onSelected,
        )
        Text(
            text = pack.displayName,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        CompositionLocalProvider(LocalIconPack provides pack) {
            PreviewIcons()
        }
    }
}

@Composable
private fun PreviewIcons() {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(IconToken.HOME, IconToken.TRANSACTIONS, IconToken.BUDGETS, IconToken.SETTINGS).forEach { token ->
            IconView(token = token, size = 20.dp)
        }
    }
    Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
}
