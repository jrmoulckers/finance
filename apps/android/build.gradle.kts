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

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

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
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(libs.compose.ui.test.junit4)
}
