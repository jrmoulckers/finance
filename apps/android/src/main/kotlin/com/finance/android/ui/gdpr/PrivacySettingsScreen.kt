// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gdpr

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacySettingsScreen(viewModel: PrivacySettingsViewModel = koinViewModel(), onBack: () -> Unit = {}) {
    val consentState by viewModel.consentState.collectAsState()
    val context = LocalContext.current
    var showDeleteDialog by rememberSaveable { mutableStateOf(false) }
    var showFinalDialog by rememberSaveable { mutableStateOf(false) }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Privacy Settings", modifier = Modifier.semantics { heading(); contentDescription = "Privacy Settings" }) },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Navigate back" }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
        )
    }) { padding ->
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(padding).padding(horizontal = 16.dp)) {
            Text("Data Processing Consent", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 12.dp).semantics { heading() })
            SettingRow(Icons.Outlined.Lock, "Essential", "Required for core functionality.", true, false, {}, "Essential, always enabled")
            SettingRow(Icons.Outlined.Analytics, "Analytics", "Anonymous metrics.", consentState.analytics, true, { viewModel.updateAnalytics(it) }, "Analytics")
            SettingRow(Icons.Outlined.PersonOutline, "Personalization", "Tailored insights.", consentState.personalization, true, { viewModel.updatePersonalization(it) }, "Personalization")
            SettingRow(Icons.Outlined.Campaign, "Marketing", "Feature updates.", consentState.marketing, true, { viewModel.updateMarketing(it) }, "Marketing")
            HorizontalDivider(Modifier.padding(vertical = 16.dp))
            Text("Your Data", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 12.dp).semantics { heading() })
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.FileDownload, null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(16.dp))
                        Text("Export Your Data", style = MaterialTheme.typography.titleSmall)
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = { launchExport(context) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Export your data" }) { Text("Request Data Export") }
                }
            }
            Spacer(Modifier.height(16.dp))
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Delete, null, tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(16.dp))
                        Text("Delete Account", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    }
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { showDeleteDialog = true }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Delete account" }) { Text("Delete My Account") }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }

    if (showDeleteDialog) {
        AlertDialog(onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Account?", modifier = Modifier.semantics { heading() }) },
            text = { Text("This permanently deletes all data. Cannot be undone.", modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) },
            confirmButton = { Button(onClick = { showDeleteDialog = false; showFinalDialog = true }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Continue") } },
            dismissButton = { TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") } })
    }
    if (showFinalDialog) {
        AlertDialog(onDismissRequest = { showFinalDialog = false },
            title = { Text("Are you absolutely sure?") },
            text = { Text("All data will be permanently erased.") },
            confirmButton = { Button(onClick = { showFinalDialog = false; viewModel.deleteAccount() }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Delete Permanently") } },
            dismissButton = { TextButton(onClick = { showFinalDialog = false }) { Text("Cancel") } })
    }
}

@Composable
private fun SettingRow(icon: ImageVector, title: String, desc: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit, label: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics(mergeDescendants = true) { contentDescription = "$label: ${if (checked) "on" else "off"}"; liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium); Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Switch(checked, onChange, enabled = enabled)
    }
}

private fun launchExport(context: Context) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Finance App - Data Export Request")
        putExtra(Intent.EXTRA_TEXT, "Requesting export of all financial data per GDPR Article 20.")
    }
    context.startActivity(Intent.createChooser(intent, "Request Data Export"))
}