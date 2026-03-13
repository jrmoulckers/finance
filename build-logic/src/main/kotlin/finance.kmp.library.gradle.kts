// SPDX-License-Identifier: BUSL-1.1

import com.android.build.gradle.LibraryExtension

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("org.jetbrains.kotlinx.kover")
}

// Only configure Android targets when the SDK is available
val androidSdkAvailable = providers.environmentVariable("ANDROID_HOME").isPresent ||
    providers.environmentVariable("ANDROID_SDK_ROOT").isPresent ||
    rootProject.file("local.properties").let { f ->
        f.exists() && f.readText().contains("sdk.dir")
    }

project.extra["androidSdkAvailable"] = androidSdkAvailable

if (androidSdkAvailable) {
    apply(plugin = "com.android.library")
}

kotlin {
    // Auto-provision JDK 21 — no manual JAVA_HOME setup needed
    jvmToolchain(21)

    // JVM target (Desktop / server)
    jvm()

    // Android target (requires SDK)
    if (androidSdkAvailable) {
        androidTarget()
    }

    // iOS targets
    iosArm64()
    iosSimulatorArm64()
    iosX64()

    // JS target (browser)
    js(IR) {
        browser()
    }

    // Hierarchical source set structure
    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(libs.findLibrary("kotlinx-coroutines-core").get())
        }

        commonTest.dependencies {
            implementation(libs.findLibrary("kotlin-test").get())
        }
    }
}

if (androidSdkAvailable) {
    extensions.configure<LibraryExtension> {
        val androidCompileSdk = libs.findVersion("android-compileSdk").get().toString().toInt()
        val androidMinSdk = libs.findVersion("android-minSdk").get().toString().toInt()

        compileSdk = androidCompileSdk
        namespace = "com.finance.${project.name}"

        defaultConfig {
            minSdk = androidMinSdk
        }

        compileOptions {
            sourceCompatibility = JavaVersion.VERSION_21
            targetCompatibility = JavaVersion.VERSION_21
        }
    }
}

private val libs: VersionCatalog
    get() = project.extensions
        .getByType<VersionCatalogsExtension>()
        .named("libs")
