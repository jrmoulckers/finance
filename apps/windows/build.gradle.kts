// SPDX-License-Identifier: BUSL-1.1

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    // KMP shared modules — all business logic lives here
    implementation(project(":packages:models"))
    implementation(project(":packages:core"))
    implementation(project(":packages:sync"))

    // Compose Desktop
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)

    // Coroutines
    implementation(libs.kotlinx.coroutines.core)

    // Date/time utilities
    implementation(libs.kotlinx.datetime)

    // Serialization (transitive from KMP packages, explicit for sync payloads)
    implementation(libs.kotlinx.serialization.json)

    // HTTP client — Ktor OkHttp engine for JVM sync networking
    implementation(libs.ktor.client.okhttp)

    // Logging provider for Ktor and sync libraries on JVM/Windows
    runtimeOnly(libs.slf4j.simple)

    // DI — Koin (core only, no Android dependency)
    implementation(libs.koin.core)

    // ── Tests ──
    testImplementation(libs.kotlin.test)
}

tasks.test {
    useJUnit()
}

compose.desktop {
    application {
        mainClass = "com.finance.desktop.MainKt"

        // ── JVM arguments for production ──
        jvmArgs += listOf(
            "-Xmx512m",
            "-Dfile.encoding=UTF-8",
        )

        nativeDistributions {
            targetFormats(
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Exe,
            )
            packageName = "Finance"
            packageVersion = "1.0.0"
            description = "Personal finance tracker — budgets, accounts, and investments in one place."
            vendor = "Finance App"
            copyright = "© 2025 Finance App. All rights reserved."
            licenseFile.set(rootProject.file("LICENSE"))

            windows {
                menuGroup = "Finance"
                // Stable UUID for MSI upgrade detection across versions
                upgradeUuid = "d3b07384-d9a3-4e6b-af4a-3b6e2d5c1f8a"
                shortcut = true
                menu = true
                perUserInstall = true
                dirChooser = true
                // Icon for the application (exe and installer)
                iconFile.set(project.file("packaging/icons/finance.ico"))
                // Console is hidden in production
                console = false
            }

            // ── Application metadata for Store submission ──
            appResourcesRootDir.set(project.layout.projectDirectory.dir("packaging/resources"))

            // ── JRE modules required at runtime ──
            // The default jpackage runtime image only includes java.base / java.desktop
            // and a few others. SQLDelight's JDBC SQLite driver requires java.sql,
            // and several common JVM libraries (Netty, kotlinx-coroutines internals,
            // OkHttp's SPI lookups, JNDI-backed TLS configuration) require the modules
            // below. Without these, the app crashes on startup with
            // NoClassDefFoundError before the main window ever appears (see #1890).
            modules(
                "java.sql",        // SQLDelight JDBC SQLite driver — java.sql.DriverManager
                "java.naming",     // OkHttp / TLS SPI lookups (defensive)
                "java.management", // JMX hooks used by some Kotlin/Ktor internals (defensive)
                "jdk.unsupported", // sun.misc.Unsafe — Kotlin coroutines, Netty, etc.
            )
        }
    }
}

