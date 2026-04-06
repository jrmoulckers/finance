# Android E2E Test Framework

## Overview

End-to-end instrumented tests for the Finance Android app using
Jetpack Compose UI Testing APIs. Tests launch the full app with a
pre-authenticated session and exercise real navigation, screen
rendering, and user interaction flows.

## Architecture

    e2e/
    +-- BaseE2ETest.kt            <- Abstract base with createAndroidComposeRule
    +-- NavigationE2ETest.kt      <- Bottom-nav destination tests
    +-- AccountCreationE2ETest.kt  <- Account create flow tests
    +-- DashboardE2ETest.kt       <- Dashboard summary tests
    +-- fake/
    |   +-- FakeTokenStorage.kt   <- Pre-authenticated token storage
    |   +-- E2ETestModule.kt      <- Koin module with fake auth
    +-- robot/
    |   +-- NavigationRobot.kt    <- Bottom-nav interactions
    |   +-- DashboardRobot.kt     <- Dashboard assertions
    |   +-- AccountRobot.kt       <- Account screen interactions
    +-- runner/
        +-- E2ETestRunner.kt      <- Custom AndroidJUnitRunner
        +-- E2ETestApplication.kt <- Test Application with fake Koin

## Running Locally

    # Run all instrumented tests (requires emulator or device)
    ./gradlew :apps:android:connectedAndroidTest

    # Run only E2E tests
    ./gradlew :apps:android:connectedAndroidTest \\
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
