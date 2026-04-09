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
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.json)
            implementation(libs.ktor.client.auth)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.turbine)
        }
    }
}
