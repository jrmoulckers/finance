# KMP Debugging Guide

This guide covers how to debug Kotlin Multiplatform (KMP) shared code in the Finance monorepo. The shared modules live in `packages/` (`core`, `models`, `sync`) and compile to multiple targets — Android, iOS, JVM (desktop), JS, and Wasm.

## Table of Contents

- [Debugging commonMain from Android Studio](#debugging-commonmain-from-android-studio)
- [Debugging KMP Tests](#debugging-kmp-tests)
- [Attaching the Debugger to a Running Android App](#attaching-the-debugger-to-a-running-android-app)
- [VS Code Kotlin Debugging Setup](#vs-code-kotlin-debugging-setup)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

## Debugging commonMain from Android Studio

Android Studio is the recommended IDE for debugging KMP shared code. Because the Android target compiles `commonMain` as regular Kotlin/JVM bytecode, breakpoints in shared code work out of the box when running on an Android device or emulator.

### Setting Breakpoints

1. Open the project root (e.g., `C:\dev\finance`) in Android Studio
2. Navigate to any file under `packages/core/src/commonMain/`, `packages/models/src/commonMain/`, or `packages/sync/src/commonMain/`
3. Click the gutter (left margin) next to a line to set a breakpoint — a red dot appears
4. Select the `apps:android` run configuration and click **Debug** (bug icon, or **Shift+F9**)
5. When execution reaches your breakpoint, the debugger pauses and shows the stack trace, variables, and watches

### Tips for Effective Breakpoints

- **Conditional breakpoints** — Right-click a breakpoint → add a condition (e.g., `amount > 10000L`) to pause only on specific values
- **Log breakpoints** — Right-click → uncheck "Suspend" and add a log expression. The message prints to the Debug console without pausing execution
- **Exception breakpoints** — Go to **Run → View Breakpoints** (Ctrl+Shift+F8) and add a Kotlin Exception Breakpoint to catch thrown exceptions automatically

### Source Set Awareness

Android Studio resolves `commonMain` code through the `androidMain` compilation path. If a function uses `expect`/`actual` declarations, the debugger steps into the `androidMain` actual implementation when running on Android. To debug a different platform's `actual`, use that platform's toolchain (see [Known Limitations](#known-limitations)).

## Debugging KMP Tests

### Running Tests with the Debugger

KMP tests in `commonTest` can run on any configured target. To debug:

**JVM target (fastest feedback loop):**

```bash
# Run all tests on JVM
./gradlew :packages:core:jvmTest

# Run a specific test class
./gradlew :packages:core:jvmTest --tests "com.finance.core.BudgetEngineTest"
```

In Android Studio, right-click any test class or function in `commonTest` and select **Debug**. The IDE runs it on the JVM target by default.

**Android target (instrumented):**

```bash
./gradlew :packages:core:connectedAndroidTest
```

This requires a connected device or running emulator.

### Debugging Flow-Based Tests

The project uses [Turbine](https://github.com/cashapp/turbine) (v1.2.0) for testing `Flow` emissions. Set breakpoints inside `test { }` blocks to inspect emitted items:

```kotlin
@Test
fun budgetEmitsUpdatedBalance() = runTest {
    val flow = budgetEngine.observeBalance(budgetId)
    flow.test {
        val first = awaitItem()          // ← breakpoint here
        assertEquals(Money(50000L, USD), first)
        cancelAndIgnoreRemainingEvents()
    }
}
```

**Tip:** If a Turbine test times out, increase the timeout with `test(timeout = 5.seconds)` rather than removing the assertion.

## Attaching the Debugger to a Running Android App

If the Finance app is already running on a device or emulator, you can attach the debugger without restarting:

1. Ensure the app was built as a **debuggable** variant (`debug` build type — the default for development)
2. In Android Studio, go to **Run → Attach Debugger to Android Process** (or click the "attach" icon in the toolbar)
3. Select the `com.finance.android` process from the list
4. Set breakpoints in `commonMain` or `androidMain` — they activate immediately

This is useful when reproducing a bug that requires specific app state (e.g., navigating to a particular screen before the issue occurs).

### Debugging Coroutines

Enable the coroutines debugger for better async inspection:

1. Go to **Settings → Build, Execution, Deployment → Debugger → Data Views → Kotlin**
2. Check **"Enable coroutine debugging"**
3. The **Coroutines** tab in the Debug window shows all active coroutines, their state (running, suspended, created), and the suspension point

## VS Code Kotlin Debugging Setup

VS Code can debug KMP code on the JVM target using the [Kotlin extension](https://marketplace.visualstudio.com/items?itemName=fwcd.kotlin) by fwcd.

### Prerequisites

- **Kotlin extension** (`fwcd.kotlin`) installed in VS Code
- **JDK 21** on your PATH (the project's `jvmToolchain(21)` setting handles Gradle builds, but the extension needs a local JDK for the language server)
- **Gradle** accessible (the included `gradlew` / `gradlew.bat` wrapper works)

### Launch Configuration

Add this to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "kotlin",
      "request": "launch",
      "name": "Debug KMP Tests (JVM)",
      "projectRoot": "${workspaceFolder}/packages/core",
      "mainClass": "",
      "preLaunchTask": "gradle: :packages:core:jvmTest"
    }
  ]
}
```

### Limitations of VS Code Debugging

- The Kotlin language server has limited KMP support — `expect`/`actual` resolution can be unreliable
- Breakpoints work in `commonMain` and `jvmMain` but not in platform-specific source sets (iOS, JS)
- Hot-reload is not supported — you must restart the debug session after code changes
- For serious KMP debugging, Android Studio or IntelliJ IDEA is strongly recommended

## Known Limitations

| Scenario | Limitation | Workaround |
|----------|-----------|------------|
| **iOS debugging** | Requires Xcode with LLDB; Android Studio cannot debug Kotlin/Native on iOS | Use Xcode to debug the iOS framework — see [iOS setup guide](./ios-setup.md) |
| **JS target debugging** | Kotlin/JS generates JavaScript; breakpoints must be set in browser DevTools | Use Chrome DevTools with source maps (`--source-map` enabled by default in IR compiler) |
| **Wasm target** | DWARF debugging for Kotlin/Wasm is experimental | Use `println` / logging; browser DevTools Wasm debugging is evolving |
| **`expect`/`actual` stepping** | Debugger cannot step from `commonMain` into a different target's `actual` in one session | Debug each platform's `actual` in its native toolchain |
| **Compose Preview** | Compose Multiplatform previews are not debuggable | Use `@Preview` in `androidMain` with Android Studio's interactive preview |

## Troubleshooting

### "Source not found" when hitting a breakpoint

The debugger cannot locate `commonMain` sources. Ensure you opened the **root project** (e.g., `C:\dev\finance`) in Android Studio, not a submodule. The Gradle composite build must resolve all `:packages:*` modules.

### Breakpoint shows as grey / unresolved

- Verify the file is in a source set that compiles for your target (e.g., `commonMain` or `androidMain` for Android debugging)
- Run **Build → Rebuild Project** to ensure class files are up to date
- Check that ProGuard/R8 is not stripping the code in release builds — use the `debug` build variant

### Tests pass in CLI but fail in debugger

The debugger runs on the JVM target by default. If your test depends on platform-specific `actual` implementations that differ between JVM and Android, results may vary. Run `./gradlew :packages:core:connectedAndroidTest` to test on the Android target specifically.

### Coroutines tab is empty

Enable coroutine debugging in **Settings → Debugger → Data Views → Kotlin**. Also ensure you are using `kotlinx-coroutines-core` 1.9.0+ (the version in `libs.versions.toml`), which includes the debug agent.
