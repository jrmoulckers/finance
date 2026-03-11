// SPDX-License-Identifier: BUSL-1.1

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.finance.android"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.finance.android"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = "21"
    }
}

dependencies {
    // KMP shared modules
    implementation(project(":packages:core"))
    implementation(project(":packages:models"))
    implementation(project(":packages:sync"))

    // Compose BOM — manages all Compose library versions
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)

    // Compose / Material 3
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material.icons.extended)

    // Activity & Navigation
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)

    // Lifecycle (ViewModel + runtime for Compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)

    // AndroidX Core
    implementation(libs.core.ktx)

    // DI — Koin
    implementation(libs.koin.android)
    implementation(libs.koin.compose.viewmodel)

    // Logging
    implementation(libs.timber)

    // Security & Biometric
    implementation(libs.biometric)
    implementation(libs.security.crypto)

    // WorkManager — scheduled notifications
    implementation(libs.work.runtime)

    // Debug tooling
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)
}
