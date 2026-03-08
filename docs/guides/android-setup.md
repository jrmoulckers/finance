# Android Development Setup

This guide walks you through setting up the Finance app for Android development.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Android Studio | Latest stable (Hedgehog+) | [Download](https://developer.android.com/studio) |
| JDK | 21 | Bundled with Android Studio or install separately |
| Android SDK | API 35 (Android 15) | Install via SDK Manager |
| Android Build Tools | 35.0.0+ | Install via SDK Manager |

Ensure `JAVA_HOME` points to your JDK 21 installation. Android Studio's bundled JDK works:

```bash
# macOS / Linux
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# Windows (PowerShell)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

## Opening the Project

1. Open **Android Studio** and select **Open** (not "New Project").
2. Navigate to the repository root (your clone path, e.g., `C:\dev\finance`).
3. Android Studio detects the Gradle project automatically.
4. Wait for the initial Gradle sync to complete — this downloads dependencies and may take several minutes on first run.

## Building the Debug APK

From Android Studio:

- Select the **`:apps:android`** run configuration from the toolbar dropdown.
- Click **Run ▶** or press `Shift+F10`.

From the command line:

```bash
./gradlew :apps:android:assembleDebug
```

The APK is output to `apps/android/build/outputs/apk/debug/`.

## Running on an Emulator

1. Open **Device Manager** in Android Studio (`Tools → Device Manager`).
2. Create a new virtual device:
   - **Hardware:** Pixel 7
   - **System Image:** API 35 (Android 15) — x86_64
   - **RAM:** 2048 MB minimum
3. Launch the emulator and click **Run ▶** in Android Studio.

> **Tip:** Use a Pixel 7 API 35 image for the closest match to our CI test devices.

## Debugging KMP Code

The Finance app shares business logic via Kotlin Multiplatform (KMP). To debug shared code from Android Studio:

1. Set breakpoints in files under `packages/core/src/commonMain/` or `packages/models/src/commonMain/`.
2. Run the app in **Debug** mode (`Shift+F9`).
3. Breakpoints in `commonMain` and `androidMain` source sets are hit normally — the Kotlin/JVM debugger handles both.

For logging, use the shared logging API in `packages/core` rather than `android.util.Log` directly.

## Common Issues

### `JAVA_HOME` is not set or points to the wrong version

**Symptom:** Gradle fails with "Unsupported class file major version" or "Could not determine java version."

**Fix:** Set `JAVA_HOME` to a JDK 21 installation (see Prerequisites above). Restart Android Studio after changing environment variables.

### Android SDK licenses not accepted

**Symptom:** Build fails with "You have not accepted the license agreements."

**Fix:**

```bash
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
```

Accept all licenses when prompted.

### Gradle daemon out of memory

**Symptom:** Build fails with `OutOfMemoryError` or the Gradle daemon crashes silently.

**Fix:** Increase the daemon heap size in the project's `gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4g -XX:+HeapDumpOnOutOfMemoryError
```

If the issue persists, stop all daemons and retry:

```bash
./gradlew --stop
./gradlew :apps:android:assembleDebug
```

### Emulator is slow or unresponsive

**Fix:** Enable hardware acceleration (HAXM on Intel, Hypervisor on AMD). In Android Studio, go to `SDK Manager → SDK Tools` and install "Android Emulator Hypervisor Driver."
