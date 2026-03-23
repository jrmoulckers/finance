// SPDX-License-Identifier: BUSL-1.1

import org.jetbrains.kotlin.gradle.plugin.mpp.Framework
import org.jetbrains.kotlin.gradle.plugin.mpp.KotlinNativeTarget

plugins {
    id("finance.kmp.library")
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    // Export models through the FinanceCore iOS framework so model types
    // are visible to Swift consumers without a separate import.
    targets.withType<KotlinNativeTarget> {
        binaries.withType<Framework> {
            export(project(":packages:models"))
        }
    }

    sourceSets {
        commonMain.dependencies {
            // api — re-exported to iOS framework consumers via export() above
            api(project(":packages:models"))
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.kotlinx.coroutines.core)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.turbine)
        }
    }
}
