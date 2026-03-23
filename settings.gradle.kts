// SPDX-License-Identifier: BUSL-1.1

@file:Suppress("UnstableApiUsage")

rootProject.name = "finance"

pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("com.gradle.develocity") version "4.3.2"
}

develocity {
    buildScan {
        termsOfUseUrl.set("https://gradle.com/help/legal-terms-of-use")
        termsOfUseAgree.set("yes")
        // Publish scans on CI, opt-in locally
        publishing.onlyIf { System.getenv("CI") != null }
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

include(":packages:core")
include(":packages:models")
include(":packages:sync")

include(":apps:windows")

// Only include Android app if SDK is available
val androidSdkAvailable = providers.environmentVariable("ANDROID_HOME").isPresent ||
    providers.environmentVariable("ANDROID_SDK_ROOT").isPresent ||
    file("local.properties").let { f ->
        f.exists() && f.readText().contains("sdk.dir")
    }

if (androidSdkAvailable) {
    include(":apps:android")
} else {
    logger.warn("⚠️ Android SDK not found — skipping :apps:android module. Set ANDROID_HOME or create local.properties with sdk.dir to enable.")
}
