// SPDX-License-Identifier: BUSL-1.1

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.compose.multiplatform)
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

    // DI — Koin (core only, no Android dependency)
    implementation(libs.koin.core)
}

compose.desktop {
    application {
        mainClass = "com.finance.desktop.MainKt"
        nativeDistributions {
            targetFormats(
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Exe,
            )
            packageName = "Finance"
            packageVersion = "1.0.0"
            description = "Personal finance tracker — budgets, accounts, and investments in one place."
            vendor = "Finance App"
            windows {
                menuGroup = "Finance"
                upgradeUuid = "d3b07384-d9a3-4e6b-af4a-3b6e2d5c1f8a"
                shortcut = true
                menu = true
                perUserInstall = true
                dirChooser = true
            }
        }
    }
}
