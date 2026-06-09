// SPDX-License-Identifier: BUSL-1.1

import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.paparazzi)
}

// ── Keystore properties ──────────────────────────────────────────
// Load signing credentials from keystore.properties (local dev) or fall
// back to gradle.properties / environment variables (CI).
// Copy keystore.properties.template → keystore.properties and fill in values.
val keystorePropertiesFile = rootProject.file("apps/android/keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
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

        testInstrumentationRunner = "com.finance.android.e2e.runner.E2ETestRunner"

        // PowerSync endpoint — override via gradle.properties or CI environment.
        // e.g. -PPOWERSYNC_URL=https://your-instance.powersync.journeyapps.com
        buildConfigField(
            "String",
            "POWERSYNC_URL",
            "\"${project.findProperty("POWERSYNC_URL") ?: "https://placeholder.powersync.journeyapps.com"}\"",
        )

        // Supabase project URL — override via gradle.properties or CI environment.
        // e.g. -PSUPABASE_URL=https://your-project.supabase.co
        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"${project.findProperty("SUPABASE_URL") ?: "https://placeholder.supabase.co"}\"",
        )
    }

    // ── Release signing ─────────────────────────────────────────────
    // Credentials are read from keystore.properties (local), gradle.properties,
    // or environment variables (CI). See keystore.properties.template for setup.
    signingConfigs {
        create("release") {
            // Prefer keystore.properties, fall back to gradle.properties / env vars
            val ksFile = keystoreProperties.getProperty("STORE_FILE")
                ?: project.findProperty("FINANCE_KEYSTORE_FILE") as String?
            if (ksFile != null) {
                storeFile = file(ksFile)
                storePassword = keystoreProperties.getProperty("STORE_PASSWORD")
                    ?: project.findProperty("FINANCE_KEYSTORE_PASSWORD") as String?
                keyAlias = keystoreProperties.getProperty("KEY_ALIAS")
                    ?: project.findProperty("FINANCE_KEY_ALIAS") as String?
                keyPassword = keystoreProperties.getProperty("KEY_PASSWORD")
                    ?: project.findProperty("FINANCE_KEY_PASSWORD") as String?
            }
        }
    }

    buildTypes {
        release {
            // R8 code shrinking, obfuscation, and optimisation.
            // Security: minification + obfuscation raise the bar for
            // reverse-engineering and reduce APK attack surface.
            // See proguard-rules.pro for keep rules.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            val ksFile = keystoreProperties.getProperty("STORE_FILE")
                ?: project.findProperty("FINANCE_KEYSTORE_FILE") as String?
            if (ksFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }

        debug {
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        // Baseline captures pre-existing lint issues so they don't block CI.
        // Run `./gradlew :apps:android:updateLintBaseline` to regenerate.
        baseline = file("lint-baseline.xml")
        abortOnError = true
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

    // Date/time utilities
    implementation(libs.kotlinx.datetime)

    // SQLDelight (runtime + coroutines extensions for repository implementations)
    implementation(libs.sqldelight.runtime)
    implementation(libs.sqldelight.coroutines)
    implementation(libs.sqlcipher.android)

    // Serialization (Transaction tags JSON encoding)
    implementation(libs.kotlinx.serialization.json)

    // Compose BOM — manages all Compose library versions
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)

    // Compose / Material 3
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.icons.lucide)

    // Glance — App Widgets with Compose-like API
    implementation(libs.glance.appwidget)
    implementation(libs.glance.material3)

    // Material 3 Window Size Class (adaptive layouts)
    implementation(libs.material3.window.size)

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

    // Credential Manager — passkey authentication
    implementation(libs.credentials)
    implementation(libs.credentials.play.services.auth)

    // Custom Tabs — OAuth browser flow
    implementation(libs.browser)

    // On-device receipt OCR — ML Kit Text Recognition v2 (no server roundtrip)
    implementation(libs.mlkit.text.recognition)

    // HTTP client — Supabase Auth API calls
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.json)

    // JSON parsing for auth responses
    implementation(libs.kotlinx.serialization.json)

    // WorkManager — scheduled notifications
    implementation(libs.work.runtime)

    // Unit tests
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)

    // Debug tooling
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    // Instrumented test dependencies
    androidTestImplementation(composeBom)
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.kotlin.test)
    androidTestImplementation(libs.koin.core)
    androidTestImplementation(libs.koin.android)
    androidTestImplementation(libs.timber)
    androidTestImplementation(libs.ktor.client.core)
    androidTestImplementation(libs.ktor.client.okhttp)
    androidTestImplementation(libs.ktor.client.content.negotiation)
    androidTestImplementation(libs.ktor.serialization.json)
    androidTestImplementation(libs.kotlinx.datetime)
    androidTestImplementation(libs.kotlinx.serialization.json)
}
