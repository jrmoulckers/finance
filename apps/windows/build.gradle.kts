// SPDX-License-Identifier: BUSL-1.1

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.compose.multiplatform)
}

dependencies {
    // KMP shared modules
    implementation(project(":packages:models"))
    implementation(project(":packages:core"))

    // Compose Desktop
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)

    // Coroutines
    implementation(libs.kotlinx.coroutines.core)

    // Date/time utilities
    implementation(libs.kotlinx.datetime)

    // DI — Koin (core only, no Android dependency)
    implementation(libs.koin.core)
}

compose.desktop {
    application {
        mainClass = "com.finance.desktop.MainKt"
        nativeDistributions {
            targetFormats(org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi)
            packageName = "Finance"
            packageVersion = "1.0.0"
        }
    }
}
