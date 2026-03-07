# Windows Development Setup

This guide walks you through setting up the Finance app for Windows desktop development using Compose Desktop (JVM).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| JDK | 21 | [Adoptium Temurin](https://adoptium.net/) recommended |
| IntelliJ IDEA | Latest stable | Community or Ultimate; [VS Code](https://code.visualstudio.com/) with Kotlin plugin also works |
| Git | 2.40+ | [Download](https://git-scm.com/download/win) |

Ensure `JAVA_HOME` is set and on your `PATH`:

```powershell
# PowerShell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21"
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", $env:JAVA_HOME, "User")
```

Verify with:

```powershell
java -version   # Should show 21.x
```

## Running the App

From the repository root:

```powershell
./gradlew :apps:windows:run
```

This compiles the Compose Desktop app and launches it. The first build downloads dependencies and may take several minutes.

## Packaging as MSI

To produce a Windows installer:

```powershell
./gradlew :apps:windows:packageMsi
```

The MSI is output to `apps/windows/build/compose/binaries/main/msi/`. You can install and test it locally like any standard Windows application.

## Debugging with IntelliJ

1. Open the repository root in **IntelliJ IDEA**.
2. Wait for Gradle import to complete.
3. Navigate to `apps/windows/src/` and find the main entry point.
4. Click the **gutter icon** next to `fun main()` and select **Debug**.
5. Set breakpoints in `apps/windows/` or in shared KMP code under `packages/*/src/commonMain/` — the JVM debugger supports both.

> **Tip:** Use the IntelliJ Kotlin plugin's "Evaluate Expression" feature to inspect financial model objects at runtime.

## Common Issues

### `JAVA_HOME` is not set or points to the wrong version

**Symptom:** Gradle fails with "Unsupported class file major version" or cannot find `java`.

**Fix:** Set `JAVA_HOME` to a JDK 21 installation (see Prerequisites). Restart your terminal or IDE after changing environment variables.

### Windows Defender slows builds

**Symptom:** Gradle builds are significantly slower on Windows than on macOS or Linux.

**Fix:** Add exclusions for the repository directory and the Gradle cache:

```powershell
# Run as Administrator
Add-MpExclusion -Path "G:\personal\finance"
Add-MpExclusion -Path "$env:USERPROFILE\.gradle"
```

This prevents real-time scanning of build artifacts and dramatically improves build times.

### Gradle daemon crashes or hangs

**Symptom:** Build stalls or fails with `OutOfMemoryError`.

**Fix:** Increase the Gradle daemon heap in `gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4g -XX:+HeapDumpOnOutOfMemoryError
```

Then stop existing daemons and rebuild:

```powershell
./gradlew --stop
./gradlew :apps:windows:run
```
