// SPDX-License-Identifier: BUSL-1.1

import org.jetbrains.kotlin.gradle.plugin.mpp.Framework
import org.jetbrains.kotlin.gradle.plugin.mpp.KotlinNativeTarget

plugins {
    id("finance.kmp.library")
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    // Export models and core through the FinanceSync iOS framework so the iOS app
    // only needs a single import to access all shared KMP types.
    targets.withType<KotlinNativeTarget> {
        binaries.withType<Framework> {
            export(project(":packages:models"))
            export(project(":packages:core"))
        }
    }

    sourceSets {
        commonMain.dependencies {
            // api — re-exported to iOS framework consumers via export() above
            api(project(":packages:models"))
            api(project(":packages:core"))
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.ktor.client.core)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.turbine)
        }
    }
}

// Conditionally add Android-specific dependency for EncryptedSharedPreferences.
// The androidMain source set only exists when the Android SDK is available
// (controlled by the finance.kmp.library convention plugin).
if (project.extra.has("androidSdkAvailable") && project.extra["androidSdkAvailable"] == true) {
    kotlin.sourceSets.getByName("androidMain").dependencies {
        implementation(libs.security.crypto)
    }
}
