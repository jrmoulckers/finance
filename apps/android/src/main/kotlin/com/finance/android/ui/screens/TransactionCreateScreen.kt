// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalGroceryStore
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Subscriptions
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.data.SampleData
import org.koin.compose.viewmodel.koinViewModel
import com.finance.android.ui.viewmodel.CreateStep
import com.finance.android.ui.viewmodel.TransactionCreateUiState
import com.finance.android.ui.viewmodel.TransactionCreateViewModel
import com.finance.models.Category
import com.finance.models.TransactionType
import com.finance.models.types.SyncId

/**
 * Transaction creation screen (#23) — 3-step wizard flow.
 * Step 1: Amount + Payee (with type selector and autocomplete)
 * Step 2: Category + Account (grid picker, dropdown, date, note)
 * Step 3: Confirm (summary review)
 * Haptic feedback triggered via [onSaved]. TalkBack accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionCreateScreen(
    onSaved: () -> Unit = {}, onBack: () -> Unit = {},
    viewModel: TransactionCreateViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isSaved) { onSaved(); return }

    Column(Modifier.fillMaxSize()) {
        StepIndicator(state.currentStep, Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        if (state.errors.isNotEmpty()) ErrorMessages(state.errors, Modifier.padding(horizontal = 16.dp))
        AnimatedContent(state.currentStep, transitionSpec = {
            slideInHorizontally { it } togetherWith slideOutHorizontally { -it }
        }, label = "step", modifier = Modifier.weight(1f).fillMaxWidth()) { step ->
            when (step) {
                CreateStep.AMOUNT -> AmountStep(state, viewModel::updateAmount, viewModel::updatePayee,
                    viewModel::selectPayeeSuggestion, viewModel::updateTransactionType)
                CreateStep.CATEGORY -> CategoryStep(state, viewModel::selectCategory, viewModel::selectAccount,
                    viewModel::selectTransferAccount, viewModel::updateNote)
                CreateStep.CONFIRM -> ConfirmStep(state)
            }
        }
        ActionBar(state.currentStep, state.isSaving, viewModel::nextStep, viewModel::save, Modifier.padding(16.dp))
    }
}

@Composable
private fun StepIndicator(step: CreateStep, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().semantics { contentDescription = "Step ${step.index + 1} of 3: ${step.label}" },
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CreateStep.entries.forEach { s ->
            val on = s.index <= step.index
            LinearProgressIndicator(progress = { if (on) 1f else 0f }, modifier = Modifier.weight(1f).height(4.dp),
                color = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                trackColor = MaterialTheme.colorScheme.surfaceVariant)
        }
    }
}

@Composable
private fun ErrorMessages(errors: List<String>, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth().semantics { contentDescription = "Errors: ${errors.joinToString(", ")}" },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Column(Modifier.padding(12.dp)) { errors.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onErrorContainer) } }
    }
}

@Composable
private fun AmountStep(state: TransactionCreateUiState, onAmt: (String) -> Unit, onPayee: (String) -> Unit,
    onSugg: (String) -> Unit, onType: (TransactionType) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item(key = "type") {
            Text("Transaction Type", style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { contentDescription = "Transaction type selector" })
            Spacer(Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                TransactionType.entries.forEachIndexed { i, t ->
                    SegmentedButton(
                        selected = state.transactionType == t,
                        onClick = { onType(t) },
                        shape = SegmentedButtonDefaults.itemShape(i, TransactionType.entries.size),
                        modifier = Modifier.semantics { contentDescription = "${t.name.lowercase()} type" },
                    ) {
                        Text(t.name.lowercase().replaceFirstChar { c -> c.uppercase() })
                    }
                }
            }
        }
        item(key = "amount") {
            Text("Amount", style = MaterialTheme.typography.labelLarge, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.amountText, onAmt, Modifier.fillMaxWidth().semantics { contentDescription = "Amount in dollars" },
                label = { Text("Amount") }, placeholder = { Text("0.00") },
                leadingIcon = { Icon(Icons.Filled.AttachMoney, null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
        }
        item(key = "payee") {
            Text("Payee", style = MaterialTheme.typography.labelLarge, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.payee, onPayee, Modifier.fillMaxWidth().semantics { contentDescription = "Payee name" },
                label = { Text("Payee") }, placeholder = { Text("e.g. Whole Foods") }, singleLine = true)
            if (state.payeeSuggestions.isNotEmpty()) {
                Card(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                    Column { state.payeeSuggestions.forEach { s ->
                        Text(s, Modifier.fillMaxWidth().clickable { onSugg(s) }.padding(horizontal = 16.dp, vertical = 12.dp)
                            .semantics { contentDescription = "Suggestion: $s" }, style = MaterialTheme.typography.bodyMedium)
                        HorizontalDivider()
                    }}
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun CategoryStep(state: TransactionCreateUiState, onCat: (SyncId) -> Unit, onAcct: (SyncId) -> Unit,
    onXfer: (SyncId) -> Unit, onNote: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item(key = "cat-hdr") { Text("Category", style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.semantics { heading(); contentDescription = "Select a category" }) }
        item(key = "cat-grid") {
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.categories.forEach { cat ->
                    val sel = cat.id == state.selectedCategoryId
                    FilterChip(sel, { onCat(cat.id) }, { Text(cat.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        leadingIcon = { Icon(catIcon(cat.icon), null, Modifier.size(18.dp)) },
                        modifier = Modifier.semantics { contentDescription = if (sel) "Category: ${cat.name}, selected" else "Category: ${cat.name}" })
                }
            }
        }
        item(key = "acct") {
            Text("Account", style = MaterialTheme.typography.labelLarge, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(8.dp))
            AcctDropdown(state.accounts, state.selectedAccountId, onAcct, "From Account")
        }
        if (state.transactionType == TransactionType.TRANSFER) {
            item(key = "xfer") {
                Text("Destination Account", style = MaterialTheme.typography.labelLarge, modifier = Modifier.semantics { heading() })
                Spacer(Modifier.height(8.dp))
                AcctDropdown(state.accounts.filter { it.id != state.selectedAccountId }, state.selectedTransferAccountId, onXfer, "To Account")
            }
        }
        item(key = "date") {
            Text("Date", style = MaterialTheme.typography.labelLarge, modifier = Modifier.semantics { heading() })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.date.toString(), {}, Modifier.fillMaxWidth().semantics { contentDescription = "Transaction date: ${state.date}" },
                readOnly = true, leadingIcon = { Icon(Icons.Filled.CalendarMonth, null) }, label = { Text("Date") })
        }
        item(key = "note") {
            Text("Note (optional)", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.note, onNote, Modifier.fillMaxWidth().semantics { contentDescription = "Optional note" },
                label = { Text("Note") }, placeholder = { Text("Add a note...") }, maxLines = 3)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AcctDropdown(accounts: List<com.finance.models.Account>, selectedId: SyncId?, onSel: (SyncId) -> Unit, label: String) {
    var expanded by remember { mutableStateOf(false) }
    val name = accounts.find { it.id == selectedId }?.name ?: ""
    ExposedDropdownMenuBox(expanded, { expanded = it }) {
        OutlinedTextField(name, {}, readOnly = true, modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable)
            .semantics { contentDescription = "$label: $name" }, label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) })
        ExposedDropdownMenu(expanded, { expanded = false }) {
            accounts.forEach { a -> DropdownMenuItem({ Text(a.name, Modifier.semantics { contentDescription = "Account: ${a.name}" }) },
                { onSel(a.id); expanded = false }) }
        }
    }
}

@Composable
private fun ConfirmStep(state: TransactionCreateUiState) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(key = "hdr") { Text("Review Transaction", style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading(); contentDescription = "Review your transaction" }) }
        item(key = "card") {
            ElevatedCard(Modifier.fillMaxWidth().semantics { contentDescription = "Summary: ${state.formattedAmount} to ${state.payee}" }) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    CRow("Amount", state.formattedAmount); HorizontalDivider()
                    CRow("Type", state.transactionType.name.lowercase().replaceFirstChar { it.uppercase() }); HorizontalDivider()
                    CRow("Payee", state.payee); HorizontalDivider()
                    CRow("Category", state.selectedCategoryName); HorizontalDivider()
                    CRow("Account", state.selectedAccountName)
                    if (state.transactionType == TransactionType.TRANSFER) { HorizontalDivider(); CRow("To Account", state.selectedTransferAccountName) }
                    HorizontalDivider(); CRow("Date", state.date.toString())
                    if (state.note.isNotBlank()) { HorizontalDivider(); CRow("Note", state.note) }
                }
            }
        }
    }
}

@Composable
private fun CRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().semantics { contentDescription = "$label: $value" }, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ActionBar(step: CreateStep, saving: Boolean, onNext: () -> Unit, onSave: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        if (step == CreateStep.CONFIRM) {
            Button(onSave, enabled = !saving, modifier = Modifier.fillMaxWidth().semantics {
                contentDescription = if (saving) "Saving transaction" else "Save transaction" }) {
                if (saving) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    Spacer(Modifier.width(8.dp)); Text("Saving...") }
                else { Icon(Icons.Filled.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Save Transaction") }
            }
        } else {
            Button(onNext, Modifier.fillMaxWidth().semantics { contentDescription = "Continue to next step" }) { Text("Continue") }
        }
    }
}

private fun catIcon(name: String?): ImageVector = when (name) {
    "shopping_cart" -> Icons.Filled.LocalGroceryStore; "restaurant" -> Icons.Filled.Fastfood
    "directions_car" -> Icons.Filled.DirectionsCar; "movie" -> Icons.Filled.Movie
    "bolt" -> Icons.Outlined.Bolt; "home" -> Icons.Filled.Home
    "local_hospital" -> Icons.Filled.LocalHospital; "shopping_bag" -> Icons.Filled.ShoppingBag
    "subscriptions" -> Icons.Filled.Subscriptions; "payments" -> Icons.Filled.Payments
    "work" -> Icons.Filled.Work; "trending_up" -> Icons.Filled.TrendingUp
    "swap_horiz" -> Icons.Filled.SwapHoriz; "credit_card" -> Icons.Filled.CreditCard
    else -> Icons.Filled.Category
}

@Preview(showBackground = true, showSystemUi = true, name = "Amount Step - Light")
@Preview(showBackground = true, showSystemUi = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Amount Step - Dark")
@Composable
private fun AmountStepPreview() {
    FinanceTheme(dynamicColor = false) {
        Column { StepIndicator(CreateStep.AMOUNT, Modifier.padding(16.dp))
            AmountStep(TransactionCreateUiState(amountText = "42.50", amountCents = 4250, payee = "Whole Foods"), {}, {}, {}, {}) }
    }
}

@Preview(showBackground = true, name = "Confirm Step - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Confirm Step - Dark")
@Composable
private fun ConfirmPreview() {
    FinanceTheme(dynamicColor = false) {
        ConfirmStep(TransactionCreateUiState(currentStep = CreateStep.CONFIRM, formattedAmount = "\$42.50",
            payee = "Whole Foods", selectedCategoryName = "Groceries", selectedAccountName = "Main Checking",
            date = kotlinx.datetime.LocalDate(2025, 3, 6)))
    }
}

@Preview(showBackground = true, showSystemUi = true, name = "Category Step - Light")
@Preview(showBackground = true, showSystemUi = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Category Step - Dark")
@Composable
private fun CategoryStepPreview() {
    FinanceTheme(dynamicColor = false) {
        Column { StepIndicator(CreateStep.CATEGORY, Modifier.padding(16.dp))
            CategoryStep(
                TransactionCreateUiState(
                    currentStep = CreateStep.CATEGORY,
                    categories = SampleData.categories.take(8),
                    accounts = SampleData.accounts.take(4),
                    selectedCategoryId = SyncId("cat-groceries"),
                    selectedAccountId = SyncId("acc-checking"),
                    date = kotlinx.datetime.LocalDate(2025, 3, 6),
                ), {}, {}, {}, {})
        }
    }
}

@Preview(showBackground = true, name = "Transaction Create - Errors - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Transaction Create - Errors - Dark")
@Composable
private fun ErrorMessagesPreview() {
    FinanceTheme(dynamicColor = false) {
        ErrorMessages(listOf("Amount is required", "Please select a category"), Modifier.padding(16.dp))
    }
}
