# Android E2E Test Framework

## Overview

End-to-end instrumented tests for the Finance Android app using
Jetpack Compose UI Testing APIs. Tests launch the full app with a
pre-authenticated session and exercise real navigation, screen
rendering, and user interaction flows.

All tests run against in-memory repositories with no network,
Supabase, or PowerSync dependencies.

## Architecture

    e2e/
    +-- BaseE2ETest.kt                <- Abstract base with createAndroidComposeRule
    +-- AddTransactionJourneyTest.kt   <- Transaction creation wizard flow
    +-- SetBudgetJourneyTest.kt        <- Budget creation flow
    +-- TrackGoalJourneyTest.kt        <- Goal creation and tracking flow
    +-- SignInFlowJourneyTest.kt       <- Authentication state and sign-in flow
    +-- AccountCreationE2ETest.kt      <- Account create flow tests
    +-- NavigationE2ETest.kt           <- Bottom-nav destination tests
    +-- DashboardE2ETest.kt            <- Dashboard summary tests
    +-- fake/
    |   +-- FakeTokenStorage.kt        <- Pre-authenticated token storage
    |   +-- UnauthenticatedTokenStorage.kt <- Unauthenticated token storage
    |   +-- E2ETestModule.kt           <- Koin module with fake auth
    |   +-- E2EUnauthenticatedModule.kt <- Koin module for login screen tests
    |   +-- E2ESyncModule.kt           <- Koin module with in-memory sync
    +-- robot/
    |   +-- AccountRobot.kt            <- Account screen interactions
    |   +-- AuthRobot.kt               <- Authentication screen interactions
    |   +-- BudgetRobot.kt             <- Budget screen interactions
    |   +-- DashboardRobot.kt          <- Dashboard assertions
    |   +-- GoalRobot.kt               <- Goal screen interactions
    |   +-- NavigationRobot.kt         <- Bottom-nav interactions
    |   +-- TransactionRobot.kt        <- Transaction wizard interactions
    +-- runner/
        +-- E2ETestRunner.kt           <- Custom AndroidJUnitRunner
        +-- E2ETestApplication.kt      <- Test Application with fake Koin

## Critical User Journeys

The framework covers 5 critical user journeys:

1. **Create Account** — Dashboard → Accounts → FAB → form → save → verify
2. **Add Transaction** — Dashboard → FAB → 3-step wizard → save
3. **Set Budget** — Dashboard → Planning → Budgets → FAB → form → save
4. **Track Goal** — Dashboard → Planning → Goals → FAB → form → save
5. **Sign-In Flow** — Auth state verification, navigation gating, Settings access

## Running Locally

    # Run all instrumented tests (requires emulator or device)
    ./gradlew :apps:android:connectedAndroidTest

    # Run only E2E tests
    ./gradlew :apps:android:connectedAndroidTest \
      -Pandroid.testInstrumentationRunnerArguments.package=com.finance.android.e2e

## Adding New Test Journeys

1. Create a Robot class in robot/ for the screen under test.
2. Add high-level methods (tap, enter, assert) to the robot.
3. Create a test class extending BaseE2ETest.
4. Use robots for interactions; assert on contentDescription.

## Robot Pattern Conventions

- Robots encapsulate UI mechanics (selectors, waits, clicks).
- Test methods read like user stories.
- One robot per screen or feature area.
- Assertions on accessibility labels ensure TalkBack parity.

## Test Naming

Follow actionOrState_condition_expectedResult:

- dashboard_showsNetWorthCard
- createAccount_withValidData_showsInList
- navigateToAccounts_displaysAccountsScreen
- createTransaction_fullWizard_completesSuccessfully
- createBudget_withCategoryAndAmount_showsInList
- authenticatedSession_skipLogin_showsDashboard

## Fake Infrastructure

- **FakeTokenStorage**: Pre-populates a valid auth session so tests
  skip the login screen and interact with the authenticated surface.
- **UnauthenticatedTokenStorage**: Starts with no session to test the
  login screen UI.
- **E2ESyncModule**: Provides in-memory sync config, mutation queue,
  and sequence tracker — no PowerSync or network calls.
- **appModule** provides in-memory repository implementations for all
  data operations (accounts, transactions, budgets, goals, categories).
