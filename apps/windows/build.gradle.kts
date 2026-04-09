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
            targetFormats(org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi)
            packageName = "Finance"
            packageVersion = "1.0.0"
        }
    }
}
