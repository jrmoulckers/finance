// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.unit.dp
import com.finance.android.ui.components.IconView
import com.finance.android.ui.components.LocalIconPack
import com.finance.android.ui.theme.ThemePreference
import com.finance.core.icons.IconPack
import com.finance.core.icons.IconPacks
import com.finance.core.icons.IconToken
import com.finance.core.icons.Platform

@Composable
fun AppearanceSettingsScreen(
    themePreference: ThemePreference,
    selectedIconPack: IconPack,
    onThemePreferenceChanged: (ThemePreference) -> Unit,
    onIconPackChanged: (IconPack) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        SectionHeader("Appearance")
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Appearance settings card" },
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                ThemePreferenceDropdown(
                    selected = themePreference,
                    onSelected = onThemePreferenceChanged,
                )
                HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                IconStyleSection(
                    selectedIconPack = selectedIconPack,
                    onIconPackChanged = onIconPackChanged,
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .padding(top = 8.dp, bottom = 4.dp)
            .semantics {
                heading()
                contentDescription = "$title section"
            },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThemePreferenceDropdown(
    selected: ThemePreference,
    onSelected: (ThemePreference) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.semantics { contentDescription = "Theme mode selector" },
    ) {
        OutlinedTextField(
            value = selected.label,
            onValueChange = {},
            readOnly = true,
            label = { Text("Theme") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            ThemePreference.entries.forEach { preference ->
                DropdownMenuItem(
                    text = { Text(text = preference.label) },
                    onClick = {
                        onSelected(preference)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun IconStyleSection(
    selectedIconPack: IconPack,
    onIconPackChanged: (IconPack) -> Unit,
) {
    val packs = remember { IconPacks.forPlatform(Platform.ANDROID) }
    Text(
        text = "Icon Style",
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Medium,
    )
    Spacer(modifier = Modifier.height(4.dp))
    Text(
        text = "Choose the icon family used across navigation, accounts, and transactions.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(modifier = Modifier.height(12.dp))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        packs.forEach { pack ->
            IconPackOption(
                pack = pack,
                selected = pack.id == selectedIconPack.id,
                onClick = { onIconPackChanged(pack) },
            )
        }
    }
}

@Composable
private fun IconPackOption(
    pack: IconPack,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val buttonModifier = Modifier
        .fillMaxWidth()
        .semantics {
            contentDescription = if (selected) {
                "${pack.displayName} icon style selected"
            } else {
                "Select ${pack.displayName} icon style"
            }
        }
    val content: @Composable () -> Unit = {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = pack.displayName, style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CompositionLocalProvider(LocalIconPack provides pack) {
                    listOf(
                        IconToken.HOME,
                        IconToken.TRANSACTIONS,
                        IconToken.WALLET,
                        IconToken.CHART_PIE,
                    ).forEach { token ->
                        IconView(token = token, size = 20.dp)
                    }
                }
            }
        }
    }

    if (selected) {
        Button(onClick = onClick, modifier = buttonModifier) { content() }
    } else {
        OutlinedButton(onClick = onClick, modifier = buttonModifier) { content() }
    }
}
