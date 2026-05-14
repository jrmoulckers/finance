// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalAnimationApi::class)

package com.finance.android.ui.onboarding

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

// ── Constants ────────────────────────────────────────────────────────────────

/** Animation duration in ms — set to 0 when reduced motion is enabled. */
private const val TRANSITION_DURATION_MS = 350

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Multi-step onboarding screen. Hosts all five steps inside an [AnimatedContent]
 * with slide-left / slide-right transitions.
 *
 * @param viewModel The [OnboardingViewModel] managing state.
 * @param onOnboardingComplete Callback invoked when onboarding finishes (save or skip).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
fun OnboardingScreen(
    viewModel: OnboardingViewModel,
    onOnboardingComplete: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()

    // Navigate away once onboarding is marked complete.
    if (state.isComplete) {
        onOnboardingComplete()
        return
    }

    val reducedMotion = isReducedMotionEnabled()
    val animDuration = if (reducedMotion) 0 else TRANSITION_DURATION_MS

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    // Show back arrow on steps 2+ (path selection and beyond),
                    // but not on step 1 (welcome).
                    if (state.currentStep > 1) {
                        IconButton(
                            onClick = { viewModel.previousStep() },
                            modifier = Modifier.semantics {
                                contentDescription = "Go back to previous step"
                            },
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                            )
                        }
                    }
                },
                actions = {
                    // Show skip only on personalized-path customization steps (3-5).
                    val isPersonalizedCustomizationStep =
                        state.selectedPath == OnboardingPath.PERSONALIZED &&
                            state.currentStep in 3..5
                    if (isPersonalizedCustomizationStep) {
                        TextButton(
                            onClick = { viewModel.skip() },
                            modifier = Modifier.semantics {
                                contentDescription = "Skip onboarding and go to the app"
                            },
                        ) {
                            Text("Skip")
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Step indicator shown only on personalized customization steps (3-5)
            if (state.selectedPath == OnboardingPath.PERSONALIZED && state.currentStep in 3..5) {
                StepIndicator(
                    currentStep = state.currentStep,
                    totalSteps = state.totalSteps,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 8.dp),
                )
            }

            // Step content with animated transitions
            AnimatedContent(
                targetState = state.currentStep,
                transitionSpec = {
                    val direction = if (targetState > initialState) 1 else -1
                    slideInHorizontally(
                        initialOffsetX = { fullWidth -> direction * fullWidth },
                        animationSpec = tween(animDuration),
                    ) togetherWith slideOutHorizontally(
                        targetOffsetX = { fullWidth -> -direction * fullWidth },
                        animationSpec = tween(animDuration),
                    )
                },
                label = "OnboardingStepTransition",
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
            ) { step ->
                when (step) {
                    1 -> WelcomeStep(onGetStarted = { viewModel.nextStep() })
                    2 -> PathSelectionStep(
                        onQuickStart = { viewModel.selectPath(OnboardingPath.QUICK_START) },
                        onPersonalized = { viewModel.selectPath(OnboardingPath.PERSONALIZED) },
                    )
                    3 -> CurrencyStep(
                        currencies = CurrencyOption.defaults,
                        selectedCurrency = state.selectedCurrency,
                        onCurrencySelected = { viewModel.selectCurrency(it) },
                        onNext = { viewModel.nextStep() },
                    )
                    4 -> FirstAccountStep(
                        accountName = state.accountName,
                        onAccountNameChange = { viewModel.setAccountName(it) },
                        accountType = state.accountType,
                        onAccountTypeChange = { viewModel.setAccountType(it) },
                        startingBalance = state.startingBalance,
                        onStartingBalanceChange = { viewModel.setStartingBalance(it) },
                        currencySymbol = state.selectedCurrency.symbol,
                        onNext = { viewModel.nextStep() },
                    )
                    5 -> FirstBudgetStep(
                        budgetCategory = state.budgetCategory,
                        budgetAmount = state.budgetAmount,
                        onBudgetAmountChange = { viewModel.setBudgetAmount(it) },
                        currencySymbol = state.selectedCurrency.symbol,
                        onNext = { viewModel.nextStep() },
                    )
                    6 -> DoneStep(
                        state = state,
                        onDone = { viewModel.finishOnboarding() },
                    )
                }
            }
        }
    }
}

// ── Step Indicator ───────────────────────────────────────────────────────────

/**
 * A row of dots indicating onboarding progress. "Step N of M" announced to TalkBack.
 */
@Composable
private fun StepIndicator(
    currentStep: Int,
    totalSteps: Int,
    modifier: Modifier = Modifier,
) {
    Row(
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier.semantics {
            contentDescription = "Step $currentStep of $totalSteps"
        },
    ) {
        for (i in 1..totalSteps) {
            val isActive = i <= currentStep
            Box(
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .size(if (i == currentStep) 10.dp else 8.dp)
                    .clip(CircleShape)
                    .background(
                        if (isActive) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.outlineVariant,
                    ),
            )
        }
    }
}

// ── Step 1: Welcome ──────────────────────────────────────────────────────────

/**
 * Welcome step with app logo placeholder, tagline, and "Get Started" button.
 */
@Composable
fun WelcomeStep(
    onGetStarted: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
    ) {
        // App logo placeholder
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer)
                .semantics { contentDescription = "Finance app logo" },
        ) {
            Text(
                text = "F",
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Welcome to Finance",
            style = MaterialTheme.typography.headlineLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Track spending, set budgets, and reach your financial goals — all in one place.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription =
                    "Track spending, set budgets, and reach your financial goals — all in one place."
            },
        )

        Spacer(modifier = Modifier.height(48.dp))

        Button(
            onClick = onGetStarted,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics { contentDescription = "Get Started button. Begins onboarding setup." },
        ) {
            Text("Get Started", style = MaterialTheme.typography.labelLarge)
        }
    }
}

// ── Step 2: Path Selection ────────────────────────────────────────────────────

/**
 * Path selection step — the user chooses between quick-start and personalized setup.
 *
 * Presented as two visually distinct cards:
 * - **"Just let me in"** — applies sensible defaults and enters the app instantly.
 * - **"Set things up my way"** — walks through currency, account, and budget steps.
 *
 * Both options are presented without pressure or dark patterns — neither path is
 * labeled "recommended" or visually pushed.
 */
@Composable
fun PathSelectionStep(
    onQuickStart: () -> Unit,
    onPersonalized: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(
            text = "How would you like to start?",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "You can always change everything later in settings.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "You can always change everything later in settings."
            },
        )

        Spacer(modifier = Modifier.height(32.dp))

        // ── Quick Start card ─────────────────────────────────────────
        PathOptionCard(
            title = "Just let me in",
            description = "Start with sensible defaults. You can customize currency, accounts, and budgets any time.",
            icon = "⚡",
            iconDescription = "Lightning bolt icon",
            onClick = onQuickStart,
            contentDescription = "Quick start. Start with sensible defaults and enter the app immediately.",
        )

        Spacer(modifier = Modifier.height(16.dp))

        // ── Personalized Setup card ──────────────────────────────────
        PathOptionCard(
            title = "Set things up my way",
            description = "Pick your currency, create your first account, and set a budget — takes about a minute.",
            icon = "🎯",
            iconDescription = "Target icon",
            onClick = onPersonalized,
            contentDescription = "Personalized setup. Pick your currency, create your first account, and set a budget.",
        )
    }
}

/**
 * A tappable card representing one of the two onboarding paths.
 */
@Composable
private fun PathOptionCard(
    title: String,
    description: String,
    icon: String,
    iconDescription: String,
    onClick: () -> Unit,
    contentDescription: String,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(16.dp)
    Card(
        onClick = onClick,
        shape = shape,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = modifier
            .fillMaxWidth()
            .semantics { this.contentDescription = contentDescription },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(20.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .semantics { this.contentDescription = iconDescription },
            ) {
                Text(
                    text = icon,
                    style = MaterialTheme.typography.titleLarge,
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ── Step 3: Currency ─────────────────────────────────────────────────────────

/**
 * Currency selection step showing a grid of common currencies.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CurrencyStep(
    currencies: List<CurrencyOption>,
    selectedCurrency: CurrencyOption,
    onCurrencySelected: (CurrencyOption) -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(
            text = "What currency do you use?",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "You can change this later in settings.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "You can change this later in settings."
            },
        )

        Spacer(modifier = Modifier.height(24.dp))

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.selectableGroup(),
        ) {
            currencies.forEach { currency ->
                val isSelected = currency == selectedCurrency
                CurrencyChip(
                    currency = currency,
                    isSelected = isSelected,
                    onClick = { onCurrencySelected(currency) },
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics { contentDescription = "Continue to next step" },
        ) {
            Text("Continue")
        }
    }
}

/**
 * Individual selectable currency chip.
 */
@Composable
private fun CurrencyChip(
    currency: CurrencyOption,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(12.dp)
    val borderColor = if (isSelected) MaterialTheme.colorScheme.primary
    else MaterialTheme.colorScheme.outlineVariant
    val bgColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer
    else Color.Transparent

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(shape)
            .border(width = 1.dp, color = borderColor, shape = shape)
            .background(bgColor)
            .selectable(
                selected = isSelected,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics {
                contentDescription = "${currency.name} (${currency.code})"
                stateDescription = if (isSelected) "Selected" else "Not selected"
            },
    ) {
        Text(
            text = currency.symbol,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(text = currency.code, style = MaterialTheme.typography.bodyMedium)
    }
}

// ── Step 3: First Account ────────────────────────────────────────────────────

/**
 * First account creation step: name, type, starting balance.
 */
@Composable
fun FirstAccountStep(
    accountName: String,
    onAccountNameChange: (String) -> Unit,
    accountType: OnboardingAccountType,
    onAccountTypeChange: (OnboardingAccountType) -> Unit,
    startingBalance: String,
    onStartingBalanceChange: (String) -> Unit,
    currencySymbol: String,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(
            text = "Set up your first account",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "This is usually your main checking or savings account.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "This is usually your main checking or savings account."
            },
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Account name
        OutlinedTextField(
            value = accountName,
            onValueChange = onAccountNameChange,
            label = { Text("Account name") },
            placeholder = { Text("e.g. My Checking") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Account name input field" },
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Account type chips
        Text(
            text = "Account type",
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.semantics { contentDescription = "Account type selection" },
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.selectableGroup(),
        ) {
            OnboardingAccountType.entries.forEach { type ->
                FilterChip(
                    selected = type == accountType,
                    onClick = { onAccountTypeChange(type) },
                    label = { Text(type.label) },
                    leadingIcon = if (type == accountType) {
                        {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    } else null,
                    modifier = Modifier.semantics {
                        contentDescription = "${type.label} account type"
                        stateDescription = if (type == accountType) "Selected" else "Not selected"
                    },
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Starting balance
        OutlinedTextField(
            value = startingBalance,
            onValueChange = onStartingBalanceChange,
            label = { Text("Starting balance") },
            placeholder = { Text("0.00") },
            prefix = { Text(currencySymbol) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription =
                        "Starting balance input field in $currencySymbol"
                },
        )

        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics { contentDescription = "Continue to next step" },
        ) {
            Text("Continue")
        }
    }
}

// ── Step 4: First Budget ─────────────────────────────────────────────────────

/**
 * First budget step: "How much do you want to spend on groceries this month?"
 */
@Composable
fun FirstBudgetStep(
    budgetCategory: String,
    budgetAmount: String,
    onBudgetAmountChange: (String) -> Unit,
    currencySymbol: String,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(
            text = "Set your first budget",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "How much do you want to spend on $budgetCategory this month?",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription =
                    "How much do you want to spend on $budgetCategory this month?"
            },
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Budget category display
        OutlinedTextField(
            value = budgetCategory,
            onValueChange = {}, // read-only for now — defaults to "Groceries"
            label = { Text("Category") },
            readOnly = true,
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Budget category: $budgetCategory"
                },
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Budget amount
        OutlinedTextField(
            value = budgetAmount,
            onValueChange = onBudgetAmountChange,
            label = { Text("Monthly budget") },
            placeholder = { Text("0.00") },
            prefix = { Text(currencySymbol) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription =
                        "Monthly budget amount input field in $currencySymbol"
                },
        )

        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onNext,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics { contentDescription = "Continue to final step" },
        ) {
            Text("Continue")
        }
    }
}

// ── Step 5: Done ─────────────────────────────────────────────────────────────

/**
 * Completion step with a summary of what was set up and a "Done" button.
 */
@Composable
fun DoneStep(
    state: OnboardingUiState,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
    ) {
        // Checkmark icon
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(80.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer)
                .semantics { contentDescription = "Setup complete checkmark" },
        ) {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(40.dp),
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "You're all set!",
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Summary of what was created
        SummaryCard(state)

        Spacer(modifier = Modifier.height(48.dp))

        Button(
            onClick = onDone,
            enabled = !state.isSaving,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics {
                    contentDescription = "Finish onboarding and enter the app"
                },
        ) {
            if (state.isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Done", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/**
 * Summary card showing what was created during onboarding.
 */
@Composable
private fun SummaryCard(
    state: OnboardingUiState,
    modifier: Modifier = Modifier,
) {
    val accountName = state.accountName.ifBlank { "My Account" }
    val balance = state.startingBalance.ifBlank { "0.00" }
    val budgetAmt = state.budgetAmount.ifBlank { "0.00" }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(20.dp)
            .semantics {
                contentDescription = "Setup summary: " +
                    "Currency ${state.selectedCurrency.name}, " +
                    "Account $accountName with ${state.selectedCurrency.symbol}$balance balance, " +
                    "${state.budgetCategory} budget of ${state.selectedCurrency.symbol}$budgetAmt per month"
            },
    ) {
        SummaryRow(label = "Currency", value = "${state.selectedCurrency.name} (${state.selectedCurrency.code})")
        Spacer(modifier = Modifier.height(12.dp))
        SummaryRow(label = "Account", value = "$accountName · ${state.accountType.label}")
        Spacer(modifier = Modifier.height(12.dp))
        SummaryRow(label = "Balance", value = "${state.selectedCurrency.symbol}$balance")
        Spacer(modifier = Modifier.height(12.dp))
        SummaryRow(
            label = "Budget",
            value = "${state.selectedCurrency.symbol}$budgetAmt/mo · ${state.budgetCategory}",
        )
    }
}

@Composable
private fun SummaryRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

// ── Reduced motion helper ────────────────────────────────────────────────────

/**
 * Returns `true` when the system has requested reduced motion (accessibility setting).
 * Animations should be disabled or shortened when this returns `true`.
 */
@Composable
private fun isReducedMotionEnabled(): Boolean {
    // LocalAccessibilityManager is nullable; when non-null we query the
    // platform's reduced-motion / animation-scale preference. The Compose
    // accessibility manager exposes this via
    // AccessibilityManager.calculateRecommendedTimeoutMillis — a non-zero
    // original value returning a *larger* value indicates the system requests
    // longer/no animations. We use a simpler heuristic: if an accessibility
    // manager is active we respect it, but the actual flag is checked via the
    // platform's Settings.Global.ANIMATOR_DURATION_SCALE at the Activity level.
    // For Compose, the recommended approach is to check
    // `motionScheme` or the accessibility manager's presence.
    val accessibilityManager = LocalAccessibilityManager.current
    return accessibilityManager?.calculateRecommendedTimeoutMillis(
        originalTimeoutMillis = 0,
        containsIcons = false,
        containsText = false,
        containsControls = false,
    ) != 0L
}

// ── Previews ─────────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Step 1 — Welcome")
@Composable
private fun WelcomeStepPreview() {
    MaterialTheme {
        WelcomeStep(onGetStarted = {})
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Step 2 — Path Selection")
@Composable
private fun PathSelectionStepPreview() {
    MaterialTheme {
        PathSelectionStep(
            onQuickStart = {},
            onPersonalized = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Step 3 — Currency")
@Composable
private fun CurrencyStepPreview() {
    MaterialTheme {
        CurrencyStep(
            currencies = CurrencyOption.defaults,
            selectedCurrency = CurrencyOption.defaults.first(),
            onCurrencySelected = {},
            onNext = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Step 4 — First Account")
@Composable
private fun FirstAccountStepPreview() {
    MaterialTheme {
        FirstAccountStep(
            accountName = "My Checking",
            onAccountNameChange = {},
            accountType = OnboardingAccountType.CHECKING,
            onAccountTypeChange = {},
            startingBalance = "1500.00",
            onStartingBalanceChange = {},
            currencySymbol = "$",
            onNext = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Step 5 — First Budget")
@Composable
private fun FirstBudgetStepPreview() {
    MaterialTheme {
        FirstBudgetStep(
            budgetCategory = "Groceries",
            budgetAmount = "400.00",
            onBudgetAmountChange = {},
            currencySymbol = "$",
            onNext = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Step 6 — Done")
@Composable
private fun DoneStepPreview() {
    MaterialTheme {
        DoneStep(
            state = OnboardingUiState(
                currentStep = 6,
                selectedPath = OnboardingPath.PERSONALIZED,
                selectedCurrency = CurrencyOption.defaults.first(),
                accountName = "My Checking",
                accountType = OnboardingAccountType.CHECKING,
                startingBalance = "1500.00",
                budgetCategory = "Groceries",
                budgetAmount = "400.00",
            ),
            onDone = {},
        )
    }
}
