// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gdpr

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun ConsentDialog(
    onConsentGiven: (analytics: Boolean, personalization: Boolean, marketing: Boolean) -> Unit,
) {
    var analytics by rememberSaveable { mutableStateOf(false) }
    var personalization by rememberSaveable { mutableStateOf(false) }
    var marketing by rememberSaveable { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
    ) {
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.height(48.dp))
            Spacer(Modifier.height(16.dp))
            Text("Your Privacy Matters", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading(); contentDescription = "Your Privacy Matters" })
            Spacer(Modifier.height(8.dp))
            Text("We need your consent to process data. You can change these at any time in Privacy Settings.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.semantics { contentDescription = "Privacy consent explanation" })
            Spacer(Modifier.height(24.dp))
            ConsentToggle(Icons.Outlined.Lock, "Essential", "Required for core functionality.", true, false, {}, "Essential, always enabled")
            Spacer(Modifier.height(12.dp))
            ConsentToggle(Icons.Outlined.Analytics, "Analytics", "Anonymous crash reports and metrics.", analytics, true, { analytics = it }, "Analytics consent")
            Spacer(Modifier.height(12.dp))
            ConsentToggle(Icons.Outlined.PersonOutline, "Personalization", "Tailored financial insights.", personalization, true, { personalization = it }, "Personalization consent")
            Spacer(Modifier.height(12.dp))
            ConsentToggle(Icons.Outlined.Campaign, "Marketing", "Feature updates and promotions.", marketing, true, { marketing = it }, "Marketing consent")
            Spacer(Modifier.height(24.dp))
            Button(onClick = { onConsentGiven(analytics, personalization, marketing) }, modifier = Modifier.fillMaxWidth().height(56.dp).semantics { contentDescription = "Accept selected consent choices" }) { Text("Accept Selected", style = MaterialTheme.typography.labelLarge) }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { onConsentGiven(true, true, true) }, modifier = Modifier.fillMaxWidth().height(48.dp).semantics { contentDescription = "Accept all" }) { Text("Accept All") }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { onConsentGiven(false, false, false) }, modifier = Modifier.fillMaxWidth().height(48.dp).semantics { contentDescription = "Essential only" }) { Text("Essential Only") }
        }
    }
}

@Composable
private fun ConsentToggle(icon: ImageVector, title: String, desc: String, checked: Boolean, enabled: Boolean, onChecked: (Boolean) -> Unit, label: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).semantics(mergeDescendants = true) { contentDescription = "$label: ${if (checked) "enabled" else "disabled"}"; liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
            Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        Switch(checked = checked, onCheckedChange = onChecked, enabled = enabled)
    }
}